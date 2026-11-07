-- Lembretes no celular (Web Push): água e refeições, mesmo com o app fechado.
-- Um agendamento (pg_cron) chama /api/lembretes a cada 15 min; a função pede ao banco quem deve ser avisado.
create table public.push_inscricoes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) < 1000),
  p256dh text not null check (length(p256dh) < 200),
  auth text not null check (length(auth) < 100),
  criado_em timestamptz not null default now()
);
create index push_inscricoes_user_idx on public.push_inscricoes (user_id);
alter table public.push_inscricoes enable row level security;
create policy "pessoa vê os próprios aparelhos" on public.push_inscricoes for select to authenticated using (user_id = (select auth.uid()));
create policy "pessoa remove os próprios aparelhos" on public.push_inscricoes for delete to authenticated using (user_id = (select auth.uid()));

create table public.lembretes (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  cafe text check (cafe ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  almoco text check (almoco ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  jantar text check (jantar ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  agua boolean not null default true,
  agua_inicio integer not null default 9 check (agua_inicio between 5 and 22),
  agua_fim integer not null default 21 check (agua_fim between 6 and 23),
  agua_intervalo integer not null default 2 check (agua_intervalo between 1 and 4),
  fuso text not null default 'America/Sao_Paulo' check (fuso ~ '^[A-Za-z_]+/[A-Za-z_/]+$'),
  enviados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.lembretes enable row level security;
create policy "pessoa vê os próprios lembretes" on public.lembretes for select to authenticated using (user_id = (select auth.uid()));
create policy "pessoa cria os próprios lembretes" on public.lembretes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pessoa muda os próprios lembretes" on public.lembretes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- O aparelho guarda a inscrição de push (o mesmo endpoint passa para a pessoa logada agora).
create or replace function public.salvar_inscricao_push(endpoint text, p256dh text, auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'entre na sua conta' using errcode = '42501'; end if;
  insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values ((select auth.uid()), endpoint, p256dh, salvar_inscricao_push.auth)
  on conflict on constraint push_inscricoes_endpoint_key do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
end $$;
revoke all on function public.salvar_inscricao_push(text, text, text) from public, anon;
grant execute on function public.salvar_inscricao_push(text, text, text) to authenticated;

-- Só a função /api/lembretes (com o token do agendamento) chama estas duas.
create or replace function public.lembretes_devidos(token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; saida jsonb := '[]'::jsonb; agora timestamp; hoje date; hm text; h int; m int; horario text; tipo text; ja_bebeu numeric; itens jsonb;
begin
  if (select valor from public.config_privada where chave = 'lembretes_token_sha256') is distinct from encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex') then
    raise exception 'token inválido' using errcode = '42501';
  end if;
  for r in
    select l.* from public.lembretes l
    where l.ativo and exists (select 1 from public.push_inscricoes p where p.user_id = l.user_id)
      and (exists (select 1 from public.assinaturas a where a.user_id = l.user_id and a.pago_ate > now())
           or exists (select 1 from public.papeis pa where pa.user_id = l.user_id))
  loop
    agora := now() at time zone r.fuso; hoje := agora::date; hm := to_char(agora, 'HH24:MI'); h := extract(hour from agora); m := extract(minute from agora);
    itens := '[]'::jsonb;
    foreach tipo in array array['cafe', 'almoco', 'jantar'] loop
      horario := case tipo when 'cafe' then r.cafe when 'almoco' then r.almoco else r.jantar end;
      if horario is not null and hm >= horario and hm < to_char(horario::time + interval '30 minutes', 'HH24:MI')
         and (r.enviados->>tipo) is distinct from hoje::text
         and not exists (select 1 from public.dias d, jsonb_array_elements(d.registros) x where d.user_id = r.user_id and d.data = hoje and x->>'refeicao' = tipo) then
        itens := itens || jsonb_build_object('tipo', tipo);
      end if;
    end loop;
    if r.agua and h >= r.agua_inicio and h < r.agua_fim and (h - r.agua_inicio) % r.agua_intervalo = 0 and m < 30
       and (r.enviados->>('agua-' || h)) is distinct from hoje::text then
      select coalesce(sum(v::numeric), 0) into ja_bebeu from public.dias d, jsonb_array_elements_text(d.agua) v where d.user_id = r.user_id and d.data = hoje;
      if ja_bebeu < 2000 then itens := itens || jsonb_build_object('tipo', 'agua', 'falta_ml', 2000 - ja_bebeu, 'chave', 'agua-' || h); end if;
    end if;
    if jsonb_array_length(itens) > 0 then
      update public.lembretes set enviados = (
        select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(enviados) e(k, v) where v #>> '{}' = hoje::text) ||
        (select jsonb_object_agg(coalesce(i->>'chave', i->>'tipo'), hoje::text) from jsonb_array_elements(itens) i)
      where user_id = r.user_id;
      saida := saida || jsonb_build_object('user_id', r.user_id, 'itens', itens, 'inscricoes',
        (select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)) from public.push_inscricoes p where p.user_id = r.user_id));
    end if;
  end loop;
  return saida;
end $$;
revoke all on function public.lembretes_devidos(text) from public, authenticated;
grant execute on function public.lembretes_devidos(text) to anon;

create or replace function public.remover_inscricao_push(token text, endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select valor from public.config_privada where chave = 'lembretes_token_sha256') is distinct from encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex') then
    raise exception 'token inválido' using errcode = '42501';
  end if;
  delete from public.push_inscricoes p where p.endpoint = remover_inscricao_push.endpoint;
end $$;
revoke all on function public.remover_inscricao_push(text, text) from public, authenticated;
grant execute on function public.remover_inscricao_push(text, text) to anon;
-- O hash do token e o agendamento (pg_cron + pg_net, token no Vault) são criados direto no banco.

-- Segredos gerados no próprio banco (Vault) e chave pública publicada pela função:
--   vault: 'lembretes_token' (agendamento → /api/lembretes) e 'push_semente' (chaves VAPID derivadas na função)
--   config_privada: 'lembretes_token_sha256' e 'push_chave_publica'
-- Funções lembretes_semente, salvar_chave_publica_push e chave_publica_push (ver migração aplicada no banco).
-- Agendamento: cron.schedule('papa-prato-lembretes', '*/15 * * * *', net.http_post(.../api/lembretes, header x-lembretes-token)).
