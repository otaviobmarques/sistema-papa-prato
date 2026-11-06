import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Share2, ShoppingCart } from 'lucide-react'
import { Folha, avisar, fmt, useAlimentos } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { RECEITAS, type Receita } from '../data/cardapio'
import { ALERGENOS, alergenosEstimados } from '../lib/alergias'
import { nomeCurto, nutrientesDe, somar, type Alimento } from '../lib/alimentos'
import { calcularMetas } from '../lib/metas'
import { DIAS_SEMANA, listaDeCompras, planoDoDia, type RefeicaoPlano } from '../lib/plano'
import { REFEICOES, atualizar, hoje, registrar, useEstado } from '../lib/store'

export function Plano() {
  const base = useAlimentos()
  const perfil = useEstado(e => e.perfil)
  const plano = useEstado(e => e.plano)
  const [dia, setDia] = useState(new Date().getDay())
  const [aba, setAba] = useState<'cardapio' | 'receitas'>('cardapio')
  const [compras, setCompras] = useState(false)
  const [receita, setReceita] = useState<Receita | null>(null)
  const metas = calcularMetas(perfil)

  const semana = useMemo(() => base.pronto ? DIAS_SEMANA.map((_, d) => planoDoDia(d, plano.semente, plano.trocas, perfil, metas, base.porId)) : [], [base.pronto, plano, perfil])
  if (!base.pronto) return <div className="empty"><Mascot size={80} humor="pensativo" />Preparando seu cardápio…</div>

  const refs = semana[dia]
  const totalDia = somar(refs.map(r => r.total))
  const trocar = (r: RefeicaoPlano) => atualizar(e => ({ ...e, plano: { ...e.plano, trocas: { ...e.plano.trocas, [r.chave]: (e.plano.trocas[r.chave] ?? 0) + 1 } } }))
  const registrarRef = (r: RefeicaoPlano) => {
    r.itens.forEach(i => registrar(hoje(), { alimentoId: i.alimento.id, nome: i.alimento.nome, fonte: i.alimento.fonte, gramas: i.gramas, refeicao: r.refeicao, n: i.n }))
    avisar(`${r.modelo.nome} registrado hoje!`)
  }

  return (
    <div className="stack">
      <div className="row between">
        <h1>Seu plano</h1>
        <button className="btn ghost sm" onClick={() => setCompras(true)}><ShoppingCart size={16} /> Compras</button>
      </div>
      <div className="segmented">
        <button aria-pressed={aba === 'cardapio'} onClick={() => setAba('cardapio')}>Cardápio da semana</button>
        <button aria-pressed={aba === 'receitas'} onClick={() => setAba('receitas')}>Receitas</button>
      </div>

      {aba === 'cardapio' ? (
        <>
          <div className="dias">
            {DIAS_SEMANA.map((d, i) => <button key={d} aria-pressed={i === dia} onClick={() => setDia(i)}>{d}<b>{i === new Date().getDay() ? '•' : ' '}</b></button>)}
          </div>
          <p className="small muted num">Total do dia ≈ <b style={{ color: 'var(--ink)' }}>{fmt(totalDia.kcal)} kcal</b> · meta {fmt(metas.kcal)} kcal</p>
          {refs.length === 0 && <div className="card empty"><Mascot size={80} humor="pensativo" />Com as restrições escolhidas não encontrei modelos de refeição. Revise em Perfil.</div>}
          {refs.map(r => {
            const info = REFEICOES.find(x => x.id === r.refeicao)!
            return (
              <div key={r.chave} className="card stack" style={{ gap: 10 }}>
                <div className="row between"><span className="label">{info.emoji} {info.nome}</span><span className="kcal small">{fmt(r.total.kcal)} kcal</span></div>
                <h3>{r.modelo.nome}</h3>
                <div className="list">
                  {r.itens.map(i => (
                    <div key={i.alimento.id} className="item" style={{ padding: '8px 0' }}>
                      <div className="grow small">{nomeCurto(i.alimento.nome)}<div className="tiny">{i.alimento.fonte}</div></div>
                      <span className="small num muted">{i.gramas} g</span>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn sm grow" onClick={() => registrarRef(r)}><CheckCircle2 size={16} /> Comi isso</button>
                  <button className="btn ghost sm grow" onClick={() => trocar(r)} disabled={r.opcoes < 2}><RefreshCw size={16} /> Trocar</button>
                </div>
              </div>
            )
          })}
          <p className="tiny">Porções ajustadas à sua meta. Valores das tabelas TACO e TBCA. Sugestão educativa; para um plano individual, procure um(a) nutricionista.</p>
        </>
      ) : (
        <div className="stack">
          {RECEITAS.map(rc => {
            const n = somar(rc.itens.map(i => base.porId.get(i.id) ? nutrientesDe(base.porId.get(i.id)!, i.g) : { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0, fibra: 0 }))
            return (
              <button key={rc.id} className="card tap row" onClick={() => setReceita(rc)}>
                <span className="emoji" style={{ width: 56, height: 56, fontSize: '1.8rem' }}>{rc.emoji}</span>
                <div className="grow"><h3>{rc.nome}</h3><div className="row tiny" style={{ gap: 10, marginTop: 4 }}><span className="row" style={{ gap: 4 }}><Clock size={12} /> {rc.minutos} min</span><span>{rc.regiao}</span><span className="num">{fmt(n.kcal)} kcal</span></div></div>
              </button>
            )
          })}
        </div>
      )}

      <ListaCompras aberta={compras} onFechar={() => setCompras(false)} semana={semana} />
      <DetalheReceita receita={receita} porId={base.porId} onFechar={() => setReceita(null)} />
    </div>
  )
}

function quantidade(g: number) {
  return g >= 1000 ? `${fmt(g / 1000, 1)} kg` : `${fmt(Math.ceil(g / 10) * 10)} g`
}

function ListaCompras({ aberta, onFechar, semana }: { aberta: boolean; onFechar: () => void; semana: RefeicaoPlano[][] }) {
  const marcados = useEstado(e => e.compras)
  const lista = listaDeCompras(semana)
  const texto = 'Lista de compras — Papa Prato\n' + lista.map(i => `${marcados[i.alimento.id] ? '✓' : '□'} ${nomeCurto(i.alimento.nome).split(' · ').slice(0, 2).join(' ')} — ${quantidade(i.gramas)}`).join('\n')
  const compartilhar = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Lista de compras', text: texto })
      else { await navigator.clipboard.writeText(texto); avisar('Lista copiada!') }
    } catch { /* cancelado */ }
  }
  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Lista da semana" cheia>
      <div className="stack">
        <p className="small muted">Quantidades somadas do cardápio dos 7 dias (peso do alimento pronto; confira na hora da compra).</p>
        <div className="card list" style={{ padding: '4px 16px' }}>
          {lista.map(i => (
            <label key={i.alimento.id} className="item" style={{ cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 22, height: 22, accentColor: 'var(--green)' }} checked={!!marcados[i.alimento.id]} onChange={e => atualizar(s => ({ ...s, compras: { ...s.compras, [i.alimento.id]: e.target.checked } }))} />
              <span className="grow" style={{ textDecoration: marcados[i.alimento.id] ? 'line-through' : 'none', opacity: marcados[i.alimento.id] ? .55 : 1 }}>{nomeCurto(i.alimento.nome)}</span>
              <span className="small num muted">{quantidade(i.gramas)}</span>
            </label>
          ))}
        </div>
        <button className="btn block" onClick={compartilhar}><Share2 size={18} /> Compartilhar lista</button>
      </div>
    </Folha>
  )
}

function DetalheReceita({ receita: r, porId, onFechar }: { receita: Receita | null; porId: Map<string, Alimento>; onFechar: () => void }) {
  const alergias = useEstado(e => e.perfil?.alergias ?? [])
  if (!r) return null
  const itens = r.itens.map(i => ({ ...i, a: porId.get(i.id) })).filter(i => i.a)
  const n = somar(itens.map(i => nutrientesDe(i.a!, i.g)))
  const alerg = [...new Set(itens.flatMap(i => alergenosEstimados(i.a!.nome)))]
  const registrarReceita = () => {
    const ref = new Date().getHours() < 10 ? 'cafe' : new Date().getHours() < 16 ? 'almoco' : 'jantar'
    itens.forEach(i => registrar(hoje(), { alimentoId: i.a!.id, nome: i.a!.nome, fonte: i.a!.fonte, gramas: i.g, refeicao: ref, n: nutrientesDe(i.a!, i.g) }))
    avisar(`${r.nome} registrada!`); onFechar()
  }
  return (
    <Folha aberta onFechar={onFechar} titulo={`${r.emoji} ${r.nome}`} cheia>
      <div className="stack">
        <div className="row tiny" style={{ gap: 12 }}><span className="row" style={{ gap: 4 }}><Clock size={13} /> {r.minutos} min</span><span>{r.porcoes} porção</span><span>{r.regiao}</span></div>
        <div className="card row between num small">
          <span><b style={{ fontSize: '1.15rem' }}>{fmt(n.kcal)}</b> kcal</span><span>P {fmt(n.proteina)} g</span><span>C {fmt(n.carboidrato)} g</span><span>G {fmt(n.gordura)} g</span>
        </div>
        {alerg.length > 0 && <div className={`card ${alerg.some(a => alergias.includes(a)) ? 'peach' : 'soft'} small row`}><AlertTriangle size={16} color="var(--orange)" /> Pode conter: {alerg.map(a => ALERGENOS[a].rotulo).join(', ')}</div>}
        <div className="card"><h3 style={{ marginBottom: 6 }}>Ingredientes</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="small">{r.itens.map(i => <li key={i.id}>{i.texto}</li>)}{r.extras.map(x => <li key={x} className="muted">{x}</li>)}</ul></div>
        <div className="card"><h3 style={{ marginBottom: 6 }}>Modo de preparo</h3>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }} className="small">{r.passos.map(p => <li key={p}>{p}</li>)}</ol></div>
        <button className="btn block" onClick={registrarReceita}>Registrar no diário de hoje</button>
        <p className="fonte-cit">Valores nutricionais calculados com dados da TACO (NEPA/UNICAMP) e da TBCA (USP/FoRC).</p>
      </div>
    </Folha>
  )
}
