import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeft, Bot, Database, LifeBuoy, LogOut, Shield, UserCog, Users, LayoutDashboard, ListChecks, MessageCircle, Plus, Rocket, Trash2, UtensilsCrossed } from 'lucide-react'
import { Folha, avisar, Avisos, fmt, useAlimentos } from '../components/ui'
import { FormularioLink } from '../components/Conta'
import { Assinatura } from '../components/Assinatura'
import { Equipe, IA, PainelServidor, Privacidade, Saude, SuporteEquipe, Usuarios } from './Modulos'
import { carregarAlimentosEquipe, excluirAlimentoEquipe, publicarConteudo, salvarAlimentoEquipe, usePapel } from '../lib/equipe'
import { supabase, traduzirErro, useSessao } from '../lib/supabase'
import { Mascot } from '../components/Mascot'
import { MODELOS, RECEITAS } from '../data/cardapio'
import { alergenosEstimados, ALERGENOS } from '../lib/alergias'
import { buscar, NOME_FONTE, nutrientesDe, somar, type Fonte } from '../lib/alimentos'
import { CONQUISTAS, desbloqueadas } from '../lib/conquistas'
import { DICAS_PADRAO, atualizar, obterEstado, uid, useEstado, type AlimentoPersonalizado } from '../lib/store'

type Aba = 'painel' | 'usuarios' | 'suporte' | 'alimentos' | 'cardapios' | 'conteudo' | 'ia' | 'privacidade' | 'saude' | 'equipe' | 'roadmap'
const ABAS: { id: Aba; nome: string; icone: typeof Database; servidor?: boolean }[] = [
  { id: 'painel', nome: 'Painel', icone: LayoutDashboard },
  { id: 'usuarios', nome: 'Usuários', icone: Users, servidor: true },
  { id: 'suporte', nome: 'Suporte', icone: LifeBuoy, servidor: true },
  { id: 'alimentos', nome: 'Alimentos', icone: Database },
  { id: 'cardapios', nome: 'Cardápios e receitas', icone: UtensilsCrossed },
  { id: 'conteudo', nome: 'Conteúdo do mascote', icone: MessageCircle },
  { id: 'ia', nome: 'Inteligência artificial', icone: Bot, servidor: true },
  { id: 'privacidade', nome: 'Privacidade', icone: Shield, servidor: true },
  { id: 'saude', nome: 'Saúde do sistema', icone: Activity, servidor: true },
  { id: 'equipe', nome: 'Equipe e segurança', icone: UserCog, servidor: true },
  { id: 'roadmap', nome: 'Próximos módulos', icone: Rocket },
]

// Com o servidor ligado, o painel exige login de alguém da equipe (papel definido no banco).
export function Admin() {
  const sessao = useSessao()
  const { carregando, papel } = usePapel()
  useEffect(() => { if (papel) carregarAlimentosEquipe().catch(() => {}) }, [papel])
  if (!supabase) return <PainelAdmin modo="local" />
  if (carregando) return <div className="onb"><div className="empty"><Mascot size={80} humor="pensativo" />Verificando acesso…</div></div>
  if (!sessao || !papel) return (
    <div className="onb">
      <div className="row"><Mascot size={60} animado={false} /><div className="marca">Papa <b>Prato</b> · equipe</div></div>
      <div className="card stack">
        <h2>Painel administrativo</h2>
        {!sessao ? <LoginEquipe /> : (
          <>
            <p className="small">Você entrou como <b>{sessao.user.email}</b>, mas essa conta não faz parte da equipe. Peça a um administrador para te convidar.</p>
            <button className="btn ghost" onClick={() => supabase!.auth.signOut()}><LogOut size={16} /> Sair e entrar com outra conta</button>
          </>
        )}
      </div>
      <a className="btn ghost block" href="#" style={{ textDecoration: 'none' }}><ArrowLeft size={18} /> Voltar ao app</a>
      <Assinatura centro />
    </div>
  )
  return <PainelAdmin modo="servidor" />
}

// Usuário sem "@" vira a conta interna <usuario>@papaprato.invalid (conta da equipe, sem e-mail real).
const DOMINIO_INTERNO = 'papaprato.invalid'
function LoginEquipe() {
  const [modo, setModo] = useState<'senha' | 'link'>('senha')
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)
  const entrar = async (ev: React.FormEvent) => {
    ev.preventDefault(); setErro(''); setEntrando(true)
    const u = usuario.trim().toLowerCase()
    const { error } = await supabase!.auth.signInWithPassword({ email: u.includes('@') ? u : `${u}@${DOMINIO_INTERNO}`, password: senha })
    if (error) setErro(/invalid login|credentials/i.test(error.message) ? 'Usuário ou senha incorretos.' : traduzirErro(error.message))
    setEntrando(false)
  }
  return (
    <div className="stack">
      <div className="segmented">
        <button aria-pressed={modo === 'senha'} onClick={() => setModo('senha')}>Usuário e senha</button>
        <button aria-pressed={modo === 'link'} onClick={() => setModo('link')}>Link por e-mail</button>
      </div>
      {modo === 'senha' ? (
        <form className="stack" style={{ gap: 10 }} onSubmit={entrar}>
          <div className="field"><label htmlFor="adm-usuario">Usuário</label>
            <input id="adm-usuario" className="input" autoComplete="username" autoCapitalize="none" required value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="admin" /></div>
          <div className="field"><label htmlFor="adm-senha">Senha</label>
            <input id="adm-senha" className="input" type="password" autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} /></div>
          {erro && <p className="small" style={{ color: 'var(--red)' }}>{erro}</p>}
          <button className="btn block" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      ) : (
        <>
          <p className="muted small">Entre com o e-mail da equipe. Se o seu e-mail estiver convidado, o acesso libera na hora.</p>
          <FormularioLink textoBotao="Enviar link de acesso" aoEnviar={() => { try { localStorage.setItem('papa-prato:voltar-admin', '1') } catch { /* ok */ } }} />
        </>
      )}
    </div>
  )
}

function PainelAdmin({ modo }: { modo: 'local' | 'servidor' }) {
  const [aba, setAba] = useState<Aba>('painel')
  return (
    <div className="adm">
      <aside>
        <div className="row"><Mascot size={44} animado={false} /><div className="marca">Papa <b>Prato</b></div></div>
        <p className="tiny" style={{ color: '#B9D9C8', marginTop: 6 }}>Painel administrativo</p>
        <nav>
          {ABAS.filter(a => !a.servidor || modo === 'servidor').map(a => <button key={a.id} aria-current={aba === a.id ? 'page' : undefined} onClick={() => setAba(a.id)}><a.icone size={17} /> {a.nome}</button>)}
          <button onClick={() => { location.hash = '' }}><ArrowLeft size={17} /> Voltar ao app</button>
          {modo === 'servidor' && <button onClick={() => supabase!.auth.signOut()}><LogOut size={17} /> Sair</button>}
        </nav>
        <div style={{ marginTop: 24 }}><Assinatura escuro /></div>
        <p className="tiny" style={{ color: '#B9D9C8', marginTop: 18 }}>{modo === 'servidor' ? 'Alterações salvas no servidor e publicadas para todos.' : 'Modo local: alterações valem só neste aparelho.'}</p>
      </aside>
      <main className="stack" style={{ gap: 20 }}>
        {aba === 'painel' && (modo === 'servidor' ? <PainelServidor /> : <Painel />)}
        {aba === 'usuarios' && <Usuarios />}
        {aba === 'suporte' && <SuporteEquipe />}
        {aba === 'ia' && <IA />}
        {aba === 'privacidade' && <Privacidade />}
        {aba === 'saude' && <Saude />}
        {aba === 'equipe' && <Equipe />}
        {aba === 'alimentos' && <Alimentos />}
        {aba === 'cardapios' && <Cardapios />}
        {aba === 'conteudo' && <Conteudo />}
        {aba === 'roadmap' && <Roadmap />}
      </main>
      <Avisos />
    </div>
  )
}

function Cabecalho({ titulo, texto }: { titulo: string; texto: string }) {
  return <div><h1>{titulo}</h1><p className="muted" style={{ marginTop: 4, maxWidth: 760 }}>{texto}</p></div>
}

function Painel() {
  const base = useAlimentos()
  useEstado(e => e)
  const e = obterEstado()
  const registros = Object.values(e.dias).flatMap(d => d.registros)
  const porFonte = useMemo(() => {
    const c: Record<string, number> = {}
    if (base.pronto) base.lista.forEach(a => { c[a.fonte] = (c[a.fonte] ?? 0) + 1 })
    return c
  }, [base.pronto])
  const top = Object.entries(registros.reduce<Record<string, number>>((m, r) => { m[r.nome] = (m[r.nome] ?? 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return (
    <>
      <Cabecalho titulo="Painel" texto="Indicadores deste aparelho. Com o servidor (próxima fase), estes números passam a ser de todos os usuários, de forma agregada e anônima." />
      <div className="kpis">
        <div className="kpi"><small>Alimentos na base</small><strong>{base.pronto ? fmt(base.lista.length) : '…'}</strong></div>
        <div className="kpi"><small>Registros no diário</small><strong>{fmt(registros.length)}</strong></div>
        <div className="kpi"><small>Dias com registro</small><strong>{Object.values(e.dias).filter(d => d.registros.length).length}</strong></div>
        <div className="kpi"><small>Conquistas</small><strong>{desbloqueadas(e).length}/{CONQUISTAS.length}</strong></div>
        <div className="kpi"><small>Alimentos da equipe</small><strong>{e.alimentosPersonalizados.length}</strong></div>
        <div className="kpi"><small>Modelos de refeição</small><strong>{MODELOS.length}</strong></div>
      </div>
      <div className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
        <div className="card grow" style={{ minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>Base de alimentos por fonte</h3>
          {Object.entries(porFonte).map(([f, n]) => (
            <div key={f} className="macro" style={{ marginBottom: 10 }}>
              <div className="row between small"><span>{NOME_FONTE[f as Fonte] ?? 'Equipe Papa Prato'}</span><b className="num">{fmt(n)}</b></div>
              <div className="bar"><span style={{ width: `${(n / Math.max(...Object.values(porFonte))) * 100}%`, background: 'var(--green)' }} /></div>
            </div>
          ))}
        </div>
        <div className="card grow" style={{ minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>Mais registrados</h3>
          {top.length ? <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{top.map(([n, c]) => <li key={n}>{n} <span className="muted num">({c})</span></li>)}</ol> : <p className="muted small">Ainda sem registros.</p>}
        </div>
      </div>
    </>
  )
}

function Alimentos() {
  const base = useAlimentos()
  const pers = useEstado(e => e.alimentosPersonalizados)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<AlimentoPersonalizado | null>(null)
  const res = useMemo(() => base.pronto ? (q ? buscar(base.lista, q, 100) : base.lista.slice(0, 50)) : [], [q, base.pronto])
  const novo = (): AlimentoPersonalizado => ({ id: 'pp_' + uid(), nome: '', kcal: 0, proteina: 0, carboidrato: 0, gordura: 0, fibra: null, medidas: [], publicado: false, atualizadoEm: new Date().toISOString() })
  return (
    <>
      <Cabecalho titulo="Alimentos" texto="A base oficial (TACO, TBCA, IBGE/POF, USDA, CoFID) é somente leitura: os números nunca são alterados. Para atualizar a base, rode scripts/gerar-alimentos.py a partir do repositório fontes-ref. Itens próprios (ex.: receitas da casa) podem ser cadastrados abaixo e só aparecem no app depois de publicados." />
      <div className="card stack">
        <div className="row between"><h3>Alimentos da equipe ({pers.length})</h3><button className="btn sm" onClick={() => setEdit(novo())}><Plus size={16} /> Novo alimento</button></div>
        {pers.length ? (
          <div className="tabela-box"><table className="tabela"><thead><tr><th>Nome</th><th className="n">kcal</th><th className="n">P</th><th className="n">C</th><th className="n">G</th><th>Situação</th><th></th></tr></thead>
            <tbody>{pers.map(p => <tr key={p.id}><td>{p.nome}</td><td className="n">{fmt(p.kcal)}</td><td className="n">{fmt(p.proteina, 1)}</td><td className="n">{fmt(p.carboidrato, 1)}</td><td className="n">{fmt(p.gordura, 1)}</td><td><span className={`tag ${p.publicado ? '' : 'orange'}`}>{p.publicado ? 'Publicado' : 'Rascunho'}</span></td><td><button className="link" onClick={() => setEdit(p)}>Editar</button></td></tr>)}</tbody></table></div>
        ) : <p className="muted small">Nenhum alimento próprio ainda.</p>}
      </div>
      <div className="stack">
        <input className="input" placeholder="Buscar na base oficial…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 420 }} />
        <div className="tabela-box">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Fonte</th><th className="n">kcal</th><th className="n">Prot.</th><th className="n">Carb.</th><th className="n">Gord.</th><th className="n">Fibra</th><th>Medidas</th><th>Alérgenos (estim.)</th></tr></thead>
            <tbody>{res.map(a => (
              <tr key={a.id}>
                <td>{a.nome}<div className="tiny">{a.id}</div></td><td><span className="tag gray">{a.personalizado ? 'Equipe' : a.fonte}</span></td>
                <td className="n">{fmt(a.kcal)}</td><td className="n">{fmt(a.proteina, 1)}</td><td className="n">{fmt(a.carboidrato, 1)}</td><td className="n">{fmt(a.gordura, 1)}</td><td className="n">{a.fibra == null ? '—' : fmt(a.fibra, 1)}</td>
                <td className="tiny">{a.medidas.map(m => `${m.nome} (${fmt(m.gramas)} g)`).join(', ') || '—'}</td>
                <td className="tiny">{alergenosEstimados(a.nome).map(x => ALERGENOS[x].rotulo).join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <EditarAlimento item={edit} onFechar={() => setEdit(null)} />
    </>
  )
}

function EditarAlimento({ item, onFechar }: { item: AlimentoPersonalizado | null; onFechar: () => void }) {
  const [f, setF] = useState<AlimentoPersonalizado | null>(null)
  if (item && f?.id !== item.id) setF(item)
  if (!item || !f) return null
  const existe = obterEstado().alimentosPersonalizados.some(p => p.id === f.id)
  const salvar = async (publicado: boolean) => {
    const pronto = { ...f, publicado, atualizadoEm: new Date().toISOString() }
    if (supabase) {
      try { await salvarAlimentoEquipe(pronto); avisar(publicado ? 'Publicado para todos.' : 'Rascunho salvo.') }
      catch (e) { avisar('Não foi possível salvar: ' + (e as Error).message); return }
    } else {
      atualizar(e => ({ ...e, alimentosPersonalizados: existe ? e.alimentosPersonalizados.map(p => p.id === f.id ? pronto : p) : [...e.alimentosPersonalizados, pronto] }))
    }
    setF(null); onFechar()
  }
  const excluir = async () => {
    if (supabase) {
      try { await excluirAlimentoEquipe(f.id) } catch (e) { avisar('Não foi possível excluir: ' + (e as Error).message); return }
    } else atualizar(e => ({ ...e, alimentosPersonalizados: e.alimentosPersonalizados.filter(p => p.id !== f.id) }))
    setF(null); onFechar()
  }
  const numero = (k: 'kcal' | 'proteina' | 'carboidrato' | 'gordura') => (
    <div className="field grow"><label>{k === 'kcal' ? 'kcal' : k[0].toUpperCase() + k.slice(1) + ' (g)'} /100 g</label><input className="input" inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value.replace(',', '.')) || 0 })} /></div>
  )
  const medida = f.medidas[0]
  return (
    <Folha aberta onFechar={() => { setF(null); onFechar() }} titulo={existe ? 'Editar alimento' : 'Novo alimento'}>
      <div className="stack">
        <div className="field"><label>Nome</label><input className="input" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Bolo de cenoura da casa" /></div>
        <div className="row wrap">{numero('kcal')}{numero('proteina')}</div>
        <div className="row wrap">{numero('carboidrato')}{numero('gordura')}</div>
        <div className="row">
          <div className="field grow"><label>Medida caseira</label><input className="input" value={medida?.nome ?? ''} onChange={e => setF({ ...f, medidas: e.target.value ? [{ nome: e.target.value, gramas: medida?.gramas ?? 100 }] : [] })} placeholder="fatia média" /></div>
          <div className="field" style={{ width: 110 }}><label>Gramas</label><input className="input" inputMode="decimal" value={medida?.gramas ?? ''} onChange={e => medida && setF({ ...f, medidas: [{ ...medida, gramas: Number(e.target.value) || 0 }] })} /></div>
        </div>
        <p className="tiny">Valores por 100 g. Informe de onde vieram (rótulo, cálculo de receita) para manter a rastreabilidade.</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost grow" onClick={() => salvar(false)} disabled={!f.nome.trim()}>Salvar rascunho</button>
          <button className="btn grow" onClick={() => salvar(true)} disabled={!f.nome.trim() || f.kcal <= 0}>Publicar</button>
        </div>
        {existe && <button className="btn danger" onClick={excluir}><Trash2 size={16} /> Excluir</button>}
      </div>
    </Folha>
  )
}

function Cardapios() {
  const base = useAlimentos()
  if (!base.pronto) return <p>Carregando…</p>
  const linhas = MODELOS.map(m => {
    const faltando = m.itens.filter(i => !base.porId.get(i.id)).map(i => i.id)
    const n = somar(m.itens.filter(i => base.porId.get(i.id)).map(i => nutrientesDe(base.porId.get(i.id)!, i.g)))
    const alerg = [...new Set(m.itens.flatMap(i => base.porId.get(i.id) ? alergenosEstimados(base.porId.get(i.id)!.nome) : []))]
    return { m, n, faltando, alerg }
  })
  return (
    <>
      <Cabecalho titulo="Cardápios e receitas" texto="Modelos de refeição usados para montar o cardápio semanal. As porções de referência abaixo são ajustadas automaticamente à meta de cada pessoa. Cada item aponta para um alimento real da base, e a verificação abaixo avisa se algum código sumir numa atualização." />
      <div className="tabela-box"><table className="tabela">
        <thead><tr><th>Refeição</th><th>Modelo</th><th>Regiões</th><th className="n">kcal (ref.)</th><th className="n">Prot.</th><th>Alérgenos (estim.)</th><th>Verificação</th></tr></thead>
        <tbody>{linhas.map(({ m, n, faltando, alerg }) => (
          <tr key={m.id}><td>{m.refeicao}</td><td>{m.nome}</td><td className="tiny">{m.regioes?.join(', ') ?? 'todas'}</td><td className="n">{fmt(n.kcal)}</td><td className="n">{fmt(n.proteina)}</td><td className="tiny">{alerg.map(a => ALERGENOS[a].rotulo).join(', ') || '—'}</td>
            <td>{faltando.length ? <span className="tag orange">Faltando: {faltando.join(', ')}</span> : <span className="tag">OK</span>}</td></tr>
        ))}</tbody>
      </table></div>
      <h2>Receitas ({RECEITAS.length})</h2>
      <div className="kpis">{RECEITAS.map(r => <div key={r.id} className="kpi"><div style={{ fontSize: '1.5rem' }}>{r.emoji}</div><b>{r.nome}</b><small>{r.minutos} min · {r.regiao}</small></div>)}</div>
      <p className="tiny">Na próxima fase, modelos e receitas passam a ser editados aqui, com aprovação editorial e histórico de versões (A04/A05).</p>
    </>
  )
}

function Conteudo() {
  const c = useEstado(e => e.conteudo)
  const [nova, setNova] = useState('')
  const set = (m: Partial<typeof c>) => atualizar(e => ({ ...e, conteudo: { ...e.conteudo, ...m } }))
  return (
    <>
      <Cabecalho titulo="Conteúdo do mascote" texto="Saudações e dicas que o Papa mostra na tela inicial. Edite e veja a prévia; depois toque em Publicar para todos." />
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
        <div className="card stack grow" style={{ minWidth: 300 }}>
          <h3>Saudações</h3>
          {(['manha', 'tarde', 'noite'] as const).map(k => (
            <div key={k} className="field"><label>{k === 'manha' ? 'Manhã' : k === 'tarde' ? 'Tarde' : 'Noite'}</label><input className="input" value={c.saudacoes[k]} onChange={e => set({ saudacoes: { ...c.saudacoes, [k]: e.target.value } })} /></div>
          ))}
          <h3>Dicas ({c.dicas.length})</h3>
          <div className="list">{c.dicas.map((d, i) => (
            <div key={i} className="item"><span className="grow small">{d}</span><button className="icon-btn flat" aria-label="Remover dica" onClick={() => set({ dicas: c.dicas.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></div>
          ))}</div>
          <div className="row"><input className="input grow" value={nova} onChange={e => setNova(e.target.value)} placeholder="Nova dica…" /><button className="btn sm" disabled={!nova.trim()} onClick={() => { set({ dicas: [...c.dicas, nova.trim()] }); setNova('') }}>Adicionar</button></div>
          <button className="link" onClick={() => set({ dicas: DICAS_PADRAO })}>Restaurar dicas padrão</button>
          {supabase && <button className="btn" onClick={async () => { try { await publicarConteudo(); avisar('Conteúdo publicado para todos.') } catch (e) { avisar('Não foi possível publicar: ' + (e as Error).message) } }}>Publicar para todos</button>}
        </div>
        <div className="card stack" style={{ width: 300 }}>
          <h3>Pré-visualização</h3>
          <div className="row"><Mascot size={70} /><div className="balao small">{c.saudacoes.manha}! {c.dicas[0]}</div></div>
          <div className="row" style={{ justifyContent: 'space-around' }}><Mascot size={80} humor="festa" /><Mascot size={80} humor="pensativo" /></div>
          <p className="tiny">Humores disponíveis: feliz, festa (conquistas) e pensativo (carregando, busca vazia).</p>
        </div>
      </div>
    </>
  )
}

function Roadmap() {
  const itens = [
    { id: 'A04', nome: 'Receitas editáveis', o: 'Criar e editar receitas no painel, com aprovação e histórico. Hoje elas ficam no código.' },
    { id: 'A05', nome: 'Cardápios editáveis', o: 'Criar modelos de refeição no painel e testar como ficam para cada perfil.' },
    { id: 'A07', nome: 'Assinaturas', o: 'Planos pagos (Plus), pagamento, cupons e reembolsos. Precisa definir preços e o meio de pagamento.' },
    { id: 'A11', nome: 'Gamificação', o: 'Criar conquistas e campanhas pelo painel, com regras contra fraude.' },
    { id: 'A12', nome: 'Profissionais', o: 'Nutricionistas com CRN verificado acompanhando pacientes. Precisa de decisão de negócio.' },
    { id: 'T34', nome: 'Conversa com o Papa', o: 'Chat com a IA sobre alimentação, com histórico que a pessoa pode apagar. Candidato ao Plus.' },
  ]
  return (
    <>
      <Cabecalho titulo="Próximos módulos" texto="O que falta do projeto original de 14 módulos do painel e das telas do app." />
      <div className="kpis">{itens.map(i => <div key={i.id} className="kpi stack" style={{ gap: 6 }}><span className="tag gray" style={{ width: 'fit-content' }}>{i.id}</span><b>{i.nome}</b><small>{i.o}</small></div>)}</div>
      <div className="card row"><ListChecks /><p className="small">Já funcionando: A01 Painel, A02 Usuários, A03 Alimentos, A05 Cardápios (verificação), A06 Conteúdo do mascote, A08 Suporte, A09 Privacidade, A10 IA, A13 Saúde do sistema e A14 Equipe e segurança.</p></div>
    </>
  )
}
