import { useEffect, useState } from 'react'
import { BookOpen, CalendarDays, Home, Plus, Trophy, User } from 'lucide-react'
import { Admin } from './admin/Admin'
import { Avisos, Confete } from './components/ui'
import { Mascot } from './components/Mascot'
import { Tour } from './components/Tour'
import { AvisoConexao } from './components/Conexao'
import { compartilharCartao } from './lib/cartao'
import { sequencia } from './lib/conquistas'
import { Share2 } from 'lucide-react'
import { avisar } from './components/ui'
import { CONQUISTAS, desbloqueadas } from './lib/conquistas'
import { atualizar, hoje, obterEstado, useEstado, type Refeicao } from './lib/store'
import { carregarAlimentos } from './lib/alimentos'
import { carregarConteudoDaEquipe } from './lib/sync'
import { supabase, useSessao } from './lib/supabase'
import { useAcesso } from './lib/assinatura'
import { Assinar } from './screens/Assinar'
import { AdicionarAlimento } from './screens/AdicionarAlimento'
import { Conquistas } from './screens/Conquistas'
import { Diario } from './screens/Diario'
import { Inicio } from './screens/Inicio'
import { Onboarding } from './screens/Onboarding'
import { Perfil } from './screens/Perfil'
import { Plano } from './screens/Plano'

type Aba = 'inicio' | 'diario' | 'plano' | 'conquistas' | 'perfil'

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => { const f = () => setH(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return h
}

function useAjustesNoDocumento() {
  const a = useEstado(e => e.ajustes)
  useEffect(() => {
    const r = document.documentElement
    r.dataset.font = a.fonteGrande ? 'large' : ''
    r.dataset.contrast = a.altoContraste ? 'high' : ''
    r.dataset.motion = a.menosAnimacao ? 'reduced' : ''
    if (a.tema === 'auto') delete r.dataset.theme
    else r.dataset.theme = a.tema === 'escuro' ? 'dark' : 'light'
  }, [a])
}

export function App() {
  useAjustesNoDocumento()
  const hash = useHash()
  const perfil = useEstado(e => e.perfil)
  const sessao = useSessao()
  // Quem pediu o link pelo painel volta para o painel depois de entrar.
  useEffect(() => {
    try { if (sessao && localStorage.getItem('papa-prato:voltar-admin')) { localStorage.removeItem('papa-prato:voltar-admin'); location.hash = 'admin' } } catch { /* ok */ }
  }, [sessao])
  useEffect(() => { carregarAlimentos().catch(() => {}); carregarConteudoDaEquipe().catch(() => {}) }, []) // já começa a baixar a base
  if (hash.startsWith('#admin')) return <Admin />
  if (!perfil) return <Onboarding />
  return <Portao />
}

// Sem assinatura em dia, o app mostra a tela de planos. (Sem servidor configurado, ex.: ambiente local, libera.)
function Portao() {
  const { carregando, acesso } = useAcesso()
  if (!supabase) return <AppPrincipal />
  if (carregando) return <div className="onb" style={{ placeItems: 'center', justifyContent: 'center' }}><Mascot size={110} /></div>
  if (!acesso?.liberado) return <Assinar acesso={acesso} />
  return <AppPrincipal />
}

function AppPrincipal() {
  const [aba, setAba] = useState<Aba>('inicio')
  const [data, setData] = useState(hoje())
  const [add, setAdd] = useState<{ aberta: boolean; refeicao?: Refeicao; modo?: 'foto' }>({ aberta: false })
  const estado = useEstado(e => e)
  const [festa, setFesta] = useState<string | null>(null)

  // Comemora conquistas novas.
  useEffect(() => {
    const novas = desbloqueadas(estado).filter(c => !estado.conquistasVistas.includes(c.id))
    if (novas.length) {
      setFesta(novas[0].id)
      atualizar(e => ({ ...e, conquistasVistas: [...e.conquistasVistas, ...novas.map(c => c.id)] }))
    }
  }, [estado])

  const adicionar = (r?: Refeicao) => setAdd({ aberta: true, refeicao: r })

  // Atalhos do ícone instalado: /app/?acao=registrar, ?acao=foto, ?aba=plano
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const acao = q.get('acao'), abaQ = q.get('aba')
    if (acao === 'registrar') setAdd({ aberta: true })
    if (acao === 'foto') setAdd({ aberta: true, modo: 'foto' })
    if (abaQ && ['inicio', 'diario', 'plano', 'conquistas', 'perfil'].includes(abaQ)) setAba(abaQ as Aba)
    if (q.toString()) history.replaceState(null, '', location.pathname + location.hash)
  }, [])
  const ir = (t: string) => { setAba(t as Aba); scrollTo({ top: 0 }) }
  const conq = CONQUISTAS.find(c => c.id === festa)
  const menos = obterEstado().ajustes.menosAnimacao

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">Papa <b>Prato</b></div>
        <button className="icon-btn" onClick={() => ir('perfil')} aria-label="Perfil"><User size={20} /></button>
      </header>

      <AvisoConexao />
      {aba === 'inicio' && <Inicio irPara={ir} adicionar={adicionar} />}
      {aba === 'diario' && <Diario data={data} setData={setData} adicionar={adicionar} />}
      {aba === 'plano' && <Plano />}
      {aba === 'conquistas' && <Conquistas />}
      {aba === 'perfil' && <Perfil />}

      <nav className="nav" aria-label="Navegação principal">
        <button aria-current={aba === 'inicio' ? 'page' : undefined} onClick={() => ir('inicio')}><Home size={22} />Início</button>
        <button aria-current={aba === 'diario' ? 'page' : undefined} onClick={() => ir('diario')}><BookOpen size={22} />Diário</button>
        <button className="fab" onClick={() => adicionar()} aria-label="Registrar alimento"><Plus size={28} /></button>
        <button aria-current={aba === 'plano' ? 'page' : undefined} onClick={() => ir('plano')}><CalendarDays size={22} />Plano</button>
        <button aria-current={aba === 'conquistas' ? 'page' : undefined} onClick={() => ir('conquistas')}><Trophy size={22} />Conquistas</button>
      </nav>

      <AdicionarAlimento aberta={add.aberta} refeicaoInicial={add.refeicao} modoInicial={add.modo} data={aba === 'diario' ? data : hoje()} onFechar={() => setAdd({ aberta: false })} />
      <Avisos />
      {!estado.tourVisto && !conq && <Tour onFim={() => scrollTo({ top: 0 })} />}

      {conq && (
        <div className="festa" role="dialog" aria-label="Nova conquista" onClick={() => setFesta(null)}>
          {!menos && <Confete />}
          <div className="stack" style={{ justifyItems: 'center', maxWidth: 320 }}>
            <Mascot size={180} humor="festa" />
            <span style={{ fontSize: '3rem' }}>{conq.emoji}</span>
            <h1>Você conseguiu!</h1>
            <p className="muted">Nova conquista: <b>{conq.nome}</b><br />{conq.criterio}.</p>
            <button className="btn ghost block" onClick={async e => { e.stopPropagation(); const r = await compartilharCartao(conq, sequencia(obterEstado())); if (r === 'baixado') avisar('Imagem da conquista salva!') }}><Share2 size={18} /> Compartilhar conquista</button>
            <button className="btn block" onClick={() => setFesta(null)}>Continuar</button>
          </div>
        </div>
      )}
    </div>
  )
}
