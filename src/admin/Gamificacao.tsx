import { useEffect, useState } from 'react'
import { History, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { avisar } from '../components/ui'
import { supabase } from '../lib/supabase'
import type { MetricaConquista } from '../lib/store'
import { Cabecalho } from './Modulos'

// A11 Gamificação: a equipe cria conquistas e campanhas (conquista com período) sem mexer no código.
type Linha = { id: string; emoji: string; nome: string; criterio: string; metrica: MetricaConquista; alvo: number; termos: string[]; inicio: string | null; fim: string | null; status: 'rascunho' | 'publicado'; ordem: number; versao?: number; atualizado_em?: string }
type Adesao = { id: string; completaram: number; participando: number }
type Versao = { id: number; versao: number; dados: Linha; em: string }

export const METRICAS: Record<MetricaConquista, { nome: string; ajuda: string }> = {
  registros: { nome: 'Alimentos registrados', ajuda: 'Soma de itens registrados (até 10 por dia contam).' },
  dias_registrados: { nome: 'Dias com registro', ajuda: 'Dias em que a pessoa registrou pelo menos uma refeição.' },
  sequencia: { nome: 'Dias seguidos', ajuda: 'Maior sequência de dias seguidos com registro.' },
  dias_completos: { nome: 'Dias completos', ajuda: 'Dias com café da manhã, almoço e jantar registrados.' },
  dias_agua: { nome: 'Dias com 2 L de água', ajuda: 'Dias em que bebeu pelo menos 2 litros.' },
  alimentos_diferentes: { nome: 'Alimentos diferentes', ajuda: 'Quantos alimentos diferentes registrou.' },
  contem_alimento: { nome: 'Registros de um alimento', ajuda: 'Registros cujo nome contém um dos termos (até 3 por dia contam).' },
}
const vazia = (): Linha => ({ id: '', emoji: '🏆', nome: '', criterio: '', metrica: 'dias_registrados', alvo: 5, termos: [], inicio: null, fim: null, status: 'rascunho', ordem: 0 })
const quando = (d?: string) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export function Gamificacao() {
  const [lista, setLista] = useState<Linha[] | null>(null)
  const [adesao, setAdesao] = useState<Record<string, Adesao>>({})
  const [editando, setEditando] = useState<Linha | null>(null)
  const [erro, setErro] = useState('')
  const carregar = () => {
    supabase!.from('conquistas_equipe').select('*').order('ordem').order('nome').then(({ data, error }) => { setErro(error?.message ?? ''); setLista((data as Linha[]) ?? []) })
    supabase!.rpc('painel_conquistas').then(({ data }) => setAdesao(Object.fromEntries(((data as Adesao[]) ?? []).map(a => [a.id, a]))))
  }
  useEffect(() => { carregar() }, [])

  if (editando) return <Form inicial={editando} onFechar={() => { setEditando(null); carregar() }} />
  const hoje = new Date().toISOString().slice(0, 10)
  const situacao = (c: Linha) => c.status === 'rascunho' ? 'rascunho' : c.inicio && c.inicio > hoje ? 'agendada' : c.fim && c.fim < hoje ? 'encerrada' : c.inicio || c.fim ? 'campanha no ar' : 'publicada'

  return (
    <>
      <Cabecalho titulo="Gamificação" texto="Conquistas e campanhas criadas pela equipe. Com data de início e fim, vira campanha. Elas aparecem no app de todo mundo depois de publicadas." acoes={<div className="row" style={{ gap: 8 }}><button className="btn ghost sm" onClick={carregar}><RefreshCw size={16} /> Atualizar</button><button className="btn sm" onClick={() => setEditando(vazia())}><Plus size={16} /> Nova</button></div>} />
      {erro && <div className="card peach small">Não foi possível carregar: {erro}</div>}
      <div className="card small soft">
        <b>Regras contra fraude</b> (iguais no app e no servidor): em campanhas só contam refeições registradas no próprio dia ou no dia seguinte, nada retroativo; por dia contam até 10 registros e até 3 do alimento-alvo; água conta até 1 L por toque. A adesão abaixo é recalculada no servidor a partir do diário sincronizado.
      </div>
      {lista && !lista.length && <div className="card small muted">Nenhuma conquista da equipe ainda. As 10 conquistas padrão do app continuam valendo.</div>}
      {!!lista?.length && (
        <div className="tabela-box"><table className="tabela"><thead><tr><th></th><th>Nome</th><th>Regra</th><th>Período</th><th>Situação</th><th className="n">Participando</th><th className="n">Completaram</th></tr></thead>
          <tbody>{lista.map(c => (
            <tr key={c.id} onClick={() => setEditando(c)} style={{ cursor: 'pointer' }}>
              <td style={{ fontSize: '1.4rem' }}>{c.emoji}</td><td><b>{c.nome}</b><div className="tiny">{c.criterio}</div></td>
              <td className="small">{METRICAS[c.metrica].nome}: {c.alvo}{c.termos.length ? <div className="tiny">{c.termos.join(', ')}</div> : null}</td>
              <td className="small">{c.inicio || c.fim ? `${c.inicio ?? '…'} a ${c.fim ?? '…'}` : 'sempre'}</td>
              <td><span className={`tag${c.status === 'publicado' ? '' : ' gray'}`}>{situacao(c)}</span></td>
              <td className="n">{adesao[c.id]?.participando ?? '—'}</td><td className="n">{adesao[c.id]?.completaram ?? '—'}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </>
  )
}

function Form({ inicial, onFechar }: { inicial: Linha; onFechar: () => void }) {
  const existe = !!inicial.id
  const [c, setC] = useState(inicial)
  const [termos, setTermos] = useState(inicial.termos.join(', '))
  const [salvando, setSalvando] = useState(false)
  const set = (x: Partial<Linha>) => setC(v => ({ ...v, ...x }))
  const lista = termos.split(',').map(t => t.trim()).filter(Boolean)
  const problemas = [
    c.nome.trim().length < 3 && 'Dê um nome (3 letras ou mais).',
    c.criterio.trim().length < 3 && 'Explique o que a pessoa precisa fazer.',
    c.metrica === 'contem_alimento' && !lista.length && 'Informe pelo menos um termo de alimento.',
    c.inicio && c.fim && c.fim < c.inicio && 'O fim vem antes do início.',
  ].filter(Boolean) as string[]

  const salvar = async (status: Linha['status']) => {
    setSalvando(true)
    const linha = { emoji: c.emoji.trim() || '🏆', nome: c.nome.trim(), criterio: c.criterio.trim(), metrica: c.metrica, alvo: c.alvo, termos: c.metrica === 'contem_alimento' ? lista : [], inicio: c.inicio || null, fim: c.fim || null, status, ordem: c.ordem }
    const r = existe
      ? await supabase!.from('conquistas_equipe').update(linha).eq('id', c.id)
      : await supabase!.from('conquistas_equipe').insert({ id: (slug(c.nome) || 'conquista') + '-' + Date.now().toString(36).slice(-4), ...linha })
    setSalvando(false)
    if (r.error) avisar(r.error.message); else { avisar(status === 'publicado' ? 'Publicada! Aparece no app na próxima abertura.' : 'Rascunho salvo.'); onFechar() }
  }
  const apagar = async () => {
    if (!confirm('Apagar esta conquista? Ela some do app (fica no histórico).')) return
    const { error } = await supabase!.from('conquistas_equipe').delete().eq('id', c.id)
    if (error) avisar(error.message); else { avisar('Apagada.'); onFechar() }
  }

  return (
    <>
      <Cabecalho titulo={existe ? c.nome : 'Nova conquista'} texto="Sem data, é uma conquista permanente. Com início e fim, é uma campanha: aparece só nesse período e conta só o que for feito nele." acoes={<button className="btn ghost sm" onClick={() => onFechar()}>Voltar</button>} />
      <div className="card stack" style={{ maxWidth: 760 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ width: 80 }}><label htmlFor="cq-emoji">Ícone</label><input id="cq-emoji" className="input" style={{ textAlign: 'center' }} maxLength={4} value={c.emoji} onChange={e => set({ emoji: e.target.value })} /></div>
          <div className="field grow"><label htmlFor="cq-nome">Nome</label><input id="cq-nome" className="input" maxLength={40} value={c.nome} onChange={e => set({ nome: e.target.value })} placeholder="Ex.: Semana do feijão" /></div>
        </div>
        <div className="field"><label htmlFor="cq-crit">O que a pessoa precisa fazer (aparece no app)</label><input id="cq-crit" className="input" maxLength={120} value={c.criterio} onChange={e => set({ criterio: e.target.value })} placeholder="Ex.: Coma feijão em 5 dias desta semana" /></div>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field grow"><label htmlFor="cq-met">Regra</label><select id="cq-met" className="input" value={c.metrica} onChange={e => set({ metrica: e.target.value as MetricaConquista })}>{Object.entries(METRICAS).map(([k, m]) => <option key={k} value={k}>{m.nome}</option>)}</select></div>
          <div className="field" style={{ width: 120 }}><label htmlFor="cq-alvo">Alvo</label><input id="cq-alvo" className="input num" inputMode="numeric" value={c.alvo} onChange={e => set({ alvo: Math.min(1000, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)) })} /></div>
        </div>
        <p className="tiny">{METRICAS[c.metrica].ajuda}</p>
        {c.metrica === 'contem_alimento' && <div className="field"><label htmlFor="cq-termos">Termos do alimento (separados por vírgula)</label><input id="cq-termos" className="input" value={termos} onChange={e => setTermos(e.target.value)} placeholder="feijão, feijoada" /></div>}
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field"><label htmlFor="cq-ini">Início (opcional)</label><input id="cq-ini" type="date" className="input" value={c.inicio ?? ''} onChange={e => set({ inicio: e.target.value || null })} /></div>
          <div className="field"><label htmlFor="cq-fim">Fim (opcional)</label><input id="cq-fim" type="date" className="input" value={c.fim ?? ''} onChange={e => set({ fim: e.target.value || null })} /></div>
          <div className="field" style={{ width: 100 }}><label htmlFor="cq-ordem">Ordem</label><input id="cq-ordem" className="input num" inputMode="numeric" value={c.ordem} onChange={e => set({ ordem: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></div>
        </div>
        {problemas.map(p => <p key={p} className="small" style={{ color: 'var(--orange)' }}>{p}</p>)}
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" disabled={salvando || !!problemas.length} onClick={() => salvar('publicado')}><Save size={16} /> Publicar</button>
          <button className="btn ghost" disabled={salvando || !!problemas.length} onClick={() => salvar('rascunho')}>Salvar como rascunho</button>
          {existe && <button className="btn ghost" onClick={apagar}><Trash2 size={16} /> Apagar</button>}
        </div>
      </div>
      {existe && <div className="card" style={{ maxWidth: 760 }}><h3 className="row" style={{ gap: 8, marginBottom: 6 }}><History size={18} /> Histórico de versões</h3><HistoricoConquista id={c.id} onRestaurado={onFechar} /><div className="tiny">Versão atual {inicial.versao ?? 1} · {quando(inicial.atualizado_em)}</div></div>}
    </>
  )
}

function HistoricoConquista({ id, onRestaurado }: { id: string; onRestaurado: () => void }) {
  const [v, setV] = useState<Versao[] | null>(null)
  useEffect(() => { supabase!.from('versoes_conteudo').select('id, versao, dados, em').eq('tabela', 'conquistas_equipe').eq('registro_id', id).order('versao', { ascending: false }).limit(20).then(({ data }) => setV((data as Versao[]) ?? [])) }, [id])
  if (!v) return null
  if (!v.length) return <p className="tiny">Sem versões anteriores ainda.</p>
  return (
    <div className="list">{v.map(x => (
      <div key={x.id} className="item" style={{ padding: '8px 0' }}>
        <span className="grow small">v{x.versao} · {x.dados.nome} · {METRICAS[x.dados.metrica]?.nome} {x.dados.alvo} <span className="tag gray">{x.dados.status}</span><div className="tiny">{quando(x.em)}</div></span>
        <button type="button" className="btn ghost sm" onClick={async () => { const { error } = await supabase!.rpc('restaurar_versao', { versao_id: x.id }); avisar(error ? error.message : `Versão ${x.versao} restaurada.`); if (!error) onRestaurado() }}>Restaurar</button>
      </div>
    ))}</div>
  )
}
