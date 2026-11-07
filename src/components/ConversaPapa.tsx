import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { SendHorizontal, Trash2 } from 'lucide-react'
import { Folha, avisar } from './ui'
import { Mascot } from './Mascot'
import { supabase } from '../lib/supabase'
import { somar } from '../lib/alimentos'
import { calcularMetas } from '../lib/metas'
import { REFEICOES, diaVazio, hoje, obterEstado } from '../lib/store'

// T34 Conversa com o Papa: chat com a IA sobre alimentação, com o perfil e o dia da pessoa como contexto.
type Msg = { id: number | string; papel: 'pessoa' | 'papa'; texto: string }
const SUGESTOES = ['O que eu janto hoje?', 'Ideia de lanche barato e prático', 'Como bater minha meta de proteína?', 'Uma receita com o que tenho: ovo, arroz e tomate']

// Só o necessário para personalizar: sem idade, peso ou altura (as metas já vêm calculadas).
function contexto() {
  const e = obterEstado(), p = e.perfil, dia = e.dias[hoje()] ?? diaVazio(), m = calcularMetas(p), t = somar(dia.registros.map(r => r.n))
  return {
    perfil: p && { apelido: p.apelido, objetivo: p.objetivo, dieta: p.dieta, alergias: p.alergias, nao_come: p.naoGosta, gosta: p.gostos, regiao: p.regiao, tempo_para_cozinhar: p.tempo, orcamento: p.orcamento },
    metas_do_dia: { kcal: m.kcal, proteina_g: m.proteina, carboidrato_g: m.carboidrato, gordura_g: m.gordura, agua_ml: m.aguaMl },
    hoje: {
      consumido: { kcal: Math.round(t.kcal), proteina_g: Math.round(t.proteina), carboidrato_g: Math.round(t.carboidrato), gordura_g: Math.round(t.gordura) },
      agua_ml: dia.agua.reduce((s, x) => s + x, 0),
      refeicoes: REFEICOES.map(r => ({ refeicao: r.nome, itens: dia.registros.filter(x => x.refeicao === r.id).map(x => `${x.nome} (${Math.round(x.gramas)} g)`) })).filter(r => r.itens.length),
    },
  }
}

// Formatação mínima: **negrito** e listas com "- ".
function Texto({ t }: { t: string }) {
  const negrito = (l: string) => l.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>)
  const blocos: ReactNode[] = []
  let lista: string[] = []
  const fechar = () => { if (lista.length) blocos.push(<ul key={blocos.length} style={{ margin: '4px 0', paddingLeft: 18 }}>{lista.map((x, i) => <li key={i}>{negrito(x)}</li>)}</ul>); lista = [] }
  for (const l of t.split('\n')) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/)
    if (m) { lista.push(m[1]); continue }
    fechar()
    if (l.trim()) blocos.push(<p key={blocos.length} style={{ margin: '4px 0' }}>{negrito(l.replace(/^#+\s*/, ''))}</p>)
  }
  fechar()
  return <>{blocos}</>
}

export function ConversaPapa({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberta || msgs || !supabase) return
    supabase.from('conversa_papa').select('id,papel,texto').order('id', { ascending: false }).limit(60)
      .then(({ data }) => setMsgs(((data ?? []) as Msg[]).reverse()))
  }, [aberta])
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length, pensando, aberta])

  const enviar = async (t: string) => {
    const mensagem = t.trim()
    if (!mensagem || pensando) return
    setTexto(''); setPensando(true)
    setMsgs(m => [...(m ?? []), { id: 'p' + Date.now(), papel: 'pessoa', texto: mensagem }])
    try {
      const { data } = await supabase!.auth.getSession()
      const r = await fetch('/api/papa', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ mensagem, contexto: contexto() }),
      })
      const res = await r.json().catch(() => ({ erro: 'Resposta inválida.' }))
      if (!r.ok) throw new Error(res.erro || `Erro ${r.status}`)
      setMsgs(m => [...(m ?? []), { id: 'r' + Date.now(), papel: 'papa', texto: res.resposta }])
    } catch (e) {
      setMsgs(m => (m ?? []).slice(0, -1)); setTexto(mensagem)
      avisar(navigator.onLine ? (e as Error).message : 'Sem internet. A conversa precisa de conexão.')
    }
    setPensando(false)
  }

  const apagar = async () => {
    if (!confirm('Apagar toda a conversa com o Papa? Isso não pode ser desfeito.')) return
    const { error } = await supabase!.from('conversa_papa').delete().gte('id', 0)
    if (error) avisar('Não foi possível apagar: ' + error.message); else { setMsgs([]); avisar('Conversa apagada.') }
  }

  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Conversa com o Papa" cheia>
      <div className="stack" style={{ minHeight: '100%', gap: 12 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Mascot size={64} humor="feliz" />
          <div className="balao grow small">Oi! Pergunte o que quiser sobre comida: o que comer, receitas, compras, como chegar na sua meta. Eu uso seu perfil e o que você registrou hoje.</div>
        </div>

        {msgs?.map(m => (
          <div key={m.id} className={m.papel === 'pessoa' ? 'card soft small' : 'card small'}
            style={{ alignSelf: m.papel === 'pessoa' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '10px 14px', borderRadius: m.papel === 'pessoa' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', whiteSpace: m.papel === 'pessoa' ? 'pre-wrap' : undefined }}>
            {m.papel === 'papa' ? <Texto t={m.texto} /> : m.texto}
          </div>
        ))}
        {pensando && <div className="card small muted" style={{ alignSelf: 'flex-start', padding: '10px 14px' }}>O Papa está pensando…</div>}
        {msgs && !msgs.length && !pensando && (
          <div className="row wrap" style={{ gap: 8 }}>{SUGESTOES.map(s => <button key={s} className="chip" onClick={() => enviar(s)}>{s}</button>)}</div>
        )}
        <div ref={fim} />

        <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: 8, marginTop: 'auto' }}>
          <form className="row" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); enviar(texto) }}>
            <textarea className="input grow" rows={1} maxLength={1500} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva para o Papa…" aria-label="Mensagem para o Papa"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto) } }} style={{ resize: 'none', minHeight: 48 }} />
            <button className="btn" disabled={!texto.trim() || pensando} aria-label="Enviar"><SendHorizontal size={20} /></button>
          </form>
          <div className="row between" style={{ marginTop: 6 }}>
            <span className="tiny">Dicas educativas, não substituem nutricionista ou médico.</span>
            {!!msgs?.length && <button className="link tiny row" style={{ gap: 4, whiteSpace: 'nowrap' }} onClick={apagar}><Trash2 size={13} /> Apagar conversa</button>}
          </div>
        </div>
      </div>
    </Folha>
  )
}
