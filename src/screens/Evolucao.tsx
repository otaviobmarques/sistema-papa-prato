import { useMemo, useState } from 'react'
import { Folha, avisar, fmt } from '../components/ui'
import { somar } from '../lib/alimentos'
import { calcularMetas } from '../lib/metas'
import { diaVazio, hoje, registrarPeso, somarDias, useEstado } from '../lib/store'

// Evolução: calorias e água por dia contra a meta, dias registrados e o histórico de peso.
// Gráficos de uma série cada (sem legenda; o título diz o que é), barras finas, toque mostra o valor.
type Ponto = { chave: string; rotulo: string; valor: number }
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const rotuloDia = (k: string) => { const [a, m, d] = k.split('-').map(Number); const dt = new Date(a, m - 1, d); return `${DIA_SEM[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }

function Barras({ pontos, meta, cor, unidade, formato = (v: number) => fmt(v) }: { pontos: Ponto[]; meta?: number; cor: string; unidade: string; formato?: (v: number) => string }) {
  const [sel, setSel] = useState<number | null>(null)
  const L = 320, A = 120, topo = 14, base = A - 4
  const max = Math.max(1, meta ?? 0, ...pontos.map(p => p.valor)) * 1.1
  const banda = L / pontos.length, larg = Math.min(24, banda * 0.62)
  const y = (v: number) => base - (v / max) * (base - topo)
  const atual = sel ?? pontos.length - 1
  const p = pontos[atual]
  return (
    <div>
      <div className="row between small" style={{ minHeight: 22 }}>
        <span className="muted">{p ? rotuloDia(p.chave) : ''}</span>
        <b className="num">{p ? (p.valor ? `${formato(p.valor)} ${unidade}` : 'sem registro') : ''}</b>
      </div>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label={`Gráfico de ${unidade} por dia`} style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }} onMouseLeave={() => setSel(null)}>
        <line x1={0} x2={L} y1={base} y2={base} stroke="var(--line)" strokeWidth={1} />
        {meta ? <>
          <line x1={0} x2={L} y1={y(meta)} y2={y(meta)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="4 4" />
          <text x={L} y={y(meta) - 4} textAnchor="end" fontSize={10} fill="var(--ink-2)">meta {formato(meta)} {unidade}</text>
        </> : null}
        {pontos.map((pt, i) => {
          const x = i * banda + (banda - larg) / 2, h = Math.max(0, base - y(pt.valor)), r = Math.min(4, larg / 2, h)
          const yTopo = base - h
          return (
            <g key={pt.chave} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <rect x={i * banda} y={0} width={banda} height={A} fill="transparent" />
              {h > 0 && <path d={`M${x},${base} V${yTopo + r} Q${x},${yTopo} ${x + r},${yTopo} H${x + larg - r} Q${x + larg},${yTopo} ${x + larg},${yTopo + r} V${base} Z`}
                fill={cor} opacity={i === atual ? 1 : 0.55} />}
            </g>
          )
        })}
      </svg>
      <div className="row between tiny" style={{ marginTop: 2 }}><span>{pontos[0] && rotuloDia(pontos[0].chave)}</span><span>hoje</span></div>
    </div>
  )
}

function LinhaPeso({ pesos }: { pesos: { data: string; kg: number }[] }) {
  const [sel, setSel] = useState<number | null>(null)
  if (pesos.length < 2) return <p className="tiny">Registre o peso em dias diferentes para ver a linha da sua evolução.</p>
  const L = 320, A = 110, pad = 8
  const t = (k: string) => new Date(k + 'T12:00').getTime()
  const t0 = t(pesos[0].data), t1 = t(pesos[pesos.length - 1].data)
  const min = Math.min(...pesos.map(p => p.kg)) - 1, max = Math.max(...pesos.map(p => p.kg)) + 1
  const x = (k: string) => pad + ((t(k) - t0) / Math.max(1, t1 - t0)) * (L - pad * 2)
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (A - pad * 2)
  const atual = sel ?? pesos.length - 1, p = pesos[atual]
  return (
    <div>
      <div className="row between small"><span className="muted">{rotuloDia(p.data)}</span><b className="num">{fmt(p.kg, 1)} kg</b></div>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label="Gráfico do peso ao longo do tempo" style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setSel(null)}>
        <text x={0} y={y(max - 1) - 4} fontSize={10} fill="var(--ink-2)">{fmt(max - 1, 1)}</text>
        <text x={0} y={y(min + 1) + 12} fontSize={10} fill="var(--ink-2)">{fmt(min + 1, 1)}</text>
        <polyline points={pesos.map(q => `${x(q.data)},${y(q.kg)}`).join(' ')} fill="none" stroke="var(--chart-peso)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pesos.map((q, i) => (
          <g key={q.data} onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
            <circle cx={x(q.data)} cy={y(q.kg)} r={14} fill="transparent" />
            <circle cx={x(q.data)} cy={y(q.kg)} r={i === atual ? 5 : 4} fill="var(--chart-peso)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
      </svg>
    </div>
  )
}

export function Evolucao({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const dias = useEstado(e => e.dias)
  const perfil = useEstado(e => e.perfil)
  const pesos = useEstado(e => e.pesos) ?? []
  const [periodo, setPeriodo] = useState<7 | 30>(7)
  const [tabela, setTabela] = useState(false)
  const [peso, setPeso] = useState('')
  const metas = calcularMetas(perfil)

  const linhas = useMemo(() => {
    const h = hoje()
    return Array.from({ length: periodo }, (_, i) => somarDias(h, i - periodo + 1)).map(k => {
      const d = dias[k] ?? diaVazio()
      return { chave: k, kcal: Math.round(somar(d.registros.map(r => r.n)).kcal), agua: d.agua.reduce((s, x) => s + x, 0), registros: d.registros.length }
    })
  }, [dias, periodo])
  const comRegistro = linhas.filter(l => l.registros > 0)
  const mediaKcal = comRegistro.length ? comRegistro.reduce((s, l) => s + l.kcal, 0) / comRegistro.length : 0
  const mediaAgua = linhas.reduce((s, l) => s + l.agua, 0) / linhas.length
  const pesos90 = pesos.filter(p => p.data >= somarDias(hoje(), -90))
  const variacao = pesos90.length >= 2 ? pesos90[pesos90.length - 1].kg - pesos90[0].kg : null

  const salvarPeso = (e: React.FormEvent) => {
    e.preventDefault()
    const kg = Number(peso.replace(',', '.'))
    if (!(kg >= 25 && kg <= 350)) { avisar('Digite o peso em kg, por exemplo 68,5.'); return }
    registrarPeso(hoje(), Math.round(kg * 10) / 10); setPeso(''); avisar('Peso de hoje registrado.')
  }

  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Sua evolução" cheia>
      <div className="stack">
        <div className="row" style={{ gap: 8 }}>
          {([7, 30] as const).map(n => <button key={n} className="chip" aria-pressed={periodo === n} onClick={() => setPeriodo(n)}>{n} dias</button>)}
          <button className="chip" aria-pressed={tabela} onClick={() => setTabela(t => !t)} style={{ marginLeft: 'auto' }}>{tabela ? 'Ver gráficos' : 'Ver tabela'}</button>
        </div>

        <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="kpi"><small>Dias registrados</small><strong className="num">{comRegistro.length}/{periodo}</strong></div>
          <div className="kpi"><small>Média por dia</small><strong className="num">{mediaKcal ? fmt(mediaKcal) : '—'}</strong><small>kcal (meta {fmt(metas.kcal)})</small></div>
          <div className="kpi"><small>Água por dia</small><strong className="num">{fmt(mediaAgua / 1000, 1)} L</strong><small>meta {fmt(metas.aguaMl / 1000, 1)} L</small></div>
        </div>

        {tabela ? (
          <div className="tabela-box"><table className="tabela"><thead><tr><th>Dia</th><th className="n">kcal</th><th className="n">Água</th></tr></thead>
            <tbody>{[...linhas].reverse().map(l => <tr key={l.chave}><td>{rotuloDia(l.chave)}</td><td className="n">{l.registros ? fmt(l.kcal) : '—'}</td><td className="n">{l.agua ? `${fmt(l.agua / 1000, 1)} L` : '—'}</td></tr>)}</tbody></table></div>
        ) : (
          <>
            <div className="card"><h3 style={{ marginBottom: 6 }}>Calorias por dia</h3><Barras pontos={linhas.map(l => ({ chave: l.chave, rotulo: '', valor: l.kcal }))} meta={metas.kcal} cor="var(--chart-kcal)" unidade="kcal" /></div>
            <div className="card"><h3 style={{ marginBottom: 6 }}>Água por dia</h3><Barras pontos={linhas.map(l => ({ chave: l.chave, rotulo: '', valor: l.agua }))} meta={metas.aguaMl} cor="var(--chart-agua)" unidade="L" formato={v => fmt(v / 1000, 1)} /></div>
          </>
        )}

        <div className="card stack">
          <div className="row between"><h3>Peso</h3>{variacao != null && <span className="small num">{variacao === 0 ? 'estável' : `${variacao > 0 ? '+' : '−'}${fmt(Math.abs(variacao), 1)} kg em 90 dias`}</span>}</div>
          <LinhaPeso pesos={pesos90} />
          <form className="row" style={{ gap: 8 }} onSubmit={salvarPeso}>
            <input className="input grow num" inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} placeholder={perfil?.peso ? `Hoje (último: ${fmt(perfil.peso, 1)} kg)` : 'Seu peso hoje, em kg'} aria-label="Peso de hoje em kg" />
            <button className="btn" disabled={!peso}>Registrar</button>
          </form>
          <p className="tiny">O peso varia de um dia para o outro (água, intestino, sal). Olhe a tendência das semanas, não o número de hoje. Ao registrar, suas metas são recalculadas.</p>
        </div>
      </div>
    </Folha>
  )
}

