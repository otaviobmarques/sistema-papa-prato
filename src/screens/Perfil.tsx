import { useState } from 'react'
import { Download, LayoutDashboard, LifeBuoy, PlayCircle, Trash2 } from 'lucide-react'
import { Suporte } from './Suporte'
import { Folha, fmt } from '../components/ui'
import { CartaoConta } from '../components/Conta'
import { MinhaAssinatura } from '../components/MinhaAssinatura'
import { MeuNutricionista } from '../components/MeuNutricionista'
import { CartaoInstalar } from '../components/Instalar'
import { Assinatura } from '../components/Assinatura'
import { registrarConsentimento } from '../lib/sync'
import { Mascot } from '../components/Mascot'
import { ALERGENOS, type Alergeno } from '../lib/alergias'
import { calcularMetas } from '../lib/metas'
import { apagarTudo, atualizar, obterEstado, useEstado, type Perfil as TPerfil } from '../lib/store'

const CITACOES = [
  'Tabela Brasileira de Composição de Alimentos (TACO), 4ª ed. revisada e ampliada. NEPA/UNICAMP, 2011.',
  'Tabela Brasileira de Composição de Alimentos (TBCA). Universidade de São Paulo (USP), Food Research Center (FoRC).',
  'IBGE. Pesquisa de Orçamentos Familiares 2008-2009: Tabelas de Composição Nutricional dos Alimentos Consumidos no Brasil.',
  'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central (domínio público, CC0).',
  "Contains public sector information licensed under the Open Government Licence v3.0 — McCance and Widdowson's Composition of Foods Integrated Dataset 2021.",
]

export function Perfil() {
  const perfil = useEstado(e => e.perfil)!
  const ajustes = useEstado(e => e.ajustes)
  const consent = useEstado(e => e.consentimento)
  const [confirmar, setConfirmar] = useState(false)
  const [suporte, setSuporte] = useState(false)
  const metas = calcularMetas(perfil)
  const set = (m: Partial<TPerfil>) => atualizar(e => ({ ...e, perfil: { ...e.perfil!, ...m } }))
  const setAj = (m: Partial<typeof ajustes>) => atualizar(e => ({ ...e, ajustes: { ...e.ajustes, ...m } }))
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')))

  const exportar = () => {
    const blob = new Blob([JSON.stringify(obterEstado(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `papa-prato-meus-dados-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="stack">
      <div className="row"><Mascot size={70} /><div><h1>{perfil.apelido}</h1><p className="small muted">Desde {new Date(perfil.criadoEm).toLocaleDateString('pt-BR')}</p></div></div>

      <CartaoConta />
      <MinhaAssinatura />
      <MeuNutricionista />
      <CartaoInstalar />
      <div className="row" style={{ gap: 10 }}>
        <button className="btn ghost grow" onClick={() => setSuporte(true)}><LifeBuoy size={18} /> Ajuda e suporte</button>
        <button className="btn ghost grow" onClick={() => atualizar(e => ({ ...e, tourVisto: false }))}><PlayCircle size={18} /> Ver o tour</button>
      </div>
      <Suporte aberta={suporte} onFechar={() => setSuporte(false)} />

      <div className="card stack">
        <h3>Suas metas</h3>
        <div className="row between"><span className="muted">Energia</span><b className="num">{fmt(metas.kcal)} kcal/dia</b></div>
        <div className="row between small"><span className="muted">Proteínas · Carb. · Gorduras</span><span className="num">{metas.proteina} · {metas.carboidrato} · {metas.gordura} g</span></div>
        <div className="row between small"><span className="muted">Água</span><span className="num">{fmt(metas.aguaMl / 1000, 1)} L</span></div>
        <p className="tiny">{metas.estimada ? 'Estimada pela equação de Mifflin-St Jeor.' : 'Referência de 2.000 kcal (preencha peso, altura e idade para estimar).'} Não substitui avaliação profissional.</p>
      </div>

      <div className="card stack">
        <h3>Seus dados</h3>
        <div className="field"><label htmlFor="pa">Apelido</label><input id="pa" className="input" value={perfil.apelido} onChange={e => set({ apelido: e.target.value })} /></div>
        <div className="row">
          <div className="field grow"><label htmlFor="pi">Idade</label><input id="pi" className="input" inputMode="numeric" value={perfil.idade ?? ''} onChange={e => set({ idade: num(e.target.value) })} /></div>
          <div className="field grow"><label htmlFor="pal">Altura (cm)</label><input id="pal" className="input" inputMode="numeric" value={perfil.altura ?? ''} onChange={e => set({ altura: num(e.target.value) })} /></div>
          <div className="field grow"><label htmlFor="ppe">Peso (kg)</label><input id="ppe" className="input" inputMode="decimal" value={perfil.peso ?? ''} onChange={e => set({ peso: num(e.target.value) })} /></div>
        </div>
        <div className="field"><span className="label">Objetivo</span>
          <div className="chips">{([['comer-melhor', 'Comer melhor'], ['perder-peso', 'Perder peso'], ['ganhar-massa', 'Ganhar massa'], ['manter', 'Manter']] as const).map(([v, n]) => <button key={v} className="chip" aria-pressed={perfil.objetivo === v} onClick={() => set({ objetivo: v })}>{n}</button>)}</div></div>
        <div className="field"><span className="label">Atividade</span>
          <div className="segmented">{([['sedentario', 'Pouca'], ['leve', 'Leve'], ['moderado', 'Moderada'], ['intenso', 'Muita']] as const).map(([v, n]) => <button key={v} aria-pressed={perfil.atividade === v} onClick={() => set({ atividade: v })}>{n}</button>)}</div></div>
        <div className="field"><span className="label">Alimentação</span>
          <div className="segmented">{([['onivoro', 'De tudo'], ['vegetariano', 'Vegetariana'], ['vegano', 'Vegana']] as const).map(([v, n]) => <button key={v} aria-pressed={perfil.dieta === v} onClick={() => set({ dieta: v })}>{n}</button>)}</div></div>
        <div className="field"><span className="label">Alergias e restrições</span>
          <div className="chips">{(Object.keys(ALERGENOS) as Alergeno[]).map(a => <button key={a} className="chip" aria-pressed={perfil.alergias.includes(a)} onClick={() => set({ alergias: perfil.alergias.includes(a) ? perfil.alergias.filter(x => x !== a) : [...perfil.alergias, a] })}>{ALERGENOS[a].rotulo}</button>)}</div></div>
        <div className="field"><label htmlFor="png">Não como</label><input id="png" className="input" value={perfil.naoGosta} onChange={e => set({ naoGosta: e.target.value })} placeholder="fígado, quiabo…" /></div>
        <div className="field"><span className="label">Região</span>
          <div className="chips">{([['norte', 'Norte'], ['nordeste', 'Nordeste'], ['centro-oeste', 'Centro-Oeste'], ['sudeste', 'Sudeste'], ['sul', 'Sul'], ['misturar', 'Misturar']] as const).map(([v, n]) => <button key={v} className="chip" aria-pressed={perfil.regiao === v} onClick={() => set({ regiao: v })}>{n}</button>)}</div></div>
        <button className="btn ghost sm" onClick={() => atualizar(e => ({ ...e, plano: { semente: Math.floor(Math.random() * 1000), trocas: {} } }))}>Gerar um novo cardápio</button>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Acessibilidade</h3>
        <label className="toggle"><span>Letras maiores</span><input type="checkbox" className="switch" checked={ajustes.fonteGrande} onChange={e => setAj({ fonteGrande: e.target.checked })} /></label>
        <label className="toggle"><span>Alto contraste</span><input type="checkbox" className="switch" checked={ajustes.altoContraste} onChange={e => setAj({ altoContraste: e.target.checked })} /></label>
        <label className="toggle"><span>Menos animações</span><input type="checkbox" className="switch" checked={ajustes.menosAnimacao} onChange={e => setAj({ menosAnimacao: e.target.checked })} /></label>
        <div className="toggle"><span>Tema</span>
          <div className="segmented" style={{ width: 210 }}>{([['auto', 'Auto'], ['claro', 'Claro'], ['escuro', 'Escuro']] as const).map(([v, n]) => <button key={v} aria-pressed={ajustes.tema === v} onClick={() => setAj({ tema: v })}>{n}</button>)}</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Privacidade</h3>
        <label className="toggle"><span>Sugestões por IA<br /><span className="tiny">Permite enviar a foto do prato para análise pelo Claude (Anthropic). A foto não fica guardada.</span></span><input type="checkbox" className="switch" checked={!!consent?.ia} onChange={e => { const v = e.target.checked; atualizar(s => ({ ...s, consentimento: { ...s.consentimento!, ia: v } })); registrarConsentimento('ia', v) }} /></label>
        <label className="toggle"><span>Novidades e ofertas</span><input type="checkbox" className="switch" checked={!!consent?.novidades} onChange={e => { const v = e.target.checked; atualizar(s => ({ ...s, consentimento: { ...s.consentimento!, novidades: v } })); registrarConsentimento('novidades', v) }} /></label>
        <p className="tiny" style={{ margin: '10px 0' }}>Seus dados ficam neste aparelho e, se você tiver conta, também na nuvem (Supabase, servidores em São Paulo). Termos aceitos em {consent?.termos ? new Date(consent.termos).toLocaleDateString('pt-BR') : '—'}.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={exportar}><Download size={16} /> Baixar meus dados</button>
          <button className="btn danger sm" onClick={() => setConfirmar(true)}><Trash2 size={16} /> Apagar tudo</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Fontes dos dados nutricionais</h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }} className="fonte-cit">{CITACOES.map(c => <li key={c}>{c}</li>)}</ul>
        <p className="tiny" style={{ marginTop: 8 }}>Alérgenos são estimados pelo nome do alimento. Confira sempre o rótulo.</p>
      </div>

      <a className="btn ghost block" href="#admin" style={{ textDecoration: 'none' }}><LayoutDashboard size={18} /> Painel administrativo (equipe)</a>
      <p className="tiny" style={{ textAlign: 'center' }}>Papa Prato · versão 0.2</p>
      <Assinatura centro />

      <Folha aberta={confirmar} onFechar={() => setConfirmar(false)} titulo="Apagar todos os dados?">
        <div className="stack">
          <p className="muted">Isso remove seu perfil, diário, favoritos e conquistas deste aparelho. Não dá para desfazer. Se quiser, baixe uma cópia antes.</p>
          <button className="btn danger block" onClick={() => { apagarTudo(); setConfirmar(false) }}>Sim, apagar tudo</button>
          <button className="btn ghost block" onClick={() => setConfirmar(false)}>Cancelar</button>
        </div>
      </Folha>
    </div>
  )
}
