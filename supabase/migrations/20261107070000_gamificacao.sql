-- A11 Gamificação: conquistas e campanhas criadas pela equipe no painel.
-- Campanha = conquista com período (inicio/fim). Regras contra fraude, iguais no app e no servidor:
--  * em campanha, só conta registro feito no próprio dia (ou no dia seguinte), nada retroativo (campo criadoEm);
--  * limite por dia: até 10 registros e até 3 do alimento-alvo contam.
create table public.conquistas_equipe (
  id text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  emoji text not null check (length(emoji) between 1 and 8),
  nome text not null check (length(nome) between 3 and 40),
  criterio text not null check (length(criterio) between 3 and 120),
  metrica text not null check (metrica in ('registros', 'dias_registrados', 'sequencia', 'dias_completos', 'dias_agua', 'alimentos_diferentes', 'contem_alimento')),
  alvo integer not null check (alvo between 1 and 1000),
  termos text[] not null default '{}',
  inicio date, fim date,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  ordem integer not null default 0,
  versao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  check (fim is null or inicio is null or fim >= inicio),
  check (metrica <> 'contem_alimento' or cardinality(termos) between 1 and 20)
);
alter table public.versoes_conteudo drop constraint versoes_conteudo_tabela_check;
alter table public.versoes_conteudo add constraint versoes_conteudo_tabela_check check (tabela in ('receitas', 'modelos_refeicao', 'planos', 'conquistas_equipe'));
create trigger versao_conquistas before update or delete on public.conquistas_equipe for each row execute function public.guardar_versao();

alter table public.conquistas_equipe enable row level security;
create policy "visitantes leem conquistas publicadas" on public.conquistas_equipe for select to anon using (status = 'publicado');
create policy "usuarios leem publicadas e equipe tudo (conquistas)" on public.conquistas_equipe for select to authenticated using (status = 'publicado' or (select public.eh_equipe()));
create policy "equipe cria conquistas" on public.conquistas_equipe for insert to authenticated with check ((select public.eh_equipe()));
create policy "equipe altera conquistas" on public.conquistas_equipe for update to authenticated using ((select public.eh_equipe())) with check ((select public.eh_equipe()));
create policy "equipe apaga conquistas" on public.conquistas_equipe for delete to authenticated using ((select public.eh_equipe()));

-- Progresso de uma pessoa numa conquista, calculado no servidor a partir do diário sincronizado.
create or replace function public.progresso_conquista(c public.conquistas_equipe, usuario uuid)
returns integer language sql stable security definer set search_path = '' as $$
  with dias as (
    select d.data, d.agua, r.reg
    from public.dias d
    left join lateral jsonb_array_elements(d.registros) r(reg) on true
    where d.user_id = usuario and d.data between coalesce(c.inicio, '-infinity'::date) and coalesce(c.fim, 'infinity'::date)
  ), validos as (
    select data, reg from dias
    where reg is not null and (
      c.inicio is null or (
        (reg->>'criadoEm') ~ '^\d{4}-\d{2}-\d{2}T' and ((reg->>'criadoEm')::timestamptz at time zone 'America/Sao_Paulo')::date between data and data + 1))
  ), por_dia as (
    select data, count(*) as n,
      least(count(*) filter (where exists (select 1 from unnest(c.termos) t where (reg->>'nome') ilike '%' || t || '%')), 3) as alvo_n,
      count(distinct reg->>'refeicao') filter (where reg->>'refeicao' in ('cafe', 'almoco', 'jantar')) as principais
    from validos group by data
  ), ilhas as (
    select data, data - (row_number() over (order by data))::int as grupo from por_dia
  )
  select case c.metrica
    when 'registros' then (select coalesce(sum(least(n, 10)), 0) from por_dia)
    when 'dias_registrados' then (select count(*) from por_dia)
    when 'dias_completos' then (select count(*) from por_dia where principais = 3)
    when 'alimentos_diferentes' then (select count(distinct reg->>'alimentoId') from validos)
    when 'contem_alimento' then (select coalesce(sum(alvo_n), 0) from por_dia)
    when 'sequencia' then (select coalesce(max(n), 0) from (select count(*) n from ilhas group by grupo) x)
    when 'dias_agua' then (select count(*) from (select distinct data, agua from dias) a
                            where (select coalesce(sum(least(v::numeric, 1000)), 0) from jsonb_array_elements_text(a.agua) v) >= 2000)
  end::int
$$;
revoke all on function public.progresso_conquista(public.conquistas_equipe, uuid) from public, anon, authenticated;

-- Painel: quantas pessoas completaram cada conquista da equipe (sem dizer quem).
create or replace function public.painel_conquistas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_equipe();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'completaram', (
      select count(*) from (select distinct user_id from public.dias) u where public.progresso_conquista(c, u.user_id) >= c.alvo
    ), 'participando', (
      select count(*) from (select distinct user_id from public.dias) u where public.progresso_conquista(c, u.user_id) > 0
    )))
    from public.conquistas_equipe c where c.status = 'publicado'), '[]'::jsonb);
end $$;
revoke all on function public.painel_conquistas() from public, anon;
grant execute on function public.painel_conquistas() to authenticated;

-- A própria pessoa confere no servidor o progresso dela numa campanha (para prêmios futuros).
create or replace function public.meu_progresso_conquista(conquista text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('progresso', public.progresso_conquista(c, (select auth.uid())), 'alvo', c.alvo)
  from public.conquistas_equipe c where c.id = conquista and c.status = 'publicado' and (select auth.uid()) is not null
$$;
revoke all on function public.meu_progresso_conquista(text) from public, anon;
grant execute on function public.meu_progresso_conquista(text) to authenticated;

-- Restaurar versão também cobre conquistas.
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
  elsif v.tabela = 'conquistas_equipe' then
    insert into public.conquistas_equipe (id, emoji, nome, criterio, metrica, alvo, termos, inicio, fim, status, ordem)
    select x.id, x.emoji, x.nome, x.criterio, x.metrica, x.alvo, x.termos, x.inicio, x.fim, x.status, x.ordem from jsonb_populate_record(null::public.conquistas_equipe, v.dados) x
    on conflict (id) do update set emoji = excluded.emoji, nome = excluded.nome, criterio = excluded.criterio, metrica = excluded.metrica, alvo = excluded.alvo, termos = excluded.termos, inicio = excluded.inicio, fim = excluded.fim, status = excluded.status, ordem = excluded.ordem;
  end if;
end $$;
