-- A04/A05: receitas e modelos de refeição editáveis pela equipe, com rascunho, publicação e versões.
create table public.modelos_refeicao (
  id text primary key,
  refeicao text not null check (refeicao in ('cafe', 'almoco', 'lanche', 'jantar', 'ceia')),
  nome text not null check (length(nome) between 3 and 120),
  itens jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 12),
  regioes text[] not null default '{}',
  tempo text not null default 'medio' check (tempo in ('rapido', 'medio', 'longo')),
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  versao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
create table public.receitas (
  id text primary key,
  nome text not null check (length(nome) between 3 and 120),
  emoji text not null default '🍽️' check (length(emoji) <= 16),
  minutos integer not null check (minutos between 1 and 1440),
  porcoes integer not null default 1 check (porcoes between 1 and 50),
  regiao text not null default 'Todas',
  itens jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 30),
  extras jsonb not null default '[]'::jsonb check (jsonb_typeof(extras) = 'array'),
  passos jsonb not null check (jsonb_typeof(passos) = 'array' and jsonb_array_length(passos) between 1 and 30),
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  versao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

-- Histórico: cada alteração guarda a versão anterior, para desfazer.
create table public.versoes_conteudo (
  id bigint generated always as identity primary key,
  tabela text not null check (tabela in ('receitas', 'modelos_refeicao')),
  registro_id text not null,
  versao integer not null,
  dados jsonb not null,
  em timestamptz not null default now(),
  por uuid references auth.users(id) on delete set null
);
create index versoes_conteudo_idx on public.versoes_conteudo (tabela, registro_id, versao desc);

create or replace function public.guardar_versao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.versoes_conteudo (tabela, registro_id, versao, dados, por) values (tg_table_name, old.id, old.versao, to_jsonb(old), old.atualizado_por);
    new.versao := old.versao + 1;
  elsif tg_op = 'DELETE' then
    insert into public.versoes_conteudo (tabela, registro_id, versao, dados, por) values (tg_table_name, old.id, old.versao, to_jsonb(old), (select auth.uid()));
    return old;
  end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce((select auth.uid()), new.atualizado_por);
  return new;
end $$;
revoke all on function public.guardar_versao() from public, anon, authenticated;
create trigger versao_modelos before update or delete on public.modelos_refeicao for each row execute function public.guardar_versao();
create trigger versao_receitas before update or delete on public.receitas for each row execute function public.guardar_versao();

alter table public.modelos_refeicao enable row level security;
alter table public.receitas enable row level security;
alter table public.versoes_conteudo enable row level security;

create policy "visitantes leem modelos publicados" on public.modelos_refeicao for select to anon using (status = 'publicado');
create policy "usuarios leem publicados e equipe tudo (modelos)" on public.modelos_refeicao for select to authenticated using (status = 'publicado' or (select public.eh_equipe()));
create policy "equipe cria modelos" on public.modelos_refeicao for insert to authenticated with check ((select public.eh_equipe()));
create policy "equipe altera modelos" on public.modelos_refeicao for update to authenticated using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy "equipe apaga modelos" on public.modelos_refeicao for delete to authenticated using ((select public.eh_equipe()));

create policy "visitantes leem receitas publicadas" on public.receitas for select to anon using (status = 'publicado');
create policy "usuarios leem publicadas e equipe tudo (receitas)" on public.receitas for select to authenticated using (status = 'publicado' or (select public.eh_equipe()));
create policy "equipe cria receitas" on public.receitas for insert to authenticated with check ((select public.eh_equipe()));
create policy "equipe altera receitas" on public.receitas for update to authenticated using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy "equipe apaga receitas" on public.receitas for delete to authenticated using ((select public.eh_equipe()));

create policy "equipe vê versões" on public.versoes_conteudo for select to authenticated using ((select public.eh_equipe()));

-- Restaurar uma versão anterior (vira uma nova versão, o histórico continua completo)
create or replace function public.restaurar_versao(versao_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.versoes_conteudo;
begin
  perform public.exigir_equipe();
  select * into v from public.versoes_conteudo where id = versao_id;
  if v.id is null then raise exception 'versão não encontrada'; end if;
  if v.tabela = 'receitas' then
    insert into public.receitas (id, nome, emoji, minutos, porcoes, regiao, itens, extras, passos, status)
    select x.id, x.nome, x.emoji, x.minutos, x.porcoes, x.regiao, x.itens, x.extras, x.passos, x.status from jsonb_populate_record(null::public.receitas, v.dados) x
    on conflict (id) do update set nome = excluded.nome, emoji = excluded.emoji, minutos = excluded.minutos, porcoes = excluded.porcoes, regiao = excluded.regiao, itens = excluded.itens, extras = excluded.extras, passos = excluded.passos, status = excluded.status;
  else
    insert into public.modelos_refeicao (id, refeicao, nome, itens, regioes, tempo, status)
    select x.id, x.refeicao, x.nome, x.itens, x.regioes, x.tempo, x.status from jsonb_populate_record(null::public.modelos_refeicao, v.dados) x
    on conflict (id) do update set refeicao = excluded.refeicao, nome = excluded.nome, itens = excluded.itens, regioes = excluded.regioes, tempo = excluded.tempo, status = excluded.status;
  end if;
end $$;
revoke all on function public.restaurar_versao(bigint) from public, anon;
grant execute on function public.restaurar_versao(bigint) to authenticated;
