import { Flame, Share2 } from 'lucide-react'
import { compartilharCartao } from '../lib/cartao'
import { avisar } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { sequencia, todasConquistas, type Conquista } from '../lib/conquistas'
import { hoje } from '../lib/store'
import { obterEstado, useEstado } from '../lib/store'

export function Conquistas() {
  useEstado(e => e) // re-renderiza a cada mudança
  const e = obterEstado()
  const seq = sequencia(e)
  const todas = todasConquistas(e)
  const campanhas = todas.filter(c => c.campanha), medalhas = todas.filter(c => !c.campanha)
  const feitas = todas.filter(c => { const [a, b] = c.progresso(e); return a >= b }).length
  return (
    <div className="stack">
      <h1>Suas conquistas</h1>
      <div className="card row" style={{ background: 'linear-gradient(135deg, var(--green-soft), var(--orange-soft))', boxShadow: 'none' }}>
        <Mascot size={96} humor={seq >= 3 ? 'festa' : 'feliz'} />
        <div className="grow">
          <div className="row" style={{ gap: 6 }}><Flame color="var(--orange)" /><b style={{ fontSize: '1.8rem', fontFamily: 'var(--font-title)' }} className="num">{seq}</b><span className="muted">{seq === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
          <p className="small muted">{feitas} de {todas.length} medalhas. Cada hábito conta, sem cobrança!</p>
        </div>
      </div>
      {campanhas.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          <h2>Campanhas</h2>
          {campanhas.map(c => <CartaoCampanha key={c.id} c={c} />)}
          <p className="tiny">Nas campanhas, só contam refeições registradas no próprio dia.</p>
        </div>
      )}
      <div className="medalhas">
        {medalhas.map(c => {
          const [a, b] = c.progresso(e)
          const ok = a >= b
          return (
            <div key={c.id} className={`medalha ${ok ? '' : 'bloqueada'}`}>
              <div className="m-emoji">{c.emoji}</div>
              <b className="small">{c.nome}</b>
              <span className="tiny">{c.criterio}</span>
              {!ok && b > 1 && <div className="bar" style={{ width: '80%' }}><span style={{ width: `${(a / b) * 100}%`, background: 'var(--green)' }} /></div>}
              {!ok && b > 1 && <span className="tiny num">{a}/{b}</span>}
              {ok && <button className="link small row" style={{ gap: 4 }} onClick={async () => { const r = await compartilharCartao(c, seq); if (r === 'baixado') avisar('Imagem da conquista salva!') }}><Share2 size={14} /> Compartilhar</button>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const dataBr = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}${a !== String(new Date().getFullYear()) ? '/' + a : ''}` }
function diasAte(fim: string) { const dia = (k: string) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d).getTime() }; return Math.round((dia(fim) - dia(hoje())) / 864e5) }

function CartaoCampanha({ c }: { c: Conquista }) {
  const e = useEstado(x => x)
  const [a, b] = c.progresso(e)
  const ok = a >= b
  const fim = c.campanha?.fim
  const resta = fim ? diasAte(fim) : null
  return (
    <div className="card row" style={{ alignItems: 'center', boxShadow: ok ? 'inset 0 0 0 2px var(--green)' : 'inset 0 0 0 2px var(--orange)' }}>
      <div style={{ fontSize: '2.2rem' }} aria-hidden>{c.emoji}</div>
      <div className="grow stack" style={{ gap: 4 }}>
        <div className="row between wrap"><b>{c.nome}</b><span className="tag">{ok ? 'concluída!' : resta != null ? (resta <= 0 ? 'último dia' : `faltam ${resta} dia${resta > 1 ? 's' : ''}`) : 'campanha'}</span></div>
        <span className="tiny">{c.criterio}{fim ? ` · até ${dataBr(fim)}` : ''}</span>
        {!ok && <div className="row" style={{ gap: 8 }}><div className="bar grow"><span style={{ width: `${(a / b) * 100}%`, background: 'var(--orange)' }} /></div><span className="tiny num">{a}/{b}</span></div>}
        {ok && <button className="link small row" style={{ gap: 4 }} onClick={async () => { const r = await compartilharCartao(c, 0); if (r === 'baixado') avisar('Imagem da conquista salva!') }}><Share2 size={14} /> Compartilhar</button>}
      </div>
    </div>
  )
}
