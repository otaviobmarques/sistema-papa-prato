-- Planos pagos para nutricionistas (sem plano grátis). A área do profissional passa a exigir assinatura.
-- Assinatura do profissional fica separada da de paciente (a mesma pessoa pode ter as duas).
-- No Asaas, a referência externa é 'prof:<id do usuário>' para diferenciar.

alter table public.planos add column publico text not null default 'paciente' check (publico in ('paciente', 'profissional'));
alter table public.planos add column limite_pacientes integer check (limite_pacientes is null or limite_pacientes between 1 and 100000);

insert into public.planos (id, nome, preco, meses, teste_dias, descricao, destaque, ativo, ordem, publico, limite_pacientes) values
  ('prof-essencial', 'Essencial mensal', 29.90, 1, 0, 'Até 20 pacientes: resumo, diário, peso e evolução.', false, true, 11, 'profissional', 20),
  ('prof-essencial-anual', 'Essencial anual', 299.00, 12, 0, 'Até 20 pacientes, com 2 meses grátis no ano.', true, true, 12, 'profissional', 20),
  ('prof-pro', 'Pro mensal', 49.90, 1, 0, 'Até 80 pacientes, cardápio prescrito e relatório em PDF.', false, false, 13, 'profissional', 80),
  ('prof-pro-anual', 'Pro anual', 499.00, 12, 0, 'Pro com 2 meses grátis no ano.', false, false, 14, 'profissional', 80),
  ('prof-clinica', 'Clínica mensal', 119.90, 1, 0, 'Pacientes ilimitados e até 5 nutricionistas.', false, false, 15, 'profissional', null),
  ('prof-clinica-anual', 'Clínica anual', 1199.00, 12, 0, 'Clínica com 2 meses grátis no ano.', false, false, 16, 'profissional', null);

create table public.assinaturas_prof (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plano_id text references public.planos(id) on delete set null,
  ambiente text not null default 'producao' check (ambiente in ('producao', 'sandbox')),
  status text not null default 'pendente' check (status in ('pendente', 'ativa', 'atrasada', 'cancelada')),
  asaas_cliente_id text, asaas_assinatura_id text,
  pago_ate timestamptz, link_pagamento text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
alter table public.assinaturas_prof enable row level security;
create policy "profissional vê a própria assinatura" on public.assinaturas_prof for select to authenticated using (user_id = (select auth.uid()));

-- Acesso do profissional: verificado + assinatura em dia (equipe passa direto).
create or replace function public.prof_liberado(usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.papeis where user_id = usuario)
      or (exists (select 1 from public.profissionais where user_id = usuario and status = 'verificado')
          and exists (select 1 from public.assinaturas_prof where user_id = usuario and pago_ate > now()))
$$;
revoke all on function public.prof_liberado(uuid) from public, anon, authenticated;

create or replace function public.limite_pacientes_prof(usuario uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.papeis where user_id = usuario) then null
              else (select p.limite_pacientes from public.assinaturas_prof a join public.planos p on p.id = a.plano_id where a.user_id = usuario) end
$$;
revoke all on function public.limite_pacientes_prof(uuid) from public, anon, authenticated;

create or replace function public.meu_acesso_prof()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'liberado', public.prof_liberado((select auth.uid())),
    'equipe', exists (select 1 from public.papeis where user_id = (select auth.uid())),
    'status', a.status, 'plano_id', a.plano_id, 'plano_nome', p.nome, 'preco', p.preco, 'meses', p.meses,
    'limite_pacientes', public.limite_pacientes_prof((select auth.uid())),
    'pacientes', (select count(*) from public.vinculos where profissional_id = (select auth.uid())),
    'pago_ate', a.pago_ate, 'link_pagamento', a.link_pagamento, 'ambiente', a.ambiente,
    'asaas_cliente_id', a.asaas_cliente_id, 'asaas_assinatura_id', a.asaas_assinatura_id)
  from (select (select auth.uid()) uid) u
  left join public.assinaturas_prof a on a.user_id = u.uid
  left join public.planos p on p.id = a.plano_id
  where u.uid is not null
$$;
revoke all on function public.meu_acesso_prof() from public, anon;
grant execute on function public.meu_acesso_prof() to authenticated;

-- Servidor (/api/assinatura) grava a assinatura do profissional, provando quem é com o token do webhook.
create or replace function public.servidor_salvar_assinatura_prof(token text, usuario uuid, dados jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if public.ambiente_do_token(token) is null then raise exception 'token inválido' using errcode = '42501'; end if;
  insert into public.assinaturas_prof as a (user_id, plano_id, ambiente, status, asaas_cliente_id, asaas_assinatura_id, link_pagamento)
  values (usuario, dados->>'plano_id', coalesce(dados->>'ambiente', 'producao'), coalesce(dados->>'status', 'pendente'),
          dados->>'asaas_cliente_id', dados->>'asaas_assinatura_id', dados->>'link_pagamento')
  on conflict (user_id) do update set
    plano_id = coalesce(excluded.plano_id, a.plano_id), ambiente = excluded.ambiente,
    status = case when dados ? 'status' then excluded.status else a.status end,
    asaas_cliente_id = coalesce(excluded.asaas_cliente_id, a.asaas_cliente_id),
    asaas_assinatura_id = case when dados ? 'asaas_assinatura_id' then excluded.asaas_assinatura_id else a.asaas_assinatura_id end,
    link_pagamento = case when dados ? 'link_pagamento' then excluded.link_pagamento else a.link_pagamento end,
    atualizado_em = now();
  return true;
end $$;
grant execute on function public.servidor_salvar_assinatura_prof(text, uuid, jsonb) to anon, authenticated;

-- Webhook: agora entende 'prof:<uuid>' (assinatura de profissional) além de '<uuid>' (paciente).
create or replace function public.registrar_evento_asaas(token text, evento jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  amb text := public.ambiente_do_token(token);
  ev text := coalesce(evento->>'event', 'DESCONHECIDO');
  pag jsonb := evento->'payment';
  ref text := coalesce(evento->'payment'->>'externalReference', evento->'subscription'->>'externalReference');
  assin text := coalesce(evento->'payment'->>'subscription', evento->'subscription'->>'id');
  cliente text := coalesce(evento->'payment'->>'customer', evento->'subscription'->>'customer');
  tabela text := 'assinaturas'; uref text; chave_ev text;
  uid uuid; novos int; meses int; venc date;
begin
  if amb is null then raise exception 'token inválido' using errcode = '42501'; end if;
  uref := ref;
  if ref like 'prof:%' then tabela := 'assinaturas_prof'; uref := substr(ref, 6); end if;
  if uref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into uid from auth.users u where u.id = uref::uuid;
  end if;
  if uid is null then return true; end if; -- não é do Papa Prato

  chave_ev := amb || ':' || coalesce(evento->>'id', md5(evento::text));
  insert into public.asaas_eventos (id, ambiente, evento, pagamento_id, assinatura_id, cliente_id, valor, status, referencia_externa, dados)
  values (chave_ev, amb, ev, pag->>'id', assin, cliente,
    nullif(coalesce(pag->>'value', evento->'subscription'->>'value'), '')::numeric,
    coalesce(pag->>'status', evento->'subscription'->>'status'), ref, evento)
  on conflict (id) do nothing;
  get diagnostics novos = row_count;
  if novos = 0 then return true; end if;

  execute format('insert into public.%I (user_id, ambiente, asaas_assinatura_id, asaas_cliente_id) values ($1, $2, $3, $4) on conflict (user_id) do nothing', tabela)
    using uid, amb, assin, cliente;
  execute format('select coalesce(p.meses, 1) from public.%I a left join public.planos p on p.id = a.plano_id where a.user_id = $1', tabela) into meses using uid;
  venc := coalesce(nullif(pag->>'dueDate', '')::date, current_date);

  if ev in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
    execute format($q$update public.%I set status = 'ativa', ambiente = $2, link_pagamento = null, asaas_assinatura_id = coalesce($3, asaas_assinatura_id),
      pago_ate = greatest(coalesce(pago_ate, now()), ($4 + make_interval(months => coalesce($5, 1)) + interval '3 days')::timestamptz), atualizado_em = now()
      where user_id = $1$q$, tabela) using uid, amb, assin, venc, meses;
  elsif ev = 'PAYMENT_CREATED' then
    execute format($q$update public.%I set link_pagamento = coalesce($2, link_pagamento), asaas_assinatura_id = coalesce($3, asaas_assinatura_id), atualizado_em = now()
      where user_id = $1 and (status <> 'ativa' or pago_ate < now() + interval '7 days')$q$, tabela) using uid, pag->>'invoiceUrl', assin;
  elsif ev = 'PAYMENT_OVERDUE' then
    execute format($q$update public.%I set status = 'atrasada', link_pagamento = coalesce($2, link_pagamento), atualizado_em = now()
      where user_id = $1 and status <> 'cancelada'$q$, tabela) using uid, pag->>'invoiceUrl';
  elsif ev in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE') then
    execute format($q$update public.%I set status = 'cancelada', pago_ate = least(pago_ate, now()), link_pagamento = null, atualizado_em = now() where user_id = $1$q$, tabela) using uid;
  elsif ev in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED') then
    execute format($q$update public.%I set status = 'cancelada', link_pagamento = null, atualizado_em = now()
      where user_id = $1 and asaas_assinatura_id is not distinct from $2$q$, tabela) using uid, assin;
  end if;

  update public.asaas_eventos e set processado = true where e.id = chave_ev;
  return true;
end $$;

-- Vincular: o profissional precisa estar liberado (verificado + assinatura) e dentro do limite do plano.
create or replace function public.vincular_profissional(codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare eu uuid := (select auth.uid()); p public.profissionais; lim integer;
begin
  if eu is null then raise exception 'entre na sua conta' using errcode = '42501'; end if;
  select * into p from public.profissionais x where x.codigo = upper(trim(vincular_profissional.codigo)) and x.status = 'verificado';
  if p.user_id is null then raise exception 'código não encontrado ou profissional ainda não verificado'; end if;
  if p.user_id = eu then raise exception 'você não pode se vincular a si mesmo'; end if;
  if not public.prof_liberado(p.user_id) then raise exception 'este profissional está com a assinatura inativa no momento'; end if;
  lim := public.limite_pacientes_prof(p.user_id);
  if lim is not null and (select count(*) from public.vinculos where profissional_id = p.user_id) >= lim
     and not exists (select 1 from public.vinculos where profissional_id = p.user_id and paciente_id = eu) then
    raise exception 'este profissional atingiu o limite de pacientes do plano dele';
  end if;
  if (select count(*) from public.vinculos where paciente_id = eu) >= 3 then raise exception 'limite de 3 profissionais'; end if;
  insert into public.vinculos (paciente_id, profissional_id) values (eu, p.user_id) on conflict do nothing;
  return jsonb_build_object('nome', p.nome, 'crn', p.crn, 'uf', p.uf, 'regiao_crn', p.regiao_crn);
end $$;

-- Lista e diário de pacientes só com assinatura em dia.
drop function public.meus_pacientes();
create function public.meus_pacientes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.prof_liberado((select auth.uid())) then raise exception 'assinatura do profissional inativa' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
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
  where v.profissional_id = (select auth.uid()));
end $$;
revoke all on function public.meus_pacientes() from public, anon;
grant execute on function public.meus_pacientes() to authenticated;

create or replace function public.diario_paciente(paciente uuid, de date, ate date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.prof_liberado((select auth.uid())) then raise exception 'assinatura do profissional inativa' using errcode = '42501'; end if;
  if not exists (select 1 from public.vinculos v join public.profissionais p on p.user_id = v.profissional_id
                 where v.paciente_id = paciente and v.profissional_id = (select auth.uid()) and v.compartilha_diario and p.status = 'verificado') then
    raise exception 'sem autorização para ver este diário' using errcode = '42501';
  end if;
  if ate < de or ate - de > 31 then raise exception 'período inválido (até 31 dias)'; end if;
  return jsonb_build_object(
    'perfil', (select jsonb_build_object('apelido', estado->'perfil'->>'apelido', 'objetivo', estado->'perfil'->>'objetivo', 'dieta', estado->'perfil'->>'dieta',
                 'alergias', estado->'perfil'->'alergias', 'idade', estado->'perfil'->'idade', 'sexo', estado->'perfil'->>'sexo', 'altura', estado->'perfil'->'altura',
                 'peso', estado->'perfil'->'peso', 'atividade', estado->'perfil'->>'atividade') from public.perfis where user_id = paciente),
    'pesos', (select coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(estado->'pesos') x order by x->>'data' desc limit 20) y), '[]'::jsonb)
              from public.perfis where user_id = paciente and jsonb_typeof(estado->'pesos') = 'array'),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('data', d.data, 'registros', d.registros, 'agua', d.agua) order by d.data desc), '[]'::jsonb)
             from public.dias d where d.user_id = paciente and d.data between de and ate));
end $$;

-- Painel: assinaturas de profissionais entram nos números.
create or replace function public.painel_assinaturas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return jsonb_build_object(
    'ativas', (select count(*) from public.assinaturas where pago_ate > now()),
    'atrasadas', (select count(*) from public.assinaturas where status = 'atrasada'),
    'pendentes', (select count(*) from public.assinaturas where status = 'pendente' and (pago_ate is null or pago_ate <= now())),
    'canceladas', (select count(*) from public.assinaturas where status = 'cancelada'),
    'profissionais_ativos', (select count(*) from public.assinaturas_prof where pago_ate > now()),
    'receita_mensal', (select coalesce(round(sum(p.preco / p.meses), 2), 0) from (
        select plano_id from public.assinaturas where pago_ate > now() and status = 'ativa'
        union all select plano_id from public.assinaturas_prof where pago_ate > now() and status = 'ativa') a join public.planos p on p.id = a.plano_id),
    'por_plano', (select coalesce(jsonb_agg(x order by x.ordem), '[]') from (
        select p.id, p.nome, p.ordem, p.publico,
          (select count(*) from public.assinaturas a where a.plano_id = p.id and a.pago_ate > now()) +
          (select count(*) from public.assinaturas_prof a where a.plano_id = p.id and a.pago_ate > now()) as ativas
        from public.planos p where p.ativo) x),
    'eventos', (select coalesce(jsonb_agg(e order by e.recebido_em desc), '[]') from (select evento, ambiente, recebido_em, valor, status, processado from public.asaas_eventos order by recebido_em desc limit 30) e)
  );
end $$;
