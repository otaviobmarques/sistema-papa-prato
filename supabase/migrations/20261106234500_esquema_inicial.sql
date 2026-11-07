-- Papa Prato: esquema inicial. Todo dado de pessoa usuária é protegido por RLS (cada um só vê o que é seu).

create table public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  estado jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

create table public.dias (
  user_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  registros jsonb not null default '[]'::jsonb,
  agua jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, data)
);

create table public.consentimentos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('termos', 'ia', 'novidades')),
  valor boolean not null,
  em timestamptz not null default now()
);
create index consentimentos_user_idx on public.consentimentos (user_id, em desc);

create table public.papeis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null check (papel in ('admin', 'editor')),
  criado_em timestamptz not null default now()
);
create table public.convites_equipe (
  email text primary key,
  papel text not null check (papel in ('admin', 'editor'))
);

create or replace function public.eh_equipe()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.papeis where user_id = (select auth.uid()))
$$;

create or replace function public.aplicar_convite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.papeis (user_id, papel)
  select new.id, c.papel from public.convites_equipe c where lower(c.email) = lower(new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users for each row execute function public.aplicar_convite();

create table public.alimentos_equipe (
  id text primary key,
  nome text not null check (length(nome) between 2 and 200),
  kcal numeric not null check (kcal >= 0),
  proteina numeric not null default 0 check (proteina >= 0),
  carboidrato numeric not null default 0 check (carboidrato >= 0),
  gordura numeric not null default 0 check (gordura >= 0),
  fibra numeric check (fibra >= 0),
  medidas jsonb not null default '[]'::jsonb,
  publicado boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

create table public.conteudo (
  id text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.perfis enable row level security;
alter table public.dias enable row level security;
alter table public.consentimentos enable row level security;
alter table public.papeis enable row level security;
alter table public.convites_equipe enable row level security; -- sem políticas: inacessível pelo app
alter table public.alimentos_equipe enable row level security;
alter table public.conteudo enable row level security;

create policy "dono lê perfil" on public.perfis for select to authenticated using (user_id = (select auth.uid()));
create policy "dono cria perfil" on public.perfis for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dono altera perfil" on public.perfis for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "dono lê dias" on public.dias for select to authenticated using (user_id = (select auth.uid()));
create policy "dono cria dias" on public.dias for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dono altera dias" on public.dias for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono apaga dias" on public.dias for delete to authenticated using (user_id = (select auth.uid()));

create policy "dono lê consentimentos" on public.consentimentos for select to authenticated using (user_id = (select auth.uid()));
create policy "dono registra consentimento" on public.consentimentos for insert to authenticated with check (user_id = (select auth.uid()));

create policy "cada um vê o próprio papel" on public.papeis for select to authenticated using (user_id = (select auth.uid()));

create policy "equipe cria alimentos" on public.alimentos_equipe for insert to authenticated with check ((select public.eh_equipe()));
create policy "equipe altera alimentos" on public.alimentos_equipe for update to authenticated using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy "equipe apaga alimentos" on public.alimentos_equipe for delete to authenticated using ((select public.eh_equipe()));

create policy "todos leem conteúdo" on public.conteudo for select to anon, authenticated using (true);
create policy "equipe cria conteúdo" on public.conteudo for insert to authenticated with check ((select public.eh_equipe()));
create policy "equipe altera conteúdo" on public.conteudo for update to authenticated using ((select public.eh_equipe())) with check ((select public.eh_equipe()));

-- Exclusão da própria conta (LGPD): apaga o usuário e, em cascata, todos os seus dados.
create or replace function public.apagar_minha_conta()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'não autenticado'; end if;
  delete from auth.users where id = (select auth.uid());
end $$;
revoke all on function public.apagar_minha_conta() from public, anon;
grant execute on function public.apagar_minha_conta() to authenticated;
revoke all on function public.aplicar_convite() from public, anon, authenticated;
revoke all on function public.eh_equipe() from public, anon;
grant execute on function public.eh_equipe() to authenticated;
