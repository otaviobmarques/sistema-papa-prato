-- Módulos A01, A02, A08, A09, A10, A14. A equipe vê números agregados e dados de conta
-- mascarados; nunca o diário, o perfil ou dados de saúde das pessoas.

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.papeis where user_id = (select auth.uid()) and papel = 'admin')
$$;
revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

create or replace function public.mascarar_email(e text)
returns text language sql immutable set search_path = '' as $$
  select case
    when e is null then null
    when e like '%@papaprato.invalid' then split_part(e, '@', 1) || ' (conta interna)'
    else left(split_part(e, '@', 1), 1) || '***@' || split_part(e, '@', 2) end
$$;

-- A10: uso de IA (gravado pela função da foto com o token da própria pessoa)
create table public.ia_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  em timestamptz not null default now(),
  provedor text not null check (provedor in ('claude', 'gemini', 'vertex')),
  modelo text not null,
  ok boolean not null,
  ms integer check (ms >= 0),
  tokens_entrada integer check (tokens_entrada >= 0),
  tokens_saida integer check (tokens_saida >= 0),
  erro text check (length(erro) <= 300)
);
create index ia_uso_em_idx on public.ia_uso (em desc);
create index ia_uso_user_idx on public.ia_uso (user_id);
alter table public.ia_uso enable row level security;
create policy "cada um registra o próprio uso" on public.ia_uso for insert to authenticated with check (user_id = (select auth.uid()));

-- A08: suporte
create table public.tickets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  assunto text not null check (length(assunto) between 3 and 120),
  categoria text not null default 'duvida' check (categoria in ('duvida', 'problema', 'sugestao', 'privacidade', 'conta')),
  status text not null default 'aberto' check (status in ('aberto', 'respondido', 'fechado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index tickets_user_idx on public.tickets (user_id);
create index tickets_status_idx on public.tickets (status, atualizado_em desc);
create table public.ticket_mensagens (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  da_equipe boolean not null default false,
  texto text not null check (length(texto) between 1 and 4000),
  em timestamptz not null default now()
);
create index ticket_mensagens_ticket_idx on public.ticket_mensagens (ticket_id, em);
alter table public.tickets enable row level security;
alter table public.ticket_mensagens enable row level security;

create policy "dono vê seus tickets" on public.tickets for select to authenticated using (user_id = (select auth.uid()) or (select public.eh_equipe()));
create policy "dono abre ticket" on public.tickets for insert to authenticated with check (user_id = (select auth.uid()) and status = 'aberto');
create policy "equipe atualiza ticket" on public.tickets for update to authenticated using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy "dono fecha o próprio ticket" on public.tickets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and status = 'fechado');

create policy "ver mensagens do ticket" on public.ticket_mensagens for select to authenticated using (
  (select public.eh_equipe()) or exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));
create policy "dono escreve no próprio ticket" on public.ticket_mensagens for insert to authenticated with check (
  autor_id = (select auth.uid()) and da_equipe = false and exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));
create policy "equipe responde" on public.ticket_mensagens for insert to authenticated with check (
  autor_id = (select auth.uid()) and da_equipe = true and (select public.eh_equipe()));

create or replace function public.ao_mandar_mensagem()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.tickets set status = case when new.da_equipe then 'respondido' else 'aberto' end, atualizado_em = now() where id = new.ticket_id;
  return new;
end $$;
revoke all on function public.ao_mandar_mensagem() from public, anon, authenticated;
create trigger ao_mandar_mensagem after insert on public.ticket_mensagens for each row execute function public.ao_mandar_mensagem();

-- A09: registro anônimo de exclusões de conta (só data; nada que identifique a pessoa)
create table public.exclusoes (id bigint generated always as identity primary key, em timestamptz not null default now());
alter table public.exclusoes enable row level security;
create or replace function public.apagar_minha_conta()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'não autenticado'; end if;
  insert into public.exclusoes default values;
  delete from auth.users where id = (select auth.uid());
end $$;
revoke all on function public.apagar_minha_conta() from public, anon;
grant execute on function public.apagar_minha_conta() to authenticated;

-- Funções do painel (só equipe)
create or replace function public.exigir_equipe() returns void language plpgsql stable security definer set search_path = '' as $$
begin if not public.eh_equipe() then raise exception 'acesso restrito à equipe' using errcode = '42501'; end if; end $$;
revoke all on function public.exigir_equipe() from public, anon, authenticated;

create or replace function public.painel_kpis()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return jsonb_build_object(
    'usuarios', (select count(*) from auth.users u where u.email not like '%@papaprato.invalid'),
    'novos_7d', (select count(*) from auth.users u where u.email not like '%@papaprato.invalid' and u.created_at > now() - interval '7 days'),
    'ativos_7d', (select count(distinct d.user_id) from public.dias d where d.atualizado_em > now() - interval '7 days'),
    'ativos_30d', (select count(distinct d.user_id) from public.dias d where d.atualizado_em > now() - interval '30 days'),
    'dias_registrados', (select count(*) from public.dias),
    'refeicoes_registradas', (select coalesce(sum(jsonb_array_length(d.registros)), 0) from public.dias d),
    'ia_chamadas_30d', (select count(*) from public.ia_uso i where i.em > now() - interval '30 days'),
    'ia_erros_30d', (select count(*) from public.ia_uso i where i.em > now() - interval '30 days' and not i.ok),
    'tickets_abertos', (select count(*) from public.tickets t where t.status = 'aberto'),
    'cadastros_por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', x.dia, 'n', x.n) order by x.dia), '[]'::jsonb) from (
        select (u.created_at at time zone 'America/Sao_Paulo')::date as dia, count(*) n from auth.users u
        where u.created_at > now() - interval '30 days' and u.email not like '%@papaprato.invalid' group by 1) x)
  );
end $$;

create or replace function public.painel_usuarios(busca text default '', limite int default 50)
returns table (ref text, email text, criado_em timestamptz, ultimo_acesso timestamptz, dias_com_registro bigint, tem_perfil boolean, papel text, tickets_abertos bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return query
    select left(md5(u.id::text), 8), public.mascarar_email(u.email::text), u.created_at, u.last_sign_in_at,
      (select count(*) from public.dias d where d.user_id = u.id),
      exists (select 1 from public.perfis p where p.user_id = u.id),
      (select pa.papel from public.papeis pa where pa.user_id = u.id),
      (select count(*) from public.tickets t where t.user_id = u.id and t.status <> 'fechado')
    from auth.users u
    where coalesce(busca, '') = '' or u.email ilike '%' || busca || '%' or left(md5(u.id::text), 8) = busca
    order by u.created_at desc
    limit least(greatest(limite, 1), 200);
end $$;

create or replace function public.painel_tickets(filtro text default 'abertos')
returns table (id bigint, assunto text, categoria text, status text, criado_em timestamptz, atualizado_em timestamptz, email text, ref text, mensagens bigint, ultima text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return query
    select t.id, t.assunto, t.categoria, t.status, t.criado_em, t.atualizado_em,
      public.mascarar_email(u.email::text), left(md5(t.user_id::text), 8),
      (select count(*) from public.ticket_mensagens m where m.ticket_id = t.id),
      (select left(m.texto, 160) from public.ticket_mensagens m where m.ticket_id = t.id order by m.em desc limit 1)
    from public.tickets t join auth.users u on u.id = t.user_id
    where filtro = 'todos' or (filtro = 'abertos' and t.status <> 'fechado') or t.status = filtro
    order by (t.status = 'aberto') desc, t.atualizado_em desc
    limit 200;
end $$;

create or replace function public.painel_ia(dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare inicio timestamptz := now() - make_interval(days => least(greatest(dias, 1), 365));
begin
  perform public.exigir_equipe();
  return jsonb_build_object(
    'por_provedor', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select i.provedor, i.modelo, count(*) chamadas, count(*) filter (where not i.ok) erros,
        coalesce(sum(i.tokens_entrada), 0) tokens_entrada, coalesce(sum(i.tokens_saida), 0) tokens_saida,
        percentile_disc(0.5) within group (order by i.ms) ms_p50, percentile_disc(0.95) within group (order by i.ms) ms_p95
      from public.ia_uso i where i.em > inicio group by 1, 2 order by 3 desc) x),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', x.dia, 'ok', x.ok, 'erro', x.erro) order by x.dia), '[]'::jsonb) from (
      select (i.em at time zone 'America/Sao_Paulo')::date dia, count(*) filter (where i.ok) ok, count(*) filter (where not i.ok) erro
      from public.ia_uso i where i.em > inicio group by 1) x),
    'pessoas', (select count(distinct i.user_id) from public.ia_uso i where i.em > inicio),
    'ultimos_erros', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select i.em, i.provedor, i.modelo, i.erro from public.ia_uso i where not i.ok order by i.em desc limit 10) x)
  );
end $$;

create or replace function public.painel_privacidade()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return (with ultimos as (
      select distinct on (c.user_id, c.tipo) c.user_id, c.tipo, c.valor from public.consentimentos c order by c.user_id, c.tipo, c.em desc)
    select jsonb_build_object(
      'com_termos', (select count(*) from ultimos where tipo = 'termos' and valor),
      'ia_sim', (select count(*) from ultimos where tipo = 'ia' and valor),
      'ia_nao', (select count(*) from ultimos where tipo = 'ia' and not valor),
      'novidades_sim', (select count(*) from ultimos where tipo = 'novidades' and valor),
      'novidades_nao', (select count(*) from ultimos where tipo = 'novidades' and not valor),
      'registros_consentimento', (select count(*) from public.consentimentos),
      'exclusoes_30d', (select count(*) from public.exclusoes e where e.em > now() - interval '30 days'),
      'exclusoes_total', (select count(*) from public.exclusoes),
      'tickets_privacidade', (select count(*) from public.tickets t where t.categoria = 'privacidade' and t.status <> 'fechado')));
end $$;

-- A14: equipe (só admin altera)
create or replace function public.equipe_listar()
returns table (tipo text, email text, papel text, desde timestamptz, user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return query
    select 'membro'::text, u.email::text, p.papel, p.criado_em, p.user_id from public.papeis p join auth.users u on u.id = p.user_id
    union all
    select 'convite', c.email, c.papel, null::timestamptz, null::uuid from public.convites_equipe c
      where not exists (select 1 from auth.users u join public.papeis p on p.user_id = u.id where lower(u.email) = lower(c.email))
    order by 1 desc, 2;
end $$;

create or replace function public.equipe_convidar(email_convite text, papel_convite text)
returns text language plpgsql security definer set search_path = '' as $$
declare alvo uuid;
begin
  if not public.eh_admin() then raise exception 'só administradores alteram a equipe' using errcode = '42501'; end if;
  if papel_convite not in ('admin', 'editor') then raise exception 'papel inválido'; end if;
  if email_convite !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail inválido'; end if;
  select id into alvo from auth.users where lower(email) = lower(email_convite);
  if alvo is not null then
    insert into public.papeis (user_id, papel) values (alvo, papel_convite) on conflict (user_id) do update set papel = excluded.papel;
    return 'membro';
  end if;
  insert into public.convites_equipe (email, papel) values (lower(email_convite), papel_convite) on conflict (email) do update set papel = excluded.papel;
  return 'convite';
end $$;

create or replace function public.equipe_remover(email_alvo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'só administradores alteram a equipe' using errcode = '42501'; end if;
  if lower(email_alvo) = lower((select email from auth.users where id = (select auth.uid()))) then raise exception 'você não pode remover a si mesmo'; end if;
  delete from public.papeis where user_id in (select id from auth.users where lower(email) = lower(email_alvo));
  delete from public.convites_equipe where lower(email) = lower(email_alvo);
end $$;

do $$ declare f text; begin
  foreach f in array array['painel_kpis()', 'painel_usuarios(text,int)', 'painel_tickets(text)', 'painel_ia(int)', 'painel_privacidade()', 'equipe_listar()', 'equipe_convidar(text,text)', 'equipe_remover(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.mascarar_email(text) from public, anon, authenticated;
