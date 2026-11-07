-- O Asaas gera um token por webhook: um para a conta sandbox e outro para a produção.
-- Guardamos só o hash de cada um; o evento fica marcado com o ambiente de onde veio.
alter table public.asaas_eventos add column ambiente text not null default 'producao' check (ambiente in ('producao', 'sandbox'));
delete from public.config_privada where chave like 'asaas_webhook_token_sha256%';
-- Hashes gravados direto no banco (não ficam no repositório):
-- insert into public.config_privada values ('asaas_webhook_token_sha256:producao', '<sha256>'), ('asaas_webhook_token_sha256:sandbox', '<sha256>');

create or replace function public.registrar_evento_asaas(token text, evento jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare amb text;
begin
  select split_part(chave, ':', 2) into amb from public.config_privada
   where chave like 'asaas_webhook_token_sha256:%' and valor = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex');
  if amb is null then raise exception 'token inválido' using errcode = '42501'; end if;
  insert into public.asaas_eventos (id, ambiente, evento, pagamento_id, assinatura_id, cliente_id, valor, status, referencia_externa, dados)
  values (
    amb || ':' || coalesce(evento->>'id', md5(evento::text)), amb, coalesce(evento->>'event', 'DESCONHECIDO'),
    evento->'payment'->>'id', coalesce(evento->'payment'->>'subscription', evento->'subscription'->>'id'),
    coalesce(evento->'payment'->>'customer', evento->'subscription'->>'customer'),
    nullif(coalesce(evento->'payment'->>'value', evento->'subscription'->>'value'), '')::numeric,
    coalesce(evento->'payment'->>'status', evento->'subscription'->>'status'),
    coalesce(evento->'payment'->>'externalReference', evento->'subscription'->>'externalReference'),
    evento)
  on conflict (id) do nothing;
  return true;
end $$;
