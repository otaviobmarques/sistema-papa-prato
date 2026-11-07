-- T34 Conversa com o Papa: histórico do chat com a IA. Só a própria pessoa lê e apaga; a equipe não vê.
create table public.conversa_papa (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  papel text not null check (papel in ('pessoa', 'papa')),
  texto text not null check (length(texto) between 1 and 4000),
  em timestamptz not null default now()
);
create index conversa_papa_user_idx on public.conversa_papa (user_id, em desc);
alter table public.conversa_papa enable row level security;
create policy "pessoa lê a própria conversa" on public.conversa_papa for select to authenticated using (user_id = (select auth.uid()));
create policy "pessoa grava na própria conversa" on public.conversa_papa for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pessoa apaga a própria conversa" on public.conversa_papa for delete to authenticated using (user_id = (select auth.uid()));

-- Uso de IA passa a dizer para que foi (foto do prato ou conversa).
alter table public.ia_uso add column funcao text not null default 'foto' check (funcao in ('foto', 'conversa'));

-- Quantas mensagens a pessoa mandou ao Papa nas últimas 24 h (limite de uso justo).
create or replace function public.mensagens_papa_24h()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.conversa_papa where user_id = (select auth.uid()) and papel = 'pessoa' and em > now() - interval '24 hours'
$$;
revoke all on function public.mensagens_papa_24h() from public, anon;
grant execute on function public.mensagens_papa_24h() to authenticated;
