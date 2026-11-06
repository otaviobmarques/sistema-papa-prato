import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Minus, Plus, Search } from 'lucide-react'
import { Folha, avisar, fmt, useAlimentos } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { ALERGENOS, alergenosEstimados } from '../lib/alergias'
import { buscar, nomeCurto, nutrientesDe, NOME_FONTE, type Alimento } from '../lib/alimentos'
import { REFEICOES, registrar, removerRegistro, obterEstado, useEstado, type Refeicao } from '../lib/store'

export function refeicaoAgora(): Refeicao {
  const h = new Date().getHours()
  return h < 10 ? 'cafe' : h < 15 ? 'almoco' : h < 18 ? 'lanche' : h < 22 ? 'jantar' : 'ceia'
}

export function AdicionarAlimento({ aberta, onFechar, data, refeicaoInicial }: { aberta: boolean; onFechar: () => void; data: string; refeicaoInicial?: Refeicao }) {
  const base = useAlimentos()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Alimento | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (aberta) { setQ(''); setSel(null); setTimeout(() => ref.current?.focus(), 250) } }, [aberta])

  const dias = useEstado(e => e.dias)
  const recentes = useMemo(() => {
    if (!base.pronto) return []
    const vistos = new Set<string>(); const out: Alimento[] = []
    Object.keys(dias).sort().reverse().forEach(d => [...dias[d].registros].reverse().forEach(r => {
      const a = base.porId.get(r.alimentoId)
      if (a && !vistos.has(a.id) && out.length < 8) { vistos.add(a.id); out.push(a) }
    }))
    return out
  }, [dias, base.pronto, base.pronto && base.porId])

  const resultados = useMemo(() => (base.pronto ? buscar(base.lista, q) : []), [q, base.pronto, base.pronto && base.lista])

  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo={sel ? undefined : 'O que você comeu?'} cheia>
      {sel && base.pronto ? (
        <Porcao alimento={sel} citacao={base.citacao[sel.fonte]} data={data} refeicaoInicial={refeicaoInicial ?? refeicaoAgora()} onVoltar={() => setSel(null)} onPronto={onFechar} />
      ) : (
        <div className="stack">
          <div className="search">
            <Search size={18} />
            <input ref={ref} className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar: arroz, feijão, cuscuz…" aria-label="Buscar alimento" />
          </div>
          {!base.pronto ? (
            <div className="empty">{base.erro ? <>😕 {base.erro}</> : <><Mascot size={70} humor="pensativo" />Carregando 18 mil alimentos…</>}</div>
          ) : q.trim() === '' ? (
            recentes.length ? (
              <div><p className="label" style={{ marginBottom: 4 }}>Recentes</p><Lista itens={recentes} onEscolher={setSel} /></div>
            ) : (
              <div className="empty"><Mascot size={80} />Digite o nome de um alimento ou prato.<br /><span className="tiny">Bases TACO, TBCA, IBGE/POF, USDA e CoFID.</span></div>
            )
          ) : resultados.length ? (
            <Lista itens={resultados} onEscolher={setSel} />
          ) : (
            <div className="empty"><Mascot size={70} humor="pensativo" />Não achei “{q}”. Tente com menos palavras.</div>
          )}
        </div>
      )}
    </Folha>
  )
}

function Lista({ itens, onEscolher }: { itens: Alimento[]; onEscolher: (a: Alimento) => void }) {
  const alergias = useEstado(e => e.perfil?.alergias ?? [])
  return (
    <div className="list">
      {itens.map(a => {
        const alerta = alergenosEstimados(a.nome).filter(x => alergias.includes(x))
        return (
          <button key={a.id} className="item-btn" onClick={() => onEscolher(a)}>
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{nomeCurto(a.nome)}</div>
              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                <span className="tag gray">{a.personalizado ? 'Papa Prato' : a.fonte}</span>
                {alerta.map(x => <span key={x} className="tag orange"><AlertTriangle size={11} /> {ALERGENOS[x].rotulo}</span>)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}><div className="kcal">{fmt(a.kcal)}</div><div className="tiny">kcal/100 g</div></div>
          </button>
        )
      })}
    </div>
  )
}

function Porcao({ alimento: a, citacao, data, refeicaoInicial, onVoltar, onPronto }: { alimento: Alimento; citacao?: string; data: string; refeicaoInicial: Refeicao; onVoltar: () => void; onPronto: () => void }) {
  const medidas = [...a.medidas, { nome: 'gramas', gramas: 1 }]
  const [mi, setMi] = useState(0)
  const m = medidas[mi]
  const emGramas = m.nome === 'gramas'
  const [qtd, setQtd] = useState(emGramas ? 100 : 1)
  const [refeicao, setRefeicao] = useState<Refeicao>(refeicaoInicial)
  const alergias = useEstado(e => e.perfil?.alergias ?? [])
  const gramas = Math.round(qtd * m.gramas * 10) / 10
  const n = nutrientesDe(a, gramas)
  const passo = emGramas ? 10 : 0.5
  const alerta = alergenosEstimados(a.nome)

  const adicionar = () => {
    registrar(data, { alimentoId: a.id, nome: a.nome, fonte: a.fonte, gramas, medida: emGramas ? undefined : m.nome, qtd: emGramas ? undefined : qtd, refeicao, n })
    const ultimo = obterEstado().dias[data].registros.at(-1)!
    avisar(`${nomeCurto(a.nome).split(' · ')[0]} adicionado!`, () => removerRegistro(data, ultimo.id))
    onPronto()
  }

  return (
    <div className="stack">
      <button className="link row" onClick={onVoltar} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar à busca</button>
      <div>
        <h2>{a.nome}</h2>
        <p className="tiny" style={{ marginTop: 4 }}>Fonte: {a.personalizado ? 'cadastrado pela equipe Papa Prato' : NOME_FONTE[a.fonte]}</p>
      </div>

      {alerta.length > 0 && (
        <div className={`card ${alerta.some(x => alergias.includes(x)) ? 'peach' : 'soft'} small row`} style={{ alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ flex: 'none', color: 'var(--orange)' }} />
          <span>Pode conter: <b>{alerta.map(x => ALERGENOS[x].rotulo).join(', ')}</b>. Estimativa pelo nome do alimento; confira o rótulo.</span>
        </div>
      )}

      <div className="field"><span className="label">Medida</span>
        <div className="chips">{medidas.map((x, i) => (
          <button key={x.nome + i} className="chip" aria-pressed={i === mi} onClick={() => { setMi(i); setQtd(x.nome === 'gramas' ? Math.round(gramas) || 100 : 1) }}>
            {x.nome}{x.nome !== 'gramas' && <span className="tiny">({fmt(x.gramas)} g)</span>}
          </button>
        ))}</div>
      </div>

      <div className="card row between">
        <button className="icon-btn" onClick={() => setQtd(Math.max(passo, +(qtd - passo).toFixed(1)))} aria-label="Diminuir"><Minus size={20} /></button>
        <div style={{ textAlign: 'center' }}>
          <input className="input num" style={{ width: 110, textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, boxShadow: 'none', background: 'transparent' }} inputMode="decimal" value={String(qtd).replace('.', ',')} onChange={e => { const v = Number(e.target.value.replace(',', '.')); if (!isNaN(v)) setQtd(v) }} aria-label="Quantidade" />
          <div className="tiny">{emGramas ? 'gramas' : `${m.nome} · ${fmt(gramas)} g`}</div>
        </div>
        <button className="icon-btn" onClick={() => setQtd(+(qtd + passo).toFixed(1))} aria-label="Aumentar"><Plus size={20} /></button>
      </div>

      <div className="card">
        <div className="row between"><span className="muted">Energia</span><b className="num" style={{ fontSize: '1.3rem' }}>{fmt(n.kcal)} kcal</b></div>
        <div className="row between small" style={{ marginTop: 10 }}>
          <span><span style={{ color: 'var(--c-prot)' }}>●</span> Prot. <b className="num">{fmt(n.proteina, 1)} g</b></span>
          <span><span style={{ color: 'var(--c-carb)' }}>●</span> Carb. <b className="num">{fmt(n.carboidrato, 1)} g</b></span>
          <span><span style={{ color: 'var(--c-gord)' }}>●</span> Gord. <b className="num">{fmt(n.gordura, 1)} g</b></span>
        </div>
        {a.fibra != null && <p className="tiny" style={{ marginTop: 8 }}>Fibra {fmt(n.fibra, 1)} g{a.sodio != null && ` · Sódio ${fmt(a.sodio * gramas / 100)} mg`}</p>}
      </div>

      <div className="field"><span className="label">Refeição</span>
        <div className="chips">{REFEICOES.map(r => <button key={r.id} className="chip" aria-pressed={refeicao === r.id} onClick={() => setRefeicao(r.id)}>{r.emoji} {r.nome}</button>)}</div>
      </div>

      <button className="btn block" onClick={adicionar} disabled={!(gramas > 0)}>Adicionar ao diário</button>
      {citacao && !a.personalizado && <p className="fonte-cit">{citacao}</p>}
    </div>
  )
}
