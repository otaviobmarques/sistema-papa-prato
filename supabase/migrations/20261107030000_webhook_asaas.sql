-- Webhook do Asaas: eventos de cobrança e assinatura chegam pela função /api/asaas-webhook.
-- O token do webhook fica só na Vercel (ASAAS_WEBHOOK_TOKEN); aqui guardamos apenas o hash dele.
create table public.config_privada (chave text primary key, valor text not null);
alter table public.config_privada enable row level security; -- sem políticas: ninguém lê pela API

create table public.asaas_eventos (
  id text primary key,
  evento text not null,
  recebido_em timestamptz not null default now(),
  pagamento_id text, assinatura_id text, cliente_id text,
  valor numeric, status text, referencia_externa text,
  processado boolean not null default false,
  dados jsonb not null
);
create index asaas_eventos_recebido_idx on public.asaas_eventos (recebido_em desc);
alter table public.asaas_eventos enable row level security;
create policy "equipe vê eventos do Asaas" on public.asaas_eventos for select to authenticated using ((select public.eh_equipe()));

create or replace function public.registrar_evento_asaas(token text, evento jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare esperado text;
begin
  select valor into esperado from public.config_privada where chave = 'asaas_webhook_token_sha256';
  if esperado is null or encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex') <> esperado then
    raise exception 'token inválido' using errcode = '42501';
  end if;
  insert into public.asaas_eventos (id, evento, pagamento_id, assinatura_id, cliente_id, valor, status, referencia_externa, dados)
  values (
    coalesce(evento->>'id', md5(evento::text)), coalesce(evento->>'event', 'DESCONHECIDO'),
    evento->'payment'->>'id', coalesce(evento->'payment'->>'subscription', evento->'subscription'->>'id'),
    coalesce(evento->'payment'->>'customer', evento->'subscription'->>'customer'),
    nullif(coalesce(evento->'payment'->>'value', evento->'subscription'->>'value'), '')::numeric,
    coalesce(evento->'payment'->>'status', evento->'subscription'->>'status'),
    coalesce(evento->'payment'->>'externalReference', evento->'subscription'->>'externalReference'),
    evento)
  on conflict (id) do nothing;
  return true;
end $$;
grant execute on function public.registrar_evento_asaas(text, jsonb) to anon, authenticated;
-- O hash do token é gravado direto no banco (não fica no repositório):
-- insert into public.config_privada values ('asaas_webhook_token_sha256', '<sha256 do token>');
