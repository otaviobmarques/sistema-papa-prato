import { useMemo } from 'react'
import { ChevronRight, Droplet, Flame, Undo2 } from 'lucide-react'
import { Anel, Macro, fmt, useAlimentos } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { FaixaInstalar } from '../components/Instalar'
import { somar, nomeCurto } from '../lib/alimentos'
import { calcularMetas } from '../lib/metas'
import { planoDoDia } from '../lib/plano'
import { sequencia } from '../lib/conquistas'
import { REFEICOES, beberAgua, desfazerAgua, diaVazio, hoje, obterEstado, useEstado, type Refeicao } from '../lib/store'

export function Inicio({ irPara, adicionar }: { irPara: (t: string) => void; adicionar: (r?: Refeicao) => void }) {
  const data = hoje()
  const perfil = useEstado(e => e.perfil)
  const dia = useEstado(e => e.dias[data]) ?? diaVazio()
  const conteudo = useEstado(e => e.conteudo)
  const plano = useEstado(e => e.plano)
  useEstado(e => e.dias) // atualiza a sequência
  const metas = calcularMetas(perfil)
  const total = somar(dia.registros.map(r => r.n))
  const agua = dia.agua.reduce((s, x) => s + x, 0)
  const restante = metas.kcal - total.kcal
  const h = new Date().getHours()
  const saud = h < 12 ? conteudo.saudacoes.manha : h < 18 ? conteudo.saudacoes.tarde : conteudo.saudacoes.noite
  const dica = conteudo.dicas[new Date().getDate() % Math.max(conteudo.dicas.length, 1)]
  const seq = sequencia(obterEstado())

  const base = useAlimentos()
  const proxima = useMemo(() => {
    if (!base.pronto) return null
    const registradas = new Set(dia.registros.map(r => r.refeicao))
    const refs = planoDoDia(new Date().getDay(), plano.semente, plano.trocas, perfil, metas, base.porId)
    const ordem: Refeicao[] = ['cafe', 'almoco', 'lanche', 'jantar']
    const idxAgora = h < 10 ? 0 : h < 15 ? 1 : h < 18 ? 2 : 3
    return refs.find(r => ordem.indexOf(r.refeicao) >= idxAgora && !registradas.has(r.refeicao)) ?? null
  }, [base.pronto, dia.registros.length, plano, perfil, h])

  const fala = total.kcal === 0
    ? 'Vamos registrar a primeira refeição do dia?'
    : restante > 0 ? `Faltam ${fmt(restante)} kcal para sua meta. Tudo no seu ritmo!` : 'Meta do dia alcançada! Ouça sua fome e saciedade. 💚'

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'center' }}>
        <Mascot size={86} />
        <div className="grow">
          <h1>{saud}, {perfil?.apelido}!</h1>
          <p className="muted small">{fala}</p>
        </div>
      </div>

      <FaixaInstalar />

      <div className="card">
        <div className="row" style={{ gap: 18 }}>
          <Anel valor={total.kcal} max={metas.kcal} tamanho={140}>
            <div><div className="num" style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-title)' }}>{fmt(Math.abs(restante))}</div><div className="tiny">{restante >= 0 ? 'kcal restantes' : 'kcal acima'}</div></div>
          </Anel>
          <div className="grow stack" style={{ gap: 10 }}>
            <Macro nome="Proteínas" valor={total.proteina} meta={metas.proteina} cor="var(--c-prot)" />
            <Macro nome="Carboidratos" valor={total.carboidrato} meta={metas.carboidrato} cor="var(--c-carb)" />
            <Macro nome="Gorduras" valor={total.gordura} meta={metas.gordura} cor="var(--c-gord)" />
          </div>
        </div>
        <div className="row between small" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span className="muted">Consumido <b className="num" style={{ color: 'var(--ink)' }}>{fmt(total.kcal)}</b> de {fmt(metas.kcal)} kcal</span>
          {seq > 0 && <span className="tag orange"><Flame size={12} /> {seq} {seq === 1 ? 'dia' : 'dias'}</span>}
        </div>
      </div>

      <div className="card row" style={{ gap: 16 }}>
        <div className="agua-copo" aria-hidden><span style={{ height: `${Math.min(100, (agua / metas.aguaMl) * 100)}%` }} /></div>
        <div className="grow stack" style={{ gap: 8 }}>
          <div className="row between"><h3 className="row" style={{ gap: 6 }}><Droplet size={18} color="var(--blue)" /> Água</h3><span className="num small"><b>{fmt(agua / 1000, 2)}</b> / {fmt(metas.aguaMl / 1000, 1)} L</span></div>
          <div className="row wrap" style={{ gap: 6 }}>
            {[150, 250, 500].map(ml => <button key={ml} className="btn soft sm" onClick={() => beberAgua(data, ml)}>+{ml} mL</button>)}
            {dia.agua.length > 0 && <button className="icon-btn flat" onClick={() => desfazerAgua(data)} aria-label="Desfazer último copo"><Undo2 size={18} /></button>}
          </div>
        </div>
      </div>

      {proxima && (
        <button className="card tap soft" onClick={() => irPara('plano')}>
          <div className="row between"><span className="label">Próxima refeição · {REFEICOES.find(r => r.id === proxima.refeicao)!.nome}</span><ChevronRight size={18} /></div>
          <h3 style={{ marginTop: 6 }}>{proxima.modelo.nome}</h3>
          <p className="small muted" style={{ marginTop: 4 }}>{proxima.itens.map(i => `${nomeCurto(i.alimento.nome).split(' · ')[0]} ${i.gramas} g`).join(' · ')}</p>
          <p className="small" style={{ marginTop: 6 }}><b className="num">{fmt(proxima.total.kcal)} kcal</b></p>
        </button>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 6 }}><h3>Hoje</h3><button className="link" onClick={() => irPara('diario')}>Ver diário</button></div>
        <div className="list">
          {REFEICOES.filter(r => r.id !== 'ceia' || dia.registros.some(x => x.refeicao === 'ceia')).map(r => {
            const regs = dia.registros.filter(x => x.refeicao === r.id)
            const k = regs.reduce((s, x) => s + x.n.kcal, 0)
            return (
              <button key={r.id} className="item-btn" onClick={() => adicionar(r.id)}>
                <span className="emoji">{r.emoji}</span>
                <div className="grow"><div style={{ fontWeight: 600 }}>{r.nome}</div><div className="tiny">{regs.length ? regs.map(x => nomeCurto(x.nome).split(' · ')[0]).join(', ') : 'Toque para adicionar'}</div></div>
                <span className="kcal small">{regs.length ? `${fmt(k)} kcal` : '+'}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card peach row" style={{ alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.4rem' }}>💡</span>
        <p className="small"><b>Dica do Papa:</b> {dica}</p>
      </div>
    </div>
  )
}
