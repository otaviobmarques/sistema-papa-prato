import { useState } from 'react'
import { ChevronLeft, ChevronRight, Heart, Minus, Plus, Trash2 } from 'lucide-react'
import { Folha, avisar, fmt } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { nomeCurto, somar, NOME_FONTE } from '../lib/alimentos'
import { calcularMetas } from '../lib/metas'
import { REFEICOES, atualizar, diaVazio, editarRegistro, hoje, registrar, removerRegistro, somarDias, uid, useEstado, type Refeicao, type Registro } from '../lib/store'

const rotuloData = (d: string) => {
  if (d === hoje()) return 'Hoje'
  if (d === somarDias(hoje(), -1)) return 'Ontem'
  const [a, m, dd] = d.split('-').map(Number)
  return new Date(a, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function Diario({ data, setData, adicionar }: { data: string; setData: (d: string) => void; adicionar: (r?: Refeicao) => void }) {
  const dia = useEstado(e => e.dias[data]) ?? diaVazio()
  const perfil = useEstado(e => e.perfil)
  const favoritos = useEstado(e => e.favoritos)
  const [editando, setEditando] = useState<Registro | null>(null)
  const [favAberto, setFavAberto] = useState<Refeicao | null>(null)
  const metas = calcularMetas(perfil)
  const total = somar(dia.registros.map(r => r.n))

  const salvarFavorito = (r: Refeicao) => {
    const itens = dia.registros.filter(x => x.refeicao === r).map(({ id: _i, refeicao: _r, hora: _h, ...resto }) => resto)
    const nome = `${REFEICOES.find(x => x.id === r)!.nome} de ${rotuloData(data).toLowerCase()}`
    atualizar(e => ({ ...e, favoritos: [...e.favoritos, { id: uid(), nome, itens }] }))
    avisar('Refeição salva nos favoritos ❤️')
  }

  return (
    <div className="stack">
      <div className="row between">
        <button className="icon-btn" onClick={() => setData(somarDias(data, -1))} aria-label="Dia anterior"><ChevronLeft size={20} /></button>
        <div style={{ textAlign: 'center' }}><h2 style={{ textTransform: 'capitalize' }}>{rotuloData(data)}</h2><p className="tiny num">{fmt(total.kcal)} de {fmt(metas.kcal)} kcal</p></div>
        <button className="icon-btn" onClick={() => setData(somarDias(data, 1))} disabled={data >= hoje()} aria-label="Próximo dia" style={{ opacity: data >= hoje() ? .3 : 1 }}><ChevronRight size={20} /></button>
      </div>

      <div className="card row between small num">
        <span><span style={{ color: 'var(--c-prot)' }}>●</span> P <b>{fmt(total.proteina)}</b>/{metas.proteina} g</span>
        <span><span style={{ color: 'var(--c-carb)' }}>●</span> C <b>{fmt(total.carboidrato)}</b>/{metas.carboidrato} g</span>
        <span><span style={{ color: 'var(--c-gord)' }}>●</span> G <b>{fmt(total.gordura)}</b>/{metas.gordura} g</span>
      </div>

      {dia.registros.length === 0 && (
        <div className="card empty"><Mascot size={90} />Nada registrado ainda.<br /><span className="small">Toque em <b>+</b> para começar.</span></div>
      )}

      {REFEICOES.map(r => {
        const regs = dia.registros.filter(x => x.refeicao === r.id)
        if (!regs.length && r.id === 'ceia') return null
        const t = somar(regs.map(x => x.n))
        return (
          <div className="card" key={r.id}>
            <div className="row between">
              <h3>{r.emoji} {r.nome}</h3>
              <div className="row" style={{ gap: 4 }}>
                {regs.length > 0 && <span className="kcal small">{fmt(t.kcal)} kcal</span>}
                {regs.length > 0 && <button className="icon-btn flat" onClick={() => salvarFavorito(r.id)} aria-label="Salvar como favorita"><Heart size={18} /></button>}
              </div>
            </div>
            <div className="list">
              {regs.map(x => (
                <button key={x.id} className="item-btn" onClick={() => setEditando(x)}>
                  <div className="grow"><div>{nomeCurto(x.nome)}</div><div className="tiny">{x.medida ? `${fmt(x.qtd!, 1)} ${x.medida} · ` : ''}{fmt(x.gramas)} g · {x.hora}</div></div>
                  <span className="kcal small">{fmt(x.n.kcal)}</span>
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn soft sm" onClick={() => adicionar(r.id)}><Plus size={16} /> Adicionar</button>
              {favoritos.length > 0 && <button className="btn ghost sm" onClick={() => setFavAberto(r.id)}><Heart size={16} /> Favoritos</button>}
            </div>
          </div>
        )
      })}

      <EditarRegistro registro={editando} data={data} onFechar={() => setEditando(null)} />

      <Folha aberta={!!favAberto} onFechar={() => setFavAberto(null)} titulo="Repetir uma favorita">
        <div className="list">
          {favoritos.map(f => (
            <div key={f.id} className="item">
              <div className="grow"><b>{f.nome}</b><div className="tiny">{f.itens.map(i => nomeCurto(i.nome).split(' · ')[0]).join(', ')} · {fmt(f.itens.reduce((s, i) => s + i.n.kcal, 0))} kcal</div></div>
              <button className="btn sm" onClick={() => { f.itens.forEach(i => registrar(data, { ...i, refeicao: favAberto! })); setFavAberto(null); avisar('Refeição repetida!') }}>Repetir</button>
              <button className="icon-btn flat" aria-label="Remover favorita" onClick={() => atualizar(e => ({ ...e, favoritos: e.favoritos.filter(x => x.id !== f.id) }))}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>Confira quantidades e ingredientes antes de repetir.</p>
      </Folha>
    </div>
  )
}

function EditarRegistro({ registro: r, data, onFechar }: { registro: Registro | null; data: string; onFechar: () => void }) {
  const [g, setG] = useState(0)
  const [id, setId] = useState('')
  if (r && r.id !== id) { setId(r.id); setG(r.gramas) }
  if (!r) return <Folha aberta={false} onFechar={onFechar}>{null}</Folha>
  const f = g / r.gramas
  const salvar = () => {
    editarRegistro(data, r.id, { gramas: g, medida: undefined, qtd: undefined, n: { kcal: r.n.kcal * f, proteina: r.n.proteina * f, carboidrato: r.n.carboidrato * f, gordura: r.n.gordura * f, fibra: r.n.fibra * f } })
    onFechar()
  }
  const remover = () => { const copia = r; removerRegistro(data, r.id); avisar('Item removido', () => registrar(data, copia)); onFechar() }
  return (
    <Folha aberta onFechar={onFechar} titulo="Editar item">
      <div className="stack">
        <div><b>{r.nome}</b><p className="tiny">Fonte: {NOME_FONTE[r.fonte]}</p></div>
        <div className="card row between">
          <button className="icon-btn" onClick={() => setG(Math.max(5, g - 10))} aria-label="Diminuir"><Minus size={20} /></button>
          <div style={{ textAlign: 'center' }}><div className="num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{fmt(g)} g</div><div className="tiny num">{fmt(r.n.kcal * f)} kcal</div></div>
          <button className="icon-btn" onClick={() => setG(g + 10)} aria-label="Aumentar"><Plus size={20} /></button>
        </div>
        <button className="btn block" onClick={salvar}>Salvar</button>
        <button className="btn danger block" onClick={remover}><Trash2 size={18} /> Remover do diário</button>
      </div>
    </Folha>
  )
}
