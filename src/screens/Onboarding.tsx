import { useState } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Mascot } from '../components/Mascot'
import { fmt } from '../components/ui'
import { ALERGENOS, type Alergeno } from '../lib/alergias'
import { calcularMetas } from '../lib/metas'
import { atualizar, type Perfil } from '../lib/store'

const OBJETIVOS = [
  { id: 'comer-melhor', emoji: '🥗', nome: 'Comer melhor' },
  { id: 'perder-peso', emoji: '⚖️', nome: 'Perder peso' },
  { id: 'ganhar-massa', emoji: '💪', nome: 'Ganhar massa' },
  { id: 'manter', emoji: '🌿', nome: 'Manter hábitos' },
] as const
const GOSTOS = ['🍚 Arroz e feijão', '🥩 Churrasco', '🌽 Cuscuz', '🍝 Massas', '🐟 Peixes', '🥗 Saladas', '🍲 Comida caseira', '🍌 Frutas', '🧀 Queijos', '🥘 Pratos regionais']
const REGIOES = [
  { id: 'norte', nome: 'Norte' }, { id: 'nordeste', nome: 'Nordeste' }, { id: 'centro-oeste', nome: 'Centro-Oeste' },
  { id: 'sudeste', nome: 'Sudeste' }, { id: 'sul', nome: 'Sul' }, { id: 'misturar', nome: 'Misturar tudo' },
] as const

const TOTAL = 9

export function Onboarding() {
  const [passo, setPasso] = useState(0)
  const [consent, setConsent] = useState({ termos: false, ia: false, novidades: false })
  const [p, setP] = useState<Perfil>({
    apelido: '', objetivo: 'comer-melhor', atividade: 'leve', dieta: 'onivoro', alergias: [], naoGosta: '', gostos: [],
    regiao: 'misturar', tempo: 'medio', orcamento: 'equilibrado', criadoEm: new Date().toISOString(),
  })
  const set = (m: Partial<Perfil>) => setP(x => ({ ...x, ...m }))
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')))
  const metas = calcularMetas(p)

  const podeAvancar = passo !== 1 || consent.termos
  const avancar = () => {
    if (passo < TOTAL - 1) return setPasso(passo + 1)
    atualizar(e => ({ ...e, perfil: { ...p, apelido: p.apelido.trim() || 'você' }, consentimento: { ...consent, termos: new Date().toISOString() } }))
  }

  const fala: Record<number, string> = {
    0: 'Oi! Eu sou o Papa. Vou te ajudar a comer bem, sem complicação e com comida de verdade.',
    1: 'Seus dados são seus. Você escolhe o que compartilhar.',
    2: 'Qual é o seu objetivo agora? Dá para mudar depois.',
    3: 'Conte só o necessário. Peso e altura ajudam a estimar sua meta, mas são opcionais.',
    4: 'Do que você gosta? Vou montar seu cardápio com isso.',
    5: 'Alergia é diferente de não gostar. Aqui é para o que você precisa evitar.',
    6: 'Comida boa tem sotaque! Qual tem a sua cara?',
    7: 'Vamos encaixar na sua rotina.',
    8: 'Tudo pronto! Olha só o que preparei para você.',
  }

  return (
    <div className="onb">
      <div className="row">
        {passo > 0 ? <button className="icon-btn" onClick={() => setPasso(passo - 1)} aria-label="Voltar"><ArrowLeft size={20} /></button> : <div className="marca">Papa <b>Prato</b></div>}
        {passo > 0 && <div className="grow"><div className="progress" aria-label={`Etapa ${passo} de ${TOTAL - 1}`}><span style={{ width: `${(passo / (TOTAL - 1)) * 100}%` }} /></div></div>}
      </div>

      <div className="onb-body" key={passo}>
        {passo === 0 ? (
          <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 16, marginTop: 20 }}>
            <Mascot size={220} />
            <h1 style={{ fontSize: '2.2rem' }}>Papa <span style={{ color: 'var(--orange)' }}>Prato</span></h1>
            <p className="muted" style={{ maxWidth: 320 }}>{fala[0]}</p>
          </div>
        ) : (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Mascot size={74} humor={passo === TOTAL - 1 ? 'festa' : passo === 5 ? 'pensativo' : 'feliz'} />
            <div className="balao grow" style={{ marginLeft: 6 }}>{fala[passo]}</div>
          </div>
        )}

        {passo === 1 && (
          <div className="stack">
            <h1>Sua privacidade</h1>
            <label className="check-card"><input type="checkbox" checked={consent.termos} onChange={e => setConsent({ ...consent, termos: e.target.checked })} />
              <span><b>Aceito os termos de uso e a política de privacidade</b><br /><span className="small muted">Obrigatório. Nesta versão, tudo fica salvo só neste aparelho.</span></span></label>
            <label className="check-card"><input type="checkbox" checked={consent.ia} onChange={e => setConsent({ ...consent, ia: e.target.checked })} />
              <span><b>Sugestões personalizadas por IA</b> <span className="tag gray">opcional</span><br /><span className="small muted">Quando a IA chegar, ela só usa seus dados se você permitir.</span></span></label>
            <label className="check-card"><input type="checkbox" checked={consent.novidades} onChange={e => setConsent({ ...consent, novidades: e.target.checked })} />
              <span><b>Novidades e ofertas</b> <span className="tag gray">opcional</span></span></label>
            <p className="tiny row"><ShieldCheck size={14} /> Você pode revisar essas escolhas em Perfil → Privacidade.</p>
          </div>
        )}

        {passo === 2 && (
          <div className="stack">
            <h1>Seu objetivo</h1>
            <div className="stack" style={{ gap: 10 }}>
              {OBJETIVOS.map(o => (
                <button key={o.id} className="chip" style={{ justifyContent: 'flex-start', padding: '16px', borderRadius: 18, fontSize: '1rem' }} aria-pressed={p.objetivo === o.id} onClick={() => set({ objetivo: o.id })}>
                  <span style={{ fontSize: '1.4rem' }}>{o.emoji}</span> {o.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        {passo === 3 && (
          <div className="stack">
            <h1>Um pouco sobre você</h1>
            <div className="field"><label htmlFor="ap">Como prefere ser chamado(a)?</label><input id="ap" className="input" value={p.apelido} onChange={e => set({ apelido: e.target.value })} placeholder="Seu apelido" autoComplete="nickname" /></div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field grow"><label htmlFor="id">Idade</label><input id="id" className="input" inputMode="numeric" value={p.idade ?? ''} onChange={e => set({ idade: num(e.target.value) })} placeholder="anos" /></div>
              <div className="field grow"><label htmlFor="al">Altura</label><input id="al" className="input" inputMode="numeric" value={p.altura ?? ''} onChange={e => set({ altura: num(e.target.value) })} placeholder="cm" /></div>
              <div className="field grow"><label htmlFor="pe">Peso</label><input id="pe" className="input" inputMode="decimal" value={p.peso ?? ''} onChange={e => set({ peso: num(e.target.value) })} placeholder="kg" /></div>
            </div>
            <div className="field"><span className="label">Sexo biológico (para a estimativa)</span>
              <div className="segmented">{([['f', 'Feminino'], ['m', 'Masculino'], [undefined, 'Prefiro não dizer']] as const).map(([v, n]) => <button key={n} aria-pressed={p.sexo === v} onClick={() => set({ sexo: v })}>{n}</button>)}</div></div>
            <div className="field"><span className="label">Quanto você se movimenta?</span>
              <div className="segmented">{([['sedentario', 'Pouco'], ['leve', 'Leve'], ['moderado', 'Moderado'], ['intenso', 'Muito']] as const).map(([v, n]) => <button key={v} aria-pressed={p.atividade === v} onClick={() => set({ atividade: v })}>{n}</button>)}</div></div>
          </div>
        )}

        {passo === 4 && (
          <div className="stack">
            <h1>Seus gostos</h1>
            <div className="field"><span className="label">Como você come?</span>
              <div className="segmented">{([['onivoro', 'De tudo'], ['vegetariano', 'Vegetariano'], ['vegano', 'Vegano']] as const).map(([v, n]) => <button key={v} aria-pressed={p.dieta === v} onClick={() => set({ dieta: v })}>{n}</button>)}</div></div>
            <div className="chips">{GOSTOS.map(g => <button key={g} className="chip" aria-pressed={p.gostos.includes(g)} onClick={() => set({ gostos: p.gostos.includes(g) ? p.gostos.filter(x => x !== g) : [...p.gostos, g] })}>{g}</button>)}</div>
            <div className="field"><label htmlFor="ng">Algo que você não come? (separe por vírgula)</label><textarea id="ng" className="input" value={p.naoGosta} onChange={e => set({ naoGosta: e.target.value })} placeholder="Ex.: fígado, quiabo, jiló" /></div>
          </div>
        )}

        {passo === 5 && (
          <div className="stack">
            <h1>Restrições e alergias</h1>
            <div className="chips">
              {(Object.keys(ALERGENOS) as Alergeno[]).map(a => <button key={a} className="chip" aria-pressed={p.alergias.includes(a)} onClick={() => set({ alergias: p.alergias.includes(a) ? p.alergias.filter(x => x !== a) : [...p.alergias, a] })}>{ALERGENOS[a].rotulo}</button>)}
            </div>
            <div className="card peach small">O Papa evita esses itens no cardápio e avisa na busca. Mas atenção: a identificação é feita pelo nome do alimento. <b>Sempre confira o rótulo.</b> Em caso de alergia grave, siga a orientação do seu médico.</div>
          </div>
        )}

        {passo === 6 && (
          <div className="stack">
            <h1>Sua região</h1>
            <div className="chips">{REGIOES.map(r => <button key={r.id} className="chip" aria-pressed={p.regiao === r.id} onClick={() => set({ regiao: r.id })}>{r.nome}</button>)}</div>
            <p className="muted small">O cardápio dá preferência a pratos da sua região, mas sempre mistura um pouco do Brasil todo.</p>
          </div>
        )}

        {passo === 7 && (
          <div className="stack">
            <h1>Sua rotina</h1>
            <div className="field"><span className="label">Tempo para cozinhar</span>
              <div className="segmented">{([['rapido', 'Até 15 min'], ['medio', 'Até 30 min'], ['longo', 'Sem pressa']] as const).map(([v, n]) => <button key={v} aria-pressed={p.tempo === v} onClick={() => set({ tempo: v })}>{n}</button>)}</div></div>
            <div className="field"><span className="label">Orçamento</span>
              <div className="segmented">{([['economico', 'Econômico'], ['equilibrado', 'Equilibrado'], ['flexivel', 'Flexível']] as const).map(([v, n]) => <button key={v} aria-pressed={p.orcamento === v} onClick={() => set({ orcamento: v })}>{n}</button>)}</div></div>
          </div>
        )}

        {passo === 8 && (
          <div className="stack">
            <h1>Tudo pronto{p.apelido ? `, ${p.apelido}` : ''}!</h1>
            <div className="card stack">
              <div className="row between"><span className="muted">Meta diária</span><b className="num" style={{ fontSize: '1.4rem' }}>{fmt(metas.kcal)} kcal</b></div>
              <div className="row between small"><span className="muted">Proteínas · Carboidratos · Gorduras</span><span className="num">{metas.proteina} · {metas.carboidrato} · {metas.gordura} g</span></div>
              <div className="row between small"><span className="muted">Água</span><span className="num">{fmt(metas.aguaMl / 1000, 1)} L</span></div>
            </div>
            <p className="tiny">{metas.estimada ? 'Estimativa pela equação de Mifflin-St Jeor com o seu nível de atividade.' : 'Sem peso, altura e idade, usamos uma referência de 2.000 kcal.'} É uma estimativa educativa e não substitui a orientação de um(a) nutricionista. Você pode ajustar tudo no Perfil.</p>
          </div>
        )}
      </div>

      <button className="btn block" onClick={avancar} disabled={!podeAvancar}>
        {passo === 0 ? 'Começar' : passo === TOTAL - 1 ? 'Ver meu primeiro cardápio' : 'Continuar'}
      </button>
      {passo === 0 && <p className="tiny" style={{ textAlign: 'center' }}>Sem cadastro: seus dados ficam neste aparelho.</p>}
    </div>
  )
}
