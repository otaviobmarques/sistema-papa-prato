import { Flame } from 'lucide-react'
import { Mascot } from '../components/Mascot'
import { CONQUISTAS, sequencia } from '../lib/conquistas'
import { obterEstado, useEstado } from '../lib/store'

export function Conquistas() {
  useEstado(e => e) // re-renderiza a cada mudança
  const e = obterEstado()
  const seq = sequencia(e)
  const feitas = CONQUISTAS.filter(c => { const [a, b] = c.progresso(e); return a >= b }).length
  return (
    <div className="stack">
      <h1>Suas conquistas</h1>
      <div className="card row" style={{ background: 'linear-gradient(135deg, var(--green-soft), var(--orange-soft))', boxShadow: 'none' }}>
        <Mascot size={96} humor={seq >= 3 ? 'festa' : 'feliz'} />
        <div className="grow">
          <div className="row" style={{ gap: 6 }}><Flame color="var(--orange)" /><b style={{ fontSize: '1.8rem', fontFamily: 'var(--font-title)' }} className="num">{seq}</b><span className="muted">{seq === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
          <p className="small muted">{feitas} de {CONQUISTAS.length} medalhas. Cada hábito conta, sem cobrança!</p>
        </div>
      </div>
      <div className="medalhas">
        {CONQUISTAS.map(c => {
          const [a, b] = c.progresso(e)
          const ok = a >= b
          return (
            <div key={c.id} className={`medalha ${ok ? '' : 'bloqueada'}`}>
              <div className="m-emoji">{c.emoji}</div>
              <b className="small">{c.nome}</b>
              <span className="tiny">{c.criterio}</span>
              {!ok && b > 1 && <div className="bar" style={{ width: '80%' }}><span style={{ width: `${(a / b) * 100}%`, background: 'var(--green)' }} /></div>}
              {!ok && b > 1 && <span className="tiny num">{a}/{b}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
