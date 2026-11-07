import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, History, Plus, Search, Trash2, X } from 'lucide-react'
import { avisar, fmt, Folha, useAlimentos } from '../components/ui'
import { Cabecalho } from './Modulos'
import type { ItemModelo, Modelo, Receita } from '../data/cardapio'
import { ALERGENOS, alergenosEstimados, type Alergeno } from '../lib/alergias'
import { buscar, nomeCurto, nutrientesDe, somar, type Alimento } from '../lib/alimentos'
import { DIVISAO_REFEICOES, calcularMetas } from '../lib/metas'
import { modeloPermitido, montarRefeicao } from '../lib/plano'
import { supabase } from '../lib/supabase'
import { carregarConteudoDaEquipe } from '../lib/sync'
import { REFEICOES, uid, type Perfil, type Refeicao } from '../lib/store'

// A04/A05: a equipe cria e edita receitas e modelos de refeição. Cada item aponta para um alimento real da base
// (TACO/TBCA/...), então calorias e alérgenos são calculados, nunca digitados.

type Status = 'rascunho' | 'publicado'
type ModeloBD = Modelo & { status: Status; versao: number; atualizado_em: string }
type ReceitaBD = Receita & { status: Status; versao: number; atualizado_em: string }
type Versao = { id: number; versao: number; dados: { nome: string; status: Status }; em: string }
const REGIOES = ['norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul']
const NOME_REGIAO: Record<string, string> = { norte: 'Norte', nordeste: 'Nordeste', 'centro-oeste': 'Centro-Oeste', sudeste: 'Sudeste', sul: 'Sul' }
// Atualiza a lista na hora com o que o banco devolveu (sem esperar a próxima consulta)
function mesclar<T extends { id: string }>(l: T[] | null, x: T): T[] {
  const lista = l ?? []
  if (x.id.startsWith('__removido__')) return lista.filter(i => i.id !== x.id.slice(12))
  return lista.some(i => i.id === x.id) ? lista.map(i => (i.id === x.id ? x : i)) : [...lista, x]
}
const quando = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function SeletorAlimento({ lista, onEscolher }: { lista: Alimento[]; onEscolher: (a: Alimento) => void }) {
  const [q, setQ] = useState('')
  const res = useMemo(() => (q.trim().length >= 2 ? buscar(lista, q, 8) : []), [q, lista])
  return (
    <div style={{ position: 'relative' }}>
      <div className="search"><Search size={18} /><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Adicionar alimento da base: arroz, feijão…" aria-label="Buscar alimento para adicionar" /></div>
      {res.length > 0 && (
        <div className="card list" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 6, padding: '4px 12px', maxHeight: 320, overflow: 'auto' }}>
          {res.map(a => <button type="button" key={a.id} className="item-btn" onClick={() => { onEscolher(a); setQ('') }}><span className="grow small">{nomeCurto(a.nome)}</span><span className="tag gray">{a.fonte}</span><span className="tiny num">{fmt(a.kcal)} kcal/100 g</span></button>)}
        </div>
      )}
    </div>
  )
}

function Historico({ tabela, id, onRestaurado }: { tabela: 'receitas' | 'modelos_refeicao'; id: string; onRestaurado: () => void }) {
  const [v, setV] = useState<Versao[] | null>(null)
  useEffect(() => { supabase!.from('versoes_conteudo').select('id, versao, dados, em').eq('tabela', tabela).eq('registro_id', id).order('versao', { ascending: false }).limit(20).then(({ data }) => setV((data as Versao[]) ?? [])) }, [id])
  if (!v) return null
  if (!v.length) return <p className="tiny">Sem versões anteriores ainda.</p>
  return (
    <div className="list">{v.map(x => (
      <div key={x.id} className="item" style={{ padding: '8px 0' }}>
        <span className="grow small">v{x.versao} · {x.dados.nome} <span className="tag gray">{x.dados.status}</span><div className="tiny">{quando(x.em)}</div></span>
        <button type="button" className="btn ghost sm" onClick={async () => { const { error } = await supabase!.rpc('restaurar_versao', { versao_id: x.id }); avisar(error ? error.message : `Versão ${x.versao} restaurada.`); if (!error) onRestaurado() }}>Restaurar</button>
      </div>
    ))}</div>
  )
}

function Resumo({ itens, porId, porcoes = 1 }: { itens: { id: string; g: number }[]; porId: Map<string, Alimento>; porcoes?: number }) {
  const validos = itens.filter(i => porId.get(i.id))
  const n = somar(validos.map(i => nutrientesDe(porId.get(i.id)!, i.g)))
  const alerg = [...new Set(validos.flatMap(i => alergenosEstimados(porId.get(i.id)!.nome)))]
  const faltando = itens.filter(i => !porId.get(i.id)).length
  return (
    <div className="card soft small stack" style={{ gap: 6 }}>
      <div className="row between wrap"><b className="num">{fmt(n.kcal / porcoes)} kcal{porcoes > 1 ? ' por porção' : ''}</b><span className="num">P {fmt(n.proteina / porcoes)} g · C {fmt(n.carboidrato / porcoes)} g · G {fmt(n.gordura / porcoes)} g</span></div>
      <div>{alerg.length ? <>Pode conter: <b>{alerg.map(a => ALERGENOS[a].rotulo).join(', ')}</b> (estimado pelo nome)</> : 'Nenhum alérgeno identificado pelo nome.'}</div>
      {faltando > 0 && <div style={{ color: 'var(--orange)' }}>{faltando} item(ns) com código que não existe mais na base.</div>}
    </div>
  )
}

// ======================= A05: modelos de refeição =======================
export function EditorCardapios() {
  const base = useAlimentos()
  const [lista, setLista] = useState<ModeloBD[] | null>(null)
  const [edit, setEdit] = useState<ModeloBD | null>(null)
  const [simular, setSimular] = useState(false)
  const carregar = async () => { const { data, error } = await supabase!.from('modelos_refeicao').select('*').order('refeicao').order('nome'); if (error) avisar(error.message); setLista((data as ModeloBD[]) ?? []) }
  useEffect(() => { carregar() }, [])
  if (!base.pronto || !lista) return <p className="muted">Carregando…</p>
  if (edit) return <FormModelo inicial={edit} base={base} onFechar={salvo => { setEdit(null); if (salvo) setLista(l => mesclar(l, salvo)); carregar() }} />
  const novo = (): ModeloBD => ({ id: 'm_' + uid(), refeicao: 'almoco', nome: '', itens: [], tempo: 'medio', status: 'rascunho', versao: 0, atualizado_em: new Date().toISOString() })
  return (
    <>
      <Cabecalho titulo="Cardápios" texto="Modelos de refeição que montam o cardápio semanal. As quantidades são de referência; o app ajusta à meta de cada pessoa. Só os publicados aparecem no app."
        acoes={<div className="row" style={{ gap: 8 }}><button className="btn ghost sm" onClick={() => setSimular(true)}>Simular para um perfil</button><button className="btn sm" onClick={() => setEdit(novo())}><Plus size={16} /> Novo modelo</button></div>} />
      <div className="tabela-box"><table className="tabela">
        <thead><tr><th>Refeição</th><th>Modelo</th><th>Regiões</th><th className="n">kcal (ref.)</th><th>Alérgenos</th><th>Situação</th><th></th></tr></thead>
        <tbody>{lista.map(m => {
          const ok = m.itens.every(i => base.porId.get(i.id))
          const n = somar(m.itens.filter(i => base.porId.get(i.id)).map(i => nutrientesDe(base.porId.get(i.id)!, i.g)))
          const alerg = [...new Set(m.itens.flatMap(i => base.porId.get(i.id) ? alergenosEstimados(base.porId.get(i.id)!.nome) : []))]
          return (
            <tr key={m.id}><td>{REFEICOES.find(r => r.id === m.refeicao)?.nome}</td><td><b>{m.nome}</b><div className="tiny">{m.itens.length} itens · v{m.versao}</div></td>
              <td className="tiny">{m.regioes?.length ? m.regioes.map(r => NOME_REGIAO[r]).join(', ') : 'todas'}</td><td className="n">{fmt(n.kcal)}</td>
              <td className="tiny">{alerg.map(a => ALERGENOS[a].rotulo).join(', ') || '—'}</td>
              <td className="row wrap" style={{ gap: 4 }}><span className={`tag ${m.status === 'publicado' ? '' : 'orange'}`}>{m.status === 'publicado' ? 'Publicado' : 'Rascunho'}</span>{!ok && <span className="tag orange">código faltando</span>}</td>
              <td><button className="btn ghost sm" onClick={() => setEdit(m)}>Editar</button></td></tr>
          )
        })}</tbody>
      </table></div>
      <Folha aberta={simular} onFechar={() => setSimular(false)} titulo="Simular cardápio para um perfil" cheia>
        <Simulacao modelos={lista} porId={base.porId} />
      </Folha>
    </>
  )
}

function FormModelo({ inicial, base, onFechar }: { inicial: ModeloBD; base: { lista: Alimento[]; porId: Map<string, Alimento> }; onFechar: (salvo?: ModeloBD | null) => void }) {
  const [m, setM] = useState<ModeloBD>(inicial)
  const existe = inicial.versao > 0
  const set = (x: Partial<ModeloBD>) => setM(v => ({ ...v, ...x }))
  const setItem = (i: number, x: Partial<ItemModelo>) => set({ itens: m.itens.map((it, k) => (k === i ? { ...it, ...x } : it)) })
  const salvar = async (status: Status) => {
    if (m.nome.trim().length < 3) { avisar('Dê um nome com pelo menos 3 letras.'); return }
    if (!m.itens.length) { avisar('Adicione pelo menos um alimento.'); return }
    const linha = { id: m.id, refeicao: m.refeicao, nome: m.nome.trim(), itens: m.itens, regioes: m.regioes ?? [], tempo: m.tempo, status }
    const { data, error } = existe ? await supabase!.from('modelos_refeicao').update(linha).eq('id', m.id).select().single() : await supabase!.from('modelos_refeicao').insert(linha).select().single()
    if (error) { avisar('Não foi possível salvar: ' + error.message); return }
    avisar(status === 'publicado' ? 'Publicado: já vale no cardápio do app.' : 'Rascunho salvo.'); carregarConteudoDaEquipe().catch(() => {}); onFechar(data as ModeloBD)
  }
  const excluir = async () => { const { error } = await supabase!.from('modelos_refeicao').delete().eq('id', m.id); avisar(error ? error.message : 'Modelo excluído (fica no histórico).'); if (!error) { carregarConteudoDaEquipe().catch(() => {}); onFechar({ ...m, id: '__removido__' + m.id }) } }
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <button className="link row" onClick={() => onFechar()} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar aos cardápios</button>
      <h1>{existe ? 'Editar modelo' : 'Novo modelo de refeição'}</h1>
      <div className="card stack">
        <div className="field"><span className="label">Refeição</span><div className="segmented">{REFEICOES.map(r => <button key={r.id} type="button" aria-pressed={m.refeicao === r.id} onClick={() => set({ refeicao: r.id })}>{r.nome}</button>)}</div></div>
        <div className="field"><label htmlFor="mod-nome">Nome</label><input id="mod-nome" className="input" value={m.nome} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Baião de dois com salada" /></div>
        <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="field"><span className="label">Tempo de preparo</span><div className="segmented">{([['rapido', 'Até 15 min'], ['medio', 'Até 30 min'], ['longo', 'Mais']] as const).map(([v, n]) => <button key={v} type="button" aria-pressed={m.tempo === v} onClick={() => set({ tempo: v })}>{n}</button>)}</div></div>
          <div className="field grow"><span className="label">Regiões com preferência (vazio = todas)</span><div className="chips">{REGIOES.map(r => <button key={r} type="button" className="chip" aria-pressed={!!m.regioes?.includes(r)} onClick={() => set({ regioes: m.regioes?.includes(r) ? m.regioes.filter(x => x !== r) : [...(m.regioes ?? []), r] })}>{NOME_REGIAO[r]}</button>)}</div></div>
        </div>
      </div>
      <div className="card stack">
        <h3>Alimentos (quantidade de referência)</h3>
        {m.itens.map((it, i) => (
          <div key={i} className="row" style={{ gap: 8 }}>
            <span className="grow small">{base.porId.get(it.id) ? nomeCurto(base.porId.get(it.id)!.nome) : <span style={{ color: 'var(--orange)' }}>Código {it.id} não encontrado</span>}</span>
            <input className="input num" style={{ width: 90, textAlign: 'right' }} inputMode="numeric" value={it.g} onChange={e => setItem(i, { g: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label="Gramas" /><span className="small muted">g</span>
            <label className="row tiny" style={{ gap: 4 }} title="Quantidade que não muda com a meta (ex.: café, azeite)"><input type="checkbox" checked={!!it.fixo} onChange={e => setItem(i, { fixo: e.target.checked || undefined })} /> fixo</label>
            <button type="button" className="icon-btn flat" aria-label="Remover alimento" onClick={() => set({ itens: m.itens.filter((_, k) => k !== i) })}><X size={16} /></button>
          </div>
        ))}
        <SeletorAlimento lista={base.lista} onEscolher={a => set({ itens: [...m.itens, { id: a.id, g: a.medidas[0]?.gramas ?? 100 }] })} />
        <Resumo itens={m.itens} porId={base.porId} />
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => salvar('rascunho')}>Salvar rascunho</button>
        <button className="btn" onClick={() => salvar('publicado')}>Publicar</button>
        {existe && <button className="btn danger" onClick={excluir}><Trash2 size={16} /> Excluir</button>}
      </div>
      {existe && <div className="card"><h3 className="row" style={{ gap: 8, marginBottom: 6 }}><History size={18} /> Histórico de versões</h3><Historico tabela="modelos_refeicao" id={m.id} onRestaurado={() => onFechar()} /></div>}
    </div>
  )
}

function Simulacao({ modelos, porId }: { modelos: ModeloBD[]; porId: Map<string, Alimento> }) {
  const [kcal, setKcal] = useState(2000)
  const [dieta, setDieta] = useState<Perfil['dieta']>('onivoro')
  const [alergias, setAlergias] = useState<Alergeno[]>([])
  const [naoGosta, setNaoGosta] = useState('')
  const [rascunhos, setRascunhos] = useState(false)
  const perfil: Perfil = { apelido: 'Simulação', objetivo: 'manter', atividade: 'leve', dieta, alergias, naoGosta, gostos: [], regiao: 'misturar', tempo: 'medio', orcamento: 'equilibrado', criadoEm: '' }
  const metas = { ...calcularMetas(null), kcal }
  const usados = modelos.filter(m => rascunhos || m.status === 'publicado')
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div className="field"><label htmlFor="sim-kcal">Meta (kcal/dia)</label><input id="sim-kcal" className="input num" style={{ width: 120 }} inputMode="numeric" value={kcal} onChange={e => setKcal(Number(e.target.value.replace(/\D/g, '')) || 0)} /></div>
        <div className="field"><span className="label">Alimentação</span><div className="segmented">{([['onivoro', 'De tudo'], ['vegetariano', 'Vegetariana'], ['vegano', 'Vegana']] as const).map(([v, n]) => <button key={v} type="button" aria-pressed={dieta === v} onClick={() => setDieta(v)}>{n}</button>)}</div></div>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={rascunhos} onChange={e => setRascunhos(e.target.checked)} /> incluir rascunhos</label>
      </div>
      <div className="field"><span className="label">Alergias</span><div className="chips">{(Object.keys(ALERGENOS) as Alergeno[]).map(a => <button key={a} type="button" className="chip" aria-pressed={alergias.includes(a)} onClick={() => setAlergias(alergias.includes(a) ? alergias.filter(x => x !== a) : [...alergias, a])}>{ALERGENOS[a].rotulo}</button>)}</div></div>
      <div className="field"><label htmlFor="sim-ng">Não come</label><input id="sim-ng" className="input" value={naoGosta} onChange={e => setNaoGosta(e.target.value)} placeholder="fígado, quiabo…" /></div>
      {(['cafe', 'almoco', 'lanche', 'jantar'] as Refeicao[]).map(r => {
        const doTipo = usados.filter(m => m.refeicao === r)
        const ok = doTipo.filter(m => modeloPermitido(m, perfil, porId))
        const alvo = metas.kcal * DIVISAO_REFEICOES[r]
        return (
          <div key={r} className="card stack" style={{ gap: 8 }}>
            <div className="row between"><h3>{REFEICOES.find(x => x.id === r)?.nome}</h3><span className="tiny">alvo ≈ {fmt(alvo)} kcal · {ok.length} de {doTipo.length} modelos servem</span></div>
            {ok.length === 0 && <p className="small" style={{ color: 'var(--orange)' }}>Nenhum modelo serve para este perfil. Crie um modelo que atenda a essas restrições.</p>}
            {ok.map(m => { const { itens, total } = montarRefeicao(m, alvo, porId); return (
              <div key={m.id} className="small" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <b>{m.nome}</b> <span className="num muted">· {fmt(total.kcal)} kcal</span>{m.status === 'rascunho' && <span className="tag orange" style={{ marginLeft: 6 }}>rascunho</span>}
                <div className="tiny">{itens.map(i => `${nomeCurto(i.alimento.nome).split(' · ')[0]} ${i.gramas} g`).join(' · ')}</div>
              </div>) })}
          </div>
        )
      })}
    </div>
  )
}

// ======================= A04: receitas =======================
export function EditorReceitas() {
  const base = useAlimentos()
  const [lista, setLista] = useState<ReceitaBD[] | null>(null)
  const [edit, setEdit] = useState<ReceitaBD | null>(null)
  const carregar = async () => { const { data, error } = await supabase!.from('receitas').select('*').order('nome'); if (error) avisar(error.message); setLista((data as ReceitaBD[]) ?? []) }
  useEffect(() => { carregar() }, [])
  if (!base.pronto || !lista) return <p className="muted">Carregando…</p>
  if (edit) return <FormReceita inicial={edit} base={base} onFechar={salvo => { setEdit(null); if (salvo) setLista(l => mesclar(l, salvo)); carregar() }} />
  const nova = (): ReceitaBD => ({ id: 'r_' + uid(), nome: '', emoji: '🍽️', minutos: 30, porcoes: 1, regiao: 'Todas', itens: [], extras: [], passos: [], status: 'rascunho', versao: 0, atualizado_em: new Date().toISOString() })
  return (
    <>
      <Cabecalho titulo="Receitas" texto="Receitas que aparecem em Plano → Receitas. Calorias e alérgenos são calculados pelos alimentos da base." acoes={<button className="btn sm" onClick={() => setEdit(nova())}><Plus size={16} /> Nova receita</button>} />
      <div className="tabela-box"><table className="tabela">
        <thead><tr><th>Receita</th><th>Região</th><th className="n">Tempo</th><th className="n">kcal/porção</th><th>Situação</th><th></th></tr></thead>
        <tbody>{lista.map(r => {
          const n = somar(r.itens.filter(i => base.porId.get(i.id)).map(i => nutrientesDe(base.porId.get(i.id)!, i.g)))
          return (
            <tr key={r.id}><td><b>{r.emoji} {r.nome}</b><div className="tiny">{r.itens.length} ingredientes · v{r.versao}</div></td><td>{r.regiao}</td><td className="n">{r.minutos} min</td><td className="n">{fmt(n.kcal / Math.max(r.porcoes, 1))}</td>
              <td><span className={`tag ${r.status === 'publicado' ? '' : 'orange'}`}>{r.status === 'publicado' ? 'Publicada' : 'Rascunho'}</span></td>
              <td><button className="btn ghost sm" onClick={() => setEdit(r)}>Editar</button></td></tr>
          )
        })}</tbody>
      </table></div>
    </>
  )
}

function FormReceita({ inicial, base, onFechar }: { inicial: ReceitaBD; base: { lista: Alimento[]; porId: Map<string, Alimento> }; onFechar: (salvo?: ReceitaBD | null) => void }) {
  const [r, setR] = useState<ReceitaBD>(inicial)
  const [extras, setExtras] = useState(inicial.extras.join('\n'))
  const [passos, setPassos] = useState(inicial.passos.join('\n'))
  const existe = inicial.versao > 0
  const set = (x: Partial<ReceitaBD>) => setR(v => ({ ...v, ...x }))
  const setItem = (i: number, x: Partial<Receita['itens'][number]>) => set({ itens: r.itens.map((it, k) => (k === i ? { ...it, ...x } : it)) })
  const linhas = (t: string) => t.split('\n').map(s => s.trim()).filter(Boolean)
  const salvar = async (status: Status) => {
    if (r.nome.trim().length < 3) { avisar('Dê um nome com pelo menos 3 letras.'); return }
    if (!r.itens.length) { avisar('Adicione pelo menos um ingrediente.'); return }
    if (!linhas(passos).length) { avisar('Escreva pelo menos um passo do modo de preparo.'); return }
    const linha = { id: r.id, nome: r.nome.trim(), emoji: r.emoji || '🍽️', minutos: r.minutos, porcoes: r.porcoes, regiao: r.regiao, itens: r.itens.map(i => ({ ...i, texto: i.texto.trim() || `${i.g} g de ${nomeCurto(base.porId.get(i.id)?.nome ?? '').split(' · ')[0].toLowerCase()}` })), extras: linhas(extras), passos: linhas(passos), status }
    const { data, error } = existe ? await supabase!.from('receitas').update(linha).eq('id', r.id).select().single() : await supabase!.from('receitas').insert(linha).select().single()
    if (error) { avisar('Não foi possível salvar: ' + error.message); return }
    avisar(status === 'publicado' ? 'Publicada: já aparece no app.' : 'Rascunho salvo.'); carregarConteudoDaEquipe().catch(() => {}); onFechar(data as ReceitaBD)
  }
  const excluir = async () => { const { error } = await supabase!.from('receitas').delete().eq('id', r.id); avisar(error ? error.message : 'Receita excluída (fica no histórico).'); if (!error) { carregarConteudoDaEquipe().catch(() => {}); onFechar({ ...r, id: '__removido__' + r.id }) } }
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <button className="link row" onClick={() => onFechar()} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar às receitas</button>
      <h1>{existe ? 'Editar receita' : 'Nova receita'}</h1>
      <div className="card stack">
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ width: 80 }}><label htmlFor="rec-emoji">Ícone</label><input id="rec-emoji" className="input" style={{ textAlign: 'center' }} value={r.emoji} maxLength={4} onChange={e => set({ emoji: e.target.value })} /></div>
          <div className="field grow"><label htmlFor="rec-nome">Nome</label><input id="rec-nome" className="input" value={r.nome} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Baião de dois" /></div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field" style={{ width: 130 }}><label htmlFor="rec-min">Tempo (min)</label><input id="rec-min" className="input num" inputMode="numeric" value={r.minutos} onChange={e => set({ minutos: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></div>
          <div className="field" style={{ width: 130 }}><label htmlFor="rec-por">Porções</label><input id="rec-por" className="input num" inputMode="numeric" value={r.porcoes} onChange={e => set({ porcoes: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} /></div>
          <div className="field grow"><label htmlFor="rec-reg">Região</label><select id="rec-reg" className="input" value={r.regiao} onChange={e => set({ regiao: e.target.value })}>{['Todas', 'Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'].map(x => <option key={x}>{x}</option>)}</select></div>
        </div>
      </div>
      <div className="card stack">
        <h3>Ingredientes (receita inteira)</h3>
        {r.itens.map((it, i) => (
          <div key={i} className="stack" style={{ gap: 6, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="grow small">{base.porId.get(it.id) ? nomeCurto(base.porId.get(it.id)!.nome) : <span style={{ color: 'var(--orange)' }}>Código {it.id} não encontrado</span>}</span>
              <input className="input num" style={{ width: 90, textAlign: 'right' }} inputMode="numeric" value={it.g} onChange={e => setItem(i, { g: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label="Gramas" /><span className="small muted">g</span>
              <button type="button" className="icon-btn flat" aria-label="Remover ingrediente" onClick={() => set({ itens: r.itens.filter((_, k) => k !== i) })}><X size={16} /></button>
            </div>
            <input className="input" value={it.texto} onChange={e => setItem(i, { texto: e.target.value })} placeholder="Como aparece para a pessoa: ex. 1 xícara de arroz cozido" aria-label="Texto do ingrediente" />
          </div>
        ))}
        <SeletorAlimento lista={base.lista} onEscolher={a => set({ itens: [...r.itens, { id: a.id, g: a.medidas[0]?.gramas ?? 100, texto: '' }] })} />
        <Resumo itens={r.itens} porId={base.porId} porcoes={r.porcoes} />
      </div>
      <div className="card stack">
        <div className="field"><label htmlFor="rec-extras">Temperos e opcionais (um por linha, sem cálculo)</label><textarea id="rec-extras" className="input" value={extras} onChange={e => setExtras(e.target.value)} placeholder={'sal a gosto\ncoentro'} /></div>
        <div className="field"><label htmlFor="rec-passos">Modo de preparo (um passo por linha)</label><textarea id="rec-passos" className="input" style={{ minHeight: 140 }} value={passos} onChange={e => setPassos(e.target.value)} placeholder={'Cozinhe o feijão…\nRefogue o arroz…'} /></div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => salvar('rascunho')}>Salvar rascunho</button>
        <button className="btn" onClick={() => salvar('publicado')}>Publicar</button>
        {existe && <button className="btn danger" onClick={excluir}><Trash2 size={16} /> Excluir</button>}
      </div>
      {existe && <div className="card"><h3 className="row" style={{ gap: 8, marginBottom: 6 }}><History size={18} /> Histórico de versões</h3><Historico tabela="receitas" id={r.id} onRestaurado={() => onFechar()} /></div>}
    </div>
  )
}
