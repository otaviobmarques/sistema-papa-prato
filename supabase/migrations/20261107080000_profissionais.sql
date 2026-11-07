-- A12 Profissionais: nutricionistas acompanham pacientes que os autorizam.
-- Padrões (fáceis de mudar): grátis para o profissional; CRN verificado pela equipe; o paciente decide
-- (vincula por código, escolhe compartilhar o diário e pode desfazer quando quiser). A equipe não vê diários.
create table public.profissionais (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(nome) between 5 and 80),
  crn text not null check (crn ~ '^[0-9]{3,6}$'),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  regiao_crn integer not null check (regiao_crn between 1 and 11),
  status text not null default 'pendente' check (status in ('pendente', 'verificado', 'recusado')),
  motivo text check (length(motivo) <= 200),
  codigo text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  criado_em timestamptz not null default now(),
  verificado_em timestamptz,
  verificado_por uuid references auth.users(id) on delete set null
);
alter table public.profissionais enable row level security;
create policy "profissional vê o próprio cadastro" on public.profissionais for select to authenticated using (user_id = (select auth.uid()) or (select public.eh_equipe()));

create table public.vinculos (
  paciente_id uuid not null references auth.users(id) on delete cascade,
  profissional_id uuid not null references public.profissionais(user_id) on delete cascade,
  compartilha_diario boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (paciente_id, profissional_id),
  check (paciente_id <> profissional_id)
);
alter table public.vinculos enable row level security;
create policy "paciente e profissional veem o vínculo" on public.vinculos for select to authenticated using (paciente_id = (select auth.uid()) or profissional_id = (select auth.uid()));
create policy "paciente muda o compartilhamento" on public.vinculos for update to authenticated using (paciente_id = (select auth.uid())) with check (paciente_id = (select auth.uid()));
create policy "paciente ou profissional desfazem o vínculo" on public.vinculos for delete to authenticated using (paciente_id = (select auth.uid()) or profissional_id = (select auth.uid()));

-- Profissional pede cadastro (ou corrige um recusado).
create or replace function public.profissional_cadastrar(nome text, crn text, uf text, regiao_crn integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare eu uuid := (select auth.uid()); p public.profissionais;
begin
  if eu is null then raise exception 'entre na sua conta' using errcode = '42501'; end if;
  insert into public.profissionais as x (user_id, nome, crn, uf, regiao_crn)
  values (eu, trim(nome), regexp_replace(crn, '\D', '', 'g'), upper(uf), regiao_crn)
  on conflict (user_id) do update set nome = excluded.nome, crn = excluded.crn, uf = excluded.uf, regiao_crn = excluded.regiao_crn,
    status = case when x.status = 'verificado' and x.crn = excluded.crn and x.uf = excluded.uf then 'verificado' else 'pendente' end, motivo = null
  returning * into p;
  return to_jsonb(p);
end $$;
revoke all on function public.profissional_cadastrar(text, text, text, integer) from public, anon;
grant execute on function public.profissional_cadastrar(text, text, text, integer) to authenticated;

-- Equipe aprova ou recusa (depois de conferir no site do CFN/CRN).
create or replace function public.profissional_decidir(profissional uuid, decisao text, motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  if decisao not in ('verificado', 'recusado') then raise exception 'decisão inválida'; end if;
  update public.profissionais set status = decisao, motivo = left(profissional_decidir.motivo, 200),
    verificado_em = now(), verificado_por = (select auth.uid())
  where user_id = profissional;
end $$;
revoke all on function public.profissional_decidir(uuid, text, text) from public, anon;
grant execute on function public.profissional_decidir(uuid, text, text) to authenticated;

-- Paciente vincula um profissional verificado pelo código.
create or replace function public.vincular_profissional(codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare eu uuid := (select auth.uid()); p public.profissionais;
begin
  if eu is null then raise exception 'entre na sua conta' using errcode = '42501'; end if;
  select * into p from public.profissionais x where x.codigo = upper(trim(vincular_profissional.codigo)) and x.status = 'verificado';
  if p.user_id is null then raise exception 'código não encontrado ou profissional ainda não verificado'; end if;
  if p.user_id = eu then raise exception 'você não pode se vincular a si mesmo'; end if;
  if (select count(*) from public.vinculos where paciente_id = eu) >= 3 then raise exception 'limite de 3 profissionais'; end if;
  insert into public.vinculos (paciente_id, profissional_id) values (eu, p.user_id) on conflict do nothing;
  return jsonb_build_object('nome', p.nome, 'crn', p.crn, 'uf', p.uf, 'regiao_crn', p.regiao_crn);
end $$;
revoke all on function public.vincular_profissional(text) from public, anon;
grant execute on function public.vincular_profissional(text) to authenticated;

-- Paciente vê os profissionais vinculados (nome e CRN).
create or replace function public.meus_profissionais()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.user_id, 'nome', p.nome, 'crn', p.crn, 'uf', p.uf, 'regiao_crn', p.regiao_crn,
    'compartilha_diario', v.compartilha_diario, 'desde', v.criado_em) order by v.criado_em), '[]'::jsonb)
  from public.vinculos v join public.profissionais p on p.user_id = v.profissional_id
  where v.paciente_id = (select auth.uid())
$$;
revoke all on function public.meus_profissionais() from public, anon;
grant execute on function public.meus_profissionais() to authenticated;

-- Profissional verificado vê seus pacientes com um resumo dos últimos 7 dias.
create or replace function public.meus_pacientes()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.paciente_id, 'apelido', coalesce(pf.estado->'perfil'->>'apelido', 'Paciente'), 'objetivo', pf.estado->'perfil'->>'objetivo',
    'desde', v.criado_em, 'compartilha_diario', v.compartilha_diario,
    'dias_7', case when v.compartilha_diario then (select count(*) from public.dias d where d.user_id = v.paciente_id and d.data > current_date - 7 and jsonb_array_length(d.registros) > 0) end,
    'kcal_media_7', case when v.compartilha_diario then (select round(avg(k)) from (
        select sum(coalesce((r->'n'->>'kcal')::numeric, 0)) k from public.dias d, jsonb_array_elements(d.registros) r
        where d.user_id = v.paciente_id and d.data > current_date - 7 group by d.data) x) end,
    'ultimo_registro', case when v.compartilha_diario then (select max(d.data) from public.dias d where d.user_id = v.paciente_id and jsonb_array_length(d.registros) > 0) end
  ) order by v.criado_em desc), '[]'::jsonb)
  from public.vinculos v
  join public.profissionais p on p.user_id = v.profissional_id and p.status = 'verificado'
  left join public.perfis pf on pf.user_id = v.paciente_id
  where v.profissional_id = (select auth.uid())
$$;
revoke all on function public.meus_pacientes() from public, anon;
grant execute on function public.meus_pacientes() to authenticated;

-- Diário do paciente (até 31 dias), só se ele autorizou e o profissional está verificado.
create or replace function public.diario_paciente(paciente uuid, de date, ate date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.vinculos v join public.profissionais p on p.user_id = v.profissional_id
                 where v.paciente_id = paciente and v.profissional_id = (select auth.uid()) and v.compartilha_diario and p.status = 'verificado') then
    raise exception 'sem autorização para ver este diário' using errcode = '42501';
  end if;
  if ate < de or ate - de > 31 then raise exception 'período inválido (até 31 dias)'; end if;
  return jsonb_build_object(
    'perfil', (select jsonb_build_object('apelido', estado->'perfil'->>'apelido', 'objetivo', estado->'perfil'->>'objetivo', 'dieta', estado->'perfil'->>'dieta',
                 'alergias', estado->'perfil'->'alergias', 'idade', estado->'perfil'->'idade', 'sexo', estado->'perfil'->>'sexo', 'altura', estado->'perfil'->'altura',
                 'peso', estado->'perfil'->'peso', 'atividade', estado->'perfil'->>'atividade') from public.perfis where user_id = paciente),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('data', d.data, 'registros', d.registros, 'agua', d.agua) order by d.data desc), '[]'::jsonb)
             from public.dias d where d.user_id = paciente and d.data between de and ate));
end $$;
revoke all on function public.diario_paciente(uuid, date, date) from public, anon;
grant execute on function public.diario_paciente(uuid, date, date) to authenticated;
