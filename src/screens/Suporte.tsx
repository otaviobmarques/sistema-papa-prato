import { useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle, Plus, Send } from 'lucide-react'
import { Folha, avisar } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { FormularioLink, contasDisponiveis } from '../components/Conta'
import { supabase, useSessao } from '../lib/supabase'

// A08 (lado da pessoa): dúvidas frequentes e chamados com a equipe.
type Ticket = { id: number; assunto: string; categoria: string; status: string; atualizado_em: string }
type Msg = { id: number; da_equipe: boolean; texto: string; em: string }
export const CATEGORIAS: Record<string, string> = { duvida: 'Dúvida', problema: 'Problema no app', sugestao: 'Sugestão', privacidade: 'Privacidade e dados', conta: 'Minha conta' }
export const STATUS: Record<string, string> = { aberto: 'Aguardando a equipe', respondido: 'Respondido', fechado: 'Encerrado' }

const FAQ = [
  ['Como registro uma refeição?', 'Toque no botão laranja (+) e busque o alimento, tire uma foto do prato ou leia o código de barras. Depois escolha a medida e a refeição.'],
  ['Como mudo minha meta?', 'Em Perfil, atualize peso, altura, idade, atividade e objetivo. A meta é recalculada na hora.'],
  ['O cardápio não combina comigo', 'Em Perfil, ajuste alergias, o que você não come e a região. No Plano, toque em "Trocar" em qualquer refeição ou em "Gerar um novo cardápio".'],
  ['Meus dados estão seguros?', 'Só você vê o seu diário. Em Perfil → Privacidade você baixa seus dados, muda permissões ou exclui a conta.'],
  ['Funciona sem internet?', 'Sim. Tudo fica salvo no aparelho e é sincronizado quando a conexão voltar.'],
]

export function Suporte({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const sessao = useSessao()
  const [tela, setTela] = useState<'inicio' | 'novo' | number>('inicio')
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const carregar = async () => {
    if (!supabase || !sessao) return
    const { data } = await supabase.from('tickets').select('id, assunto, categoria, status, atualizado_em').order('atualizado_em', { ascending: false })
    setTickets(data ?? [])
  }
  useEffect(() => { if (aberta) { setTela('inicio'); carregar() } }, [aberta, sessao?.user.id])

  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo={tela === 'inicio' ? 'Ajuda e suporte' : undefined} cheia>
      {tela === 'inicio' && (
        <div className="stack">
          <div className="row" style={{ alignItems: 'flex-start' }}><Mascot size={64} /><div className="balao grow small">Oi! Veja as dúvidas mais comuns ou fale direto com a equipe.</div></div>
          <div className="card" style={{ padding: '4px 18px' }}>
            {FAQ.map(([p, r]) => <details key={p} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}><summary style={{ fontWeight: 600, cursor: 'pointer' }}>{p}</summary><p className="small muted" style={{ marginTop: 8 }}>{r}</p></details>)}
          </div>
          <div className="row between"><h3>Falar com a equipe</h3>{sessao && <button className="btn sm" onClick={() => setTela('novo')}><Plus size={16} /> Novo chamado</button>}</div>
          {!contasDisponiveis ? <p className="muted small">O atendimento ainda não está disponível nesta versão.</p>
            : !sessao ? <div className="card stack"><p className="small muted">Para abrir um chamado, entre na sua conta. Assim a equipe consegue te responder.</p><FormularioLink textoBotao="Entrar ou criar conta" /></div>
            : tickets === null ? <p className="muted small">Carregando…</p>
            : tickets.length === 0 ? <div className="card empty"><MessageCircle />Você ainda não abriu nenhum chamado.</div>
            : <div className="card list" style={{ padding: '0 16px' }}>{tickets.map(t => (
                <button key={t.id} className="item-btn" onClick={() => setTela(t.id)}>
                  <div className="grow"><b>{t.assunto}</b><div className="tiny">{CATEGORIAS[t.categoria]} · {new Date(t.atualizado_em).toLocaleDateString('pt-BR')}</div></div>
                  <span className={`tag ${t.status === 'respondido' ? '' : t.status === 'aberto' ? 'orange' : 'gray'}`}>{STATUS[t.status]}</span>
                </button>))}</div>}
        </div>
      )}
      {tela === 'novo' && <NovoChamado onVoltar={() => setTela('inicio')} onCriado={id => { carregar(); setTela(id) }} />}
      {typeof tela === 'number' && <Conversa id={tela} onVoltar={() => { carregar(); setTela('inicio') }} />}
    </Folha>
  )
}

function NovoChamado({ onVoltar, onCriado }: { onVoltar: () => void; onCriado: (id: number) => void }) {
  const sessao = useSessao()
  const [categoria, setCategoria] = useState('duvida')
  const [assunto, setAssunto] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!supabase || !sessao) return
    setEnviando(true)
    const { data, error } = await supabase.from('tickets').insert({ user_id: sessao.user.id, assunto: assunto.trim(), categoria }).select('id').single()
    if (!error && data) {
      const r = await supabase.from('ticket_mensagens').insert({ ticket_id: data.id, autor_id: sessao.user.id, texto: texto.trim() })
      if (!r.error) { avisar('Chamado enviado! A equipe responde por aqui.'); onCriado(data.id); return }
    }
    avisar('Não foi possível enviar agora. Tente de novo.'); setEnviando(false)
  }
  return (
    <form className="stack" onSubmit={enviar}>
      <button type="button" className="link row" onClick={onVoltar} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar</button>
      <h2>Novo chamado</h2>
      <div className="field"><span className="label">Sobre o quê?</span><div className="chips">{Object.entries(CATEGORIAS).map(([k, v]) => <button type="button" key={k} className="chip" aria-pressed={categoria === k} onClick={() => setCategoria(k)}>{v}</button>)}</div></div>
      <div className="field"><label htmlFor="sup-assunto">Assunto</label><input id="sup-assunto" className="input" required minLength={3} maxLength={120} value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Ex.: Não consigo registrar o almoço" /></div>
      <div className="field"><label htmlFor="sup-texto">Conte o que aconteceu</label><textarea id="sup-texto" className="input" required maxLength={4000} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Quanto mais detalhes, mais rápido a gente ajuda." /></div>
      <p className="tiny">A equipe vê sua mensagem e seu e-mail mascarado. Ela não tem acesso ao seu diário.</p>
      <button className="btn block" disabled={enviando || assunto.trim().length < 3 || !texto.trim()}>{enviando ? 'Enviando…' : 'Enviar chamado'}</button>
    </form>
  )
}

export function Conversa({ id, onVoltar, equipe = false }: { id: number; onVoltar: () => void; equipe?: boolean }) {
  const sessao = useSessao()
  const [t, setT] = useState<Ticket | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [falhou, setFalhou] = useState(false)
  const carregar = async () => {
    if (!supabase) return
    setFalhou(false)
    const [{ data: tk, error: e1 }, { data: ms }] = await Promise.all([
      supabase.from('tickets').select('id, assunto, categoria, status, atualizado_em').eq('id', id).single(),
      supabase.from('ticket_mensagens').select('id, da_equipe, texto, em').eq('ticket_id', id).order('em'),
    ])
    if (e1 || !tk) { setFalhou(true); return }
    setT(tk); setMsgs(ms ?? [])
  }
  useEffect(() => { carregar() }, [id])
  const responder = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!supabase || !sessao || !texto.trim()) return
    const { error } = await supabase.from('ticket_mensagens').insert({ ticket_id: id, autor_id: sessao.user.id, da_equipe: equipe, texto: texto.trim() })
    if (error) { avisar('Não foi possível enviar.'); return }
    setTexto(''); carregar()
  }
  const encerrar = async () => { if (!supabase) return; await supabase.from('tickets').update({ status: 'fechado' }).eq('id', id); avisar('Chamado encerrado.'); carregar() }
  if (falhou) return <div className="stack"><button className="link row" onClick={onVoltar} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar</button><p className="small">Não foi possível abrir o chamado agora.</p><button className="btn ghost" onClick={carregar}>Tentar de novo</button></div>
  if (!t) return <p className="muted small">Carregando…</p>
  return (
    <div className="stack">
      <button className="link row" onClick={onVoltar} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar</button>
      <div><h2>{t.assunto}</h2><p className="tiny">{CATEGORIAS[t.categoria]} · {STATUS[t.status]}</p></div>
      <div className="stack" style={{ gap: 10 }}>
        {msgs.map(m => {
          const minha = m.da_equipe === equipe
          return (
            <div key={m.id} style={{ alignSelf: minha ? 'flex-end' : 'flex-start', maxWidth: '85%', background: minha ? 'var(--green-soft)' : 'var(--surface)', borderRadius: 18, padding: '10px 14px', boxShadow: 'var(--shadow)' }}>
              <div className="tiny" style={{ marginBottom: 4 }}>{m.da_equipe ? 'Equipe Papa Prato' : equipe ? 'Pessoa usuária' : 'Você'} · {new Date(m.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</div>
            </div>
          )
        })}
      </div>
      {t.status !== 'fechado' ? (
        <form className="stack" style={{ gap: 8 }} onSubmit={responder}>
          <textarea className="input" aria-label="Sua mensagem" value={texto} onChange={e => setTexto(e.target.value)} maxLength={4000} placeholder={equipe ? 'Responder à pessoa…' : 'Escreva uma mensagem…'} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" disabled={!texto.trim()}><Send size={16} /> Enviar</button>
            <button type="button" className="btn ghost" onClick={encerrar}>Encerrar chamado</button>
          </div>
        </form>
      ) : <p className="tiny">Chamado encerrado. Se precisar de mais ajuda, abra um novo.</p>}
    </div>
  )
}
