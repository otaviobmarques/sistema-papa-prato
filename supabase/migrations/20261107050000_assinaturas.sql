-- A07 Assinaturas: o Papa Prato é só pago (sem teste grátis). Quem libera o acesso é o pagamento confirmado
-- pelo Asaas (webhook). A pessoa só lê a própria assinatura; ninguém escreve nela pela API.
update public.planos set teste_dias = 0;
alter table public.planos alter column teste_dias set default 0;

create table public.assinaturas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plano_id text references public.planos(id) on delete set null,
  ambiente text not null default 'producao' check (ambiente in ('producao', 'sandbox')),
  status text not null default 'pendente' check (status in ('pendente', 'ativa', 'atrasada', 'cancelada')),
  asaas_cliente_id text,
  asaas_assinatura_id text,
  pago_ate timestamptz,
  link_pagamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index assinaturas_asaas_idx on public.assinaturas (asaas_assinatura_id);
alter table public.assinaturas enable row level security;
create policy "pessoa vê a própria assinatura" on public.assinaturas for select to authenticated using (user_id = (select auth.uid()));

-- Acesso da pessoa logada: liberado se for da equipe ou se o período pago ainda vale.
create or replace function public.meu_acesso()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'equipe', public.eh_equipe(),
    'liberado', public.eh_equipe() or coalesce(a.pago_ate > now(), false),
    'status', a.status, 'plano_id', a.plano_id, 'plano_nome', p.nome, 'meses', p.meses, 'preco', p.preco,
    'pago_ate', a.pago_ate, 'link_pagamento', a.link_pagamento, 'ambiente', a.ambiente,
    'asaas_cliente_id', a.asaas_cliente_id, 'asaas_assinatura_id', a.asaas_assinatura_id)
  from (select (select auth.uid()) as uid) u
  left join public.assinaturas a on a.user_id = u.uid
  left join public.planos p on p.id = a.plano_id
  where u.uid is not null
$$;
revoke all on function public.meu_acesso() from public, anon;
grant execute on function public.meu_acesso() to authenticated;

-- Confere um token do Asaas (webhook ou servidor) e devolve o ambiente, ou null.
create or replace function public.ambiente_do_token(token text)
returns text language sql stable security definer set search_path = '' as $$
  select split_part(chave, ':', 2) from public.config_privada
   where chave like 'asaas_webhook_token_sha256:%' and valor = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex')
$$;
revoke all on function public.ambiente_do_token(text) from public, anon, authenticated;

-- Usada só pela função /api/assinatura (servidor), que prova quem é com o token do webhook.
create or replace function public.servidor_salvar_assinatura(token text, usuario uuid, dados jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare amb text := public.ambiente_do_token(token);
begin
  if amb is null then raise exception 'token inválido' using errcode = '42501'; end if;
  insert into public.assinaturas as a (user_id, plano_id, ambiente, status, asaas_cliente_id, asaas_assinatura_id, link_pagamento)
  values (usuario, dados->>'plano_id', coalesce(dados->>'ambiente', 'producao'), coalesce(dados->>'status', 'pendente'),
          dados->>'asaas_cliente_id', dados->>'asaas_assinatura_id', dados->>'link_pagamento')
  on conflict (user_id) do update set
    plano_id = coalesce(excluded.plano_id, a.plano_id),
    ambiente = excluded.ambiente,
    status = case when dados ? 'status' then excluded.status else a.status end,
    asaas_cliente_id = coalesce(excluded.asaas_cliente_id, a.asaas_cliente_id),
    asaas_assinatura_id = case when dados ? 'asaas_assinatura_id' then excluded.asaas_assinatura_id else a.asaas_assinatura_id end,
    link_pagamento = case when dados ? 'link_pagamento' then excluded.link_pagamento else a.link_pagamento end,
    atualizado_em = now();
  return true;
end $$;
grant execute on function public.servidor_salvar_assinatura(text, uuid, jsonb) to anon, authenticated;

-- Webhook: atualiza a assinatura da pessoa (externalReference = id do usuário) e guarda o evento.
-- A mesma conta do Asaas pode atender outros sistemas: cobranças que não são do app são ignoradas.
create or replace function public.registrar_evento_asaas(token text, evento jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  amb text := public.ambiente_do_token(token);
  ev text := coalesce(evento->>'event', 'DESCONHECIDO');
  pag jsonb := evento->'payment';
  ref text := coalesce(evento->'payment'->>'externalReference', evento->'subscription'->>'externalReference');
  assin text := coalesce(evento->'payment'->>'subscription', evento->'subscription'->>'id');
  chave_ev text;
  uid uuid; novos int; meses int; venc date;
begin
  if amb is null then raise exception 'token inválido' using errcode = '42501'; end if;
  if ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into uid from auth.users u where u.id = ref::uuid;
  end if;
  if uid is null then return true; end if; -- não é do Papa Prato

  chave_ev := amb || ':' || coalesce(evento->>'id', md5(evento::text));
  insert into public.asaas_eventos (id, ambiente, evento, pagamento_id, assinatura_id, cliente_id, valor, status, referencia_externa, dados)
  values (chave_ev, amb, ev, pag->>'id', assin, coalesce(pag->>'customer', evento->'subscription'->>'customer'),
    nullif(coalesce(pag->>'value', evento->'subscription'->>'value'), '')::numeric,
    coalesce(pag->>'status', evento->'subscription'->>'status'), ref, evento)
  on conflict (id) do nothing;
  get diagnostics novos = row_count;
  if novos = 0 then return true; end if; -- reenvio: já processado

  insert into public.assinaturas (user_id, ambiente, asaas_assinatura_id, asaas_cliente_id)
  values (uid, amb, assin, coalesce(pag->>'customer', evento->'subscription'->>'customer'))
  on conflict (user_id) do nothing;

  select coalesce(p.meses, 1) into meses from public.assinaturas a left join public.planos p on p.id = a.plano_id where a.user_id = uid;
  venc := coalesce(nullif(pag->>'dueDate', '')::date, current_date);

  if ev in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
    update public.assinaturas a set status = 'ativa', ambiente = amb, link_pagamento = null,
      asaas_assinatura_id = coalesce(assin, a.asaas_assinatura_id),
      pago_ate = greatest(coalesce(a.pago_ate, now()), (venc + make_interval(months => coalesce(meses, 1)) + interval '3 days')::timestamptz),
      atualizado_em = now()
    where a.user_id = uid;
  elsif ev = 'PAYMENT_CREATED' then
    update public.assinaturas a set link_pagamento = coalesce(pag->>'invoiceUrl', a.link_pagamento),
      asaas_assinatura_id = coalesce(assin, a.asaas_assinatura_id), atualizado_em = now()
    where a.user_id = uid and (a.status <> 'ativa' or a.pago_ate < now() + interval '7 days');
  elsif ev = 'PAYMENT_OVERDUE' then
    update public.assinaturas a set status = 'atrasada', link_pagamento = coalesce(pag->>'invoiceUrl', a.link_pagamento), atualizado_em = now()
    where a.user_id = uid and a.status <> 'cancelada';
  elsif ev in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE') then
    update public.assinaturas a set status = 'cancelada', pago_ate = least(a.pago_ate, now()), link_pagamento = null, atualizado_em = now()
    where a.user_id = uid;
  elsif ev in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED') then
    update public.assinaturas a set status = 'cancelada', link_pagamento = null, atualizado_em = now()
    where a.user_id = uid and a.asaas_assinatura_id is not distinct from assin;
  end if;

  update public.asaas_eventos e set processado = true where e.id = chave_ev;
  return true;
end $$;

-- Painel A07: números das assinaturas (sem dados de saúde) e últimos eventos do Asaas.
create or replace function public.painel_assinaturas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return jsonb_build_object(
    'ativas', (select count(*) from public.assinaturas where pago_ate > now()),
    'atrasadas', (select count(*) from public.assinaturas where status = 'atrasada'),
    'pendentes', (select count(*) from public.assinaturas where status = 'pendente' and (pago_ate is null or pago_ate <= now())),
    'canceladas', (select count(*) from public.assinaturas where status = 'cancelada'),
    'receita_mensal', (select coalesce(round(sum(p.preco / p.meses), 2), 0) from public.assinaturas a join public.planos p on p.id = a.plano_id where a.pago_ate > now() and a.status = 'ativa'),
    'por_plano', (select coalesce(jsonb_agg(x order by x.ordem), '[]') from (select p.id, p.nome, p.ordem, count(a.*) filter (where a.pago_ate > now()) as ativas from public.planos p left join public.assinaturas a on a.plano_id = p.id group by p.id) x),
    'eventos', (select coalesce(jsonb_agg(e order by e.recebido_em desc), '[]') from (select evento, ambiente, recebido_em, valor, status, processado from public.asaas_eventos order by recebido_em desc limit 30) e)
  );
end $$;
revoke all on function public.painel_assinaturas() from public, anon;
grant execute on function public.painel_assinaturas() to authenticated;
