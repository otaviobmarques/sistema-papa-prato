-- Planos do Papa Prato Plus, com preço editável pelo painel (só admin). Leitura pública: o site mostra os preços.
-- Mudar o preço vale para novas assinaturas; as já ativas no Asaas mantêm o valor contratado.
create table public.planos (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  nome text not null check (length(nome) between 2 and 40),
  preco numeric(10,2) not null check (preco > 0 and preco < 10000),
  meses integer not null check (meses in (1, 3, 6, 12)),
  teste_dias integer not null default 7 check (teste_dias between 0 and 30),
  descricao text not null default '' check (length(descricao) <= 140),
  destaque boolean not null default false,
  ativo boolean not null default true,
  ordem integer not null default 0,
  versao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.versoes_conteudo drop constraint versoes_conteudo_tabela_check;
alter table public.versoes_conteudo add constraint versoes_conteudo_tabela_check check (tabela in ('receitas', 'modelos_refeicao', 'planos'));
create trigger versao_planos before update or delete on public.planos for each row execute function public.guardar_versao();

alter table public.planos enable row level security;
create policy "todos leem planos ativos" on public.planos for select to anon using (ativo);
create policy "usuarios leem ativos e equipe tudo (planos)" on public.planos for select to authenticated using (ativo or (select public.eh_equipe()));
create policy "admin cria planos" on public.planos for insert to authenticated with check ((select public.eh_admin()));
create policy "admin altera planos" on public.planos for update to authenticated using ((select public.eh_admin())) with check ((select public.eh_admin()));
create policy "admin apaga planos" on public.planos for delete to authenticated using ((select public.eh_admin()));

insert into public.planos (id, nome, preco, meses, teste_dias, descricao, destaque, ordem) values
  ('mensal', 'Mensal', 24.90, 1, 7, 'Flexível: cancele quando quiser.', false, 1),
  ('trimestral', 'Trimestral', 64.90, 3, 7, 'Três meses para criar o hábito.', false, 2),
  ('anual', 'Anual', 199.90, 12, 7, 'O melhor preço: menos de R$ 17 por mês.', true, 3);

-- Restaurar versão agora também cobre planos (só admin pode restaurar preço).
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
  elsif v.tabela = 'modelos_refeicao' then
    insert into public.modelos_refeicao (id, refeicao, nome, itens, regioes, tempo, status)
    select x.id, x.refeicao, x.nome, x.itens, x.regioes, x.tempo, x.status from jsonb_populate_record(null::public.modelos_refeicao, v.dados) x
    on conflict (id) do update set refeicao = excluded.refeicao, nome = excluded.nome, itens = excluded.itens, regioes = excluded.regioes, tempo = excluded.tempo, status = excluded.status;
  elsif v.tabela = 'planos' then
    if not public.eh_admin() then raise exception 'só administradores mudam planos' using errcode = '42501'; end if;
    insert into public.planos (id, nome, preco, meses, teste_dias, descricao, destaque, ativo, ordem)
    select x.id, x.nome, x.preco, x.meses, x.teste_dias, x.descricao, x.destaque, x.ativo, x.ordem from jsonb_populate_record(null::public.planos, v.dados) x
    on conflict (id) do update set nome = excluded.nome, preco = excluded.preco, meses = excluded.meses, teste_dias = excluded.teste_dias, descricao = excluded.descricao, destaque = excluded.destaque, ativo = excluded.ativo, ordem = excluded.ordem;
  end if;
end $$;
