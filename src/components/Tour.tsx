import { useState } from 'react'
import { BookOpen, CalendarDays, Droplet, LifeBuoy, Plus } from 'lucide-react'
import { Mascot } from './Mascot'
import { atualizar } from '../lib/store'

// T30: tour de primeiro uso, guiado pelo Papa. Aparece uma vez e pode ser revisto no Perfil.
const PASSOS = [
  { icone: Plus, cor: 'var(--orange)', titulo: 'Registre em segundos', texto: 'Toque no botão laranja para buscar um alimento, tirar foto do prato ou ler o código de barras.' },
  { icone: CalendarDays, cor: 'var(--green-2)', titulo: 'Seu cardápio da semana', texto: 'Em Plano está a semana montada para você, com receitas e a lista de compras. Não gostou? Troque.' },
  { icone: Droplet, cor: 'var(--blue)', titulo: 'Água e conquistas', texto: 'No Início você marca os copos de água. Cada hábito vira medalha, e eu comemoro com você!' },
  { icone: BookOpen, cor: 'var(--brand)', titulo: 'Seu diário', texto: 'Tudo o que você registra fica no Diário, dia a dia. Dá para editar, apagar e repetir refeições favoritas.' },
  { icone: LifeBuoy, cor: 'var(--orange)', titulo: 'Ajuda sempre por perto', texto: 'Em Perfil → Ajuda e suporte você tira dúvidas e fala com a equipe. Bora começar?' },
]

export function Tour({ onFim }: { onFim: () => void }) {
  const [i, setI] = useState(0)
  const p = PASSOS[i]
  const fim = () => { atualizar(e => ({ ...e, tourVisto: true })); onFim() }
  return (
    <div className="festa" role="dialog" aria-label="Tour do app" style={{ zIndex: 65 }}>
      <div className="stack" style={{ justifyItems: 'center', maxWidth: 340, gap: 18 }} key={i}>
        <div style={{ position: 'relative' }}>
          <Mascot size={150} humor={i === PASSOS.length - 1 ? 'festa' : 'feliz'} />
          <span style={{ position: 'absolute', right: -8, bottom: 10, width: 54, height: 54, borderRadius: 18, background: p.cor, color: '#fff', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow)' }}><p.icone size={28} /></span>
        </div>
        <span className="tag gray">{i + 1} de {PASSOS.length}</span>
        <h1>{p.titulo}</h1>
        <p className="muted">{p.texto}</p>
        <div className="row" style={{ gap: 6 }} aria-hidden>{PASSOS.map((_, k) => <span key={k} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 9, background: k === i ? 'var(--green)' : 'var(--line)', transition: 'width .3s' }} />)}</div>
        <button className="btn block" onClick={() => (i < PASSOS.length - 1 ? setI(i + 1) : fim())}>{i < PASSOS.length - 1 ? 'Próximo' : 'Começar a usar'}</button>
        {i < PASSOS.length - 1 && <button className="link" onClick={fim}>Pular tour</button>}
      </div>
    </div>
  )
}
