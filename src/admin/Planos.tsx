import { useEffect, useState } from 'react'
import { History, RefreshCw, Save } from 'lucide-react'
import { avisar } from '../components/ui'
import { supabase } from '../lib/supabase'
import { usePapel } from '../lib/equipe'
import { Cabecalho } from './Modulos'

// Planos do Papa Prato Plus. O preço vale para novas assinaturas; quem já assina mantém o valor contratado no Asaas.
// Só administradores mudam (o banco garante isso); o resto da equipe vê em modo leitura.

export type Plano = { id: string; nome: string; preco: number; meses: number; teste_dias: number; descricao: string; destaque: boolean; ativo: boolean; ordem: number; versao?: number; atualizado_em?: string }
type Versao = { id: number; versao: number; dados: Plano; em: string }

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const lerPreco = (t: string) => Number(t.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
const quando = (d?: string) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function Planos() {
  const { papel } = usePapel()
  const admin = papel === 'admin'
  const [planos, setPlanos] = useState<Plano[] | null>(null)
  const [erro, setErro] = useState('')
  const carregar = () => supabase!.from('planos').select('*').order('ordem').then(({ data, error }) => { setErro(error?.message ?? ''); setPlanos((data as Plano[]) ?? []) })
  useEffect(() => { carregar() }, [])
  const mensal = planos?.find(p => p.meses === 1 && p.ativo)?.preco

  return (
    <>
      <Cabecalho titulo="Planos e preços" texto="Preços do Papa Prato Plus que aparecem no site e no app. Uma mudança vale para quem assinar depois dela; quem já assina continua com o valor contratado." acoes={<button className="btn ghost sm" onClick={carregar}><RefreshCw size={16} /> Atualizar</button>} />
      {!admin && papel && <div className="card peach small">Só administradores podem mudar preços. Você está vendo em modo leitura.</div>}
      {erro && <div className="card peach small">Não foi possível carregar: {erro}</div>}
      <div className="grid-planos" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'start' }}>
        {planos?.map(p => <FormPlano key={p.id + (p.versao ?? 0)} inicial={p} mensal={mensal} podeEditar={admin} onSalvo={carregar} />)}
      </div>
    </>
  )
}

function FormPlano({ inicial, mensal, podeEditar, onSalvo }: { inicial: Plano; mensal?: number; podeEditar: boolean; onSalvo: () => void }) {
  const [p, setP] = useState(inicial)
  const [preco, setPreco] = useState(inicial.preco.toFixed(2).replace('.', ','))
  const [salvando, setSalvando] = useState(false)
  const [historico, setHistorico] = useState(false)
  const set = (x: Partial<Plano>) => setP(v => ({ ...v, ...x }))
  const valor = lerPreco(preco)
  const valido = valor > 0 && valor < 10000 && p.nome.trim().length >= 2
  const porMes = valido ? valor / p.meses : 0
  const economia = mensal && p.meses > 1 && valido ? Math.round((1 - porMes / mensal) * 100) : 0
  const mudou = valor !== inicial.preco || (['nome', 'meses', 'teste_dias', 'descricao', 'destaque', 'ativo'] as const).some(k => p[k] !== inicial[k])

  const salvar = async () => {
    setSalvando(true)
    const { error } = await supabase!.from('planos').update({ nome: p.nome.trim(), preco: Math.round(valor * 100) / 100, meses: p.meses, teste_dias: p.teste_dias, descricao: p.descricao.trim(), destaque: p.destaque, ativo: p.ativo }).eq('id', p.id)
    setSalvando(false)
    avisar(error ? error.message : `Plano ${p.nome} salvo.`)
    if (!error) onSalvo()
  }
  const dis = !podeEditar

  return (
    <div className="card stack" style={{ gap: 12, boxShadow: p.destaque ? 'inset 0 0 0 2px var(--orange)' : undefined, opacity: p.ativo ? 1 : .7 }}>
      <div className="row between"><h3>{p.nome}</h3>{p.destaque && <span className="tag">destaque</span>}{!p.ativo && <span className="tag gray">oculto</span>}</div>
      <div><b className="num" style={{ fontSize: 28 }}>{valido ? reais(valor) : '—'}</b> <span className="small muted">a cada {p.meses === 1 ? 'mês' : `${p.meses} meses`}</span>
        {p.meses > 1 && valido && <div className="small muted">{reais(porMes)} por mês{economia > 0 ? ` · ${economia}% mais barato que o mensal` : ''}</div>}
      </div>
      <div className="field"><label htmlFor={`pl-nome-${p.id}`}>Nome</label><input id={`pl-nome-${p.id}`} className="input" value={p.nome} disabled={dis} maxLength={40} onChange={e => set({ nome: e.target.value })} /></div>
      <div className="row" style={{ gap: 10 }}>
        <div className="field grow"><label htmlFor={`pl-preco-${p.id}`}>Preço (R$)</label><input id={`pl-preco-${p.id}`} className="input num" inputMode="decimal" value={preco} disabled={dis} onChange={e => setPreco(e.target.value)} aria-invalid={!valido} /></div>
        <div className="field" style={{ width: 120 }}><label htmlFor={`pl-meses-${p.id}`}>Cobrança</label><select id={`pl-meses-${p.id}`} className="input" value={p.meses} disabled={dis} onChange={e => set({ meses: Number(e.target.value) })}>{[1, 3, 6, 12].map(m => <option key={m} value={m}>{m === 1 ? 'Mensal' : m === 3 ? 'Trimestral' : m === 6 ? 'Semestral' : 'Anual'}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor={`pl-teste-${p.id}`}>Dias grátis para testar</label><input id={`pl-teste-${p.id}`} className="input num" style={{ width: 100 }} inputMode="numeric" value={p.teste_dias} disabled={dis} onChange={e => set({ teste_dias: Math.min(30, Number(e.target.value.replace(/\D/g, '')) || 0) })} /></div>
      <div className="field"><label htmlFor={`pl-desc-${p.id}`}>Frase curta</label><input id={`pl-desc-${p.id}`} className="input" value={p.descricao} maxLength={140} disabled={dis} onChange={e => set({ descricao: e.target.value })} /></div>
      <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={p.destaque} disabled={dis} onChange={e => set({ destaque: e.target.checked })} /> Destacar como "mais vantajoso"</label>
      <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={p.ativo} disabled={dis} onChange={e => set({ ativo: e.target.checked })} /> Mostrar no site e no app</label>
      {podeEditar && <button className="btn sm" disabled={!mudou || !valido || salvando} onClick={salvar}><Save size={16} /> {salvando ? 'Salvando…' : 'Salvar'}</button>}
      <div className="tiny">Versão {inicial.versao ?? 1} · alterado em {quando(inicial.atualizado_em)}</div>
      <button className="btn ghost sm" type="button" onClick={() => setHistorico(h => !h)}><History size={16} /> {historico ? 'Esconder histórico' : 'Histórico de preços'}</button>
      {historico && <HistoricoPlano id={p.id} podeRestaurar={podeEditar} onRestaurado={onSalvo} />}
    </div>
  )
}

function HistoricoPlano({ id, podeRestaurar, onRestaurado }: { id: string; podeRestaurar: boolean; onRestaurado: () => void }) {
  const [v, setV] = useState<Versao[] | null>(null)
  useEffect(() => { supabase!.from('versoes_conteudo').select('id, versao, dados, em').eq('tabela', 'planos').eq('registro_id', id).order('versao', { ascending: false }).limit(20).then(({ data }) => setV((data as Versao[]) ?? [])) }, [id])
  if (!v) return null
  if (!v.length) return <p className="tiny">Sem mudanças anteriores.</p>
  return (
    <div className="list">{v.map(x => (
      <div key={x.id} className="item" style={{ padding: '8px 0' }}>
        <span className="grow small">v{x.versao} · {reais(Number(x.dados.preco))} {x.dados.ativo ? '' : '(oculto)'}<div className="tiny">até {quando(x.em)}</div></span>
        {podeRestaurar && <button type="button" className="btn ghost sm" onClick={async () => { const { error } = await supabase!.rpc('restaurar_versao', { versao_id: x.id }); avisar(error ? error.message : `Versão ${x.versao} restaurada.`); if (!error) onRestaurado() }}>Restaurar</button>}
      </div>
    ))}</div>
  )
}
