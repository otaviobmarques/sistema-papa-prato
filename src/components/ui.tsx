import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { carregarAlimentos, baseCarregada, type Alimento } from '../lib/alimentos'
import { useEstado, type AlimentoPersonalizado } from '../lib/store'

export const fmt = (n: number, casas = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })

export function Anel({ valor, max, tamanho = 150, espessura = 14, cor = 'var(--green)', children }: { valor: number; max: number; tamanho?: number; espessura?: number; cor?: string; children?: ReactNode }) {
  const r = (tamanho - espessura) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(valor / Math.max(max, 1), 1)
  return (
    <div className="ring" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} aria-hidden>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={espessura} />
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={valor > max * 1.1 ? 'var(--orange)' : cor} strokeWidth={espessura} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  )
}

export function Macro({ nome, valor, meta, cor }: { nome: string; valor: number; meta: number; cor: string }) {
  return (
    <div className="macro">
      <div className="row between small"><span className="muted">{nome}</span><span className="num"><b>{fmt(valor)}</b><span className="muted"> / {fmt(meta)} g</span></span></div>
      <div className="bar"><span style={{ width: `${Math.min(100, (valor / Math.max(meta, 1)) * 100)}%`, background: cor }} /></div>
    </div>
  )
}

export function Folha({ aberta, onFechar, titulo, children, cheia = false }: { aberta: boolean; onFechar: () => void; titulo?: string; children: ReactNode; cheia?: boolean }) {
  useEffect(() => {
    if (!aberta) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [aberta, onFechar])
  if (!aberta) return null
  return (
    <div className="overlay" onClick={onFechar}>
      <div className={`sheet ${cheia ? 'full' : ''}`} role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <div className="handle" />
        {titulo && (
          <div className="row between" style={{ marginBottom: 14 }}>
            <h2>{titulo}</h2>
            <button className="icon-btn flat" onClick={onFechar} aria-label="Fechar"><X size={22} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ---- aviso rápido com "desfazer" ----
type Aviso = { texto: string; desfazer?: () => void }
let mostrarAviso: (a: Aviso) => void = () => {}
export const avisar = (texto: string, desfazer?: () => void) => mostrarAviso({ texto, desfazer })
export function Avisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  useEffect(() => {
    let t: number
    mostrarAviso = a => { setAviso(a); clearTimeout(t); t = window.setTimeout(() => setAviso(null), 4000) }
    return () => clearTimeout(t)
  }, [])
  if (!aviso) return null
  return (
    <div className="toast" role="status">
      <span>{aviso.texto}</span>
      {aviso.desfazer && <button onClick={() => { aviso.desfazer!(); setAviso(null) }}>Desfazer</button>}
    </div>
  )
}

export function Confete({ quantidade = 60 }: { quantidade?: number }) {
  const cores = ['#16A34A', '#C2410C', '#FDBA74', '#BEF264', '#2563EB', '#FACC15']
  const [pecas] = useState(() => Array.from({ length: quantidade }, (_, i) => ({
    left: Math.random() * 100, dur: 2 + Math.random() * 2.5, delay: Math.random() * 0.8, cor: cores[i % cores.length], rot: Math.random() * 360,
  })))
  return <>{pecas.map((p, i) => <span key={i} className="confete" style={{ left: `${p.left}%`, background: p.cor, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)` }} />)}</>
}

// Base de alimentos + alimentos cadastrados no painel administrativo.
export function paraAlimento(p: AlimentoPersonalizado): Alimento {
  return { id: p.id, nome: p.nome, fonte: 'TACO', kcal: p.kcal, proteina: p.proteina, carboidrato: p.carboidrato, gordura: p.gordura, fibra: p.fibra, sodio: null, medidas: p.medidas, termos: '', busca: p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), personalizado: true }
}
export function useAlimentos() {
  const [base, setBase] = useState(baseCarregada())
  const [erro, setErro] = useState<string | null>(null)
  const pers = useEstado(e => e.alimentosPersonalizados)
  useEffect(() => { if (!base) carregarAlimentos().then(setBase).catch(e => setErro(String(e.message ?? e))) }, [base])
  const junto = useMemo(() => {
    if (!base) return null
    const publicados = pers.filter(p => p.publicado).map(paraAlimento)
    if (!publicados.length) return { lista: base.lista, porId: base.porId }
    const porId = new Map(base.porId)
    publicados.forEach(p => porId.set(p.id, p))
    return { lista: [...publicados, ...base.lista], porId }
  }, [base, pers])
  if (!base || !junto) return { pronto: false as const, erro }
  return { pronto: true as const, ...junto, citacao: base.citacao, erro: null }
}
