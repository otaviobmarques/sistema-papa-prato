import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { avisar, fmt } from '../components/ui'
import { Conversa, CATEGORIAS, STATUS } from '../screens/Suporte'
import { supabase, useSessao } from '../lib/supabase'
import { usePapel } from '../lib/equipe'
import { GerenciarUsuarios } from './GerenciarUsuarios'

// Módulos do painel que leem o servidor. Tudo passa por funções do banco que só respondem para a equipe
// e nunca devolvem diário, perfil ou dados de saúde de ninguém.

function useRpc<T>(nome: string, args?: Record<string, unknown>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState('')
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!supabase) return
    setErro('')
    supabase.rpc(nome, args).then(({ data, error }) => { if (error) setErro(error.message); else setDados(data as T) })
  }, [n, ...deps])
  return { dados, erro, recarregar: () => setN(x => x + 1) }
}

export function Cabecalho({ titulo, texto, acoes }: { titulo: string; texto: string; acoes?: ReactNode }) {
  return <div className="row between wrap" style={{ alignItems: 'flex-end' }}><div><h1>{titulo}</h1><p className="muted" style={{ marginTop: 4, maxWidth: 760 }}>{texto}</p></div>{acoes}</div>
}
const Erro = ({ m }: { m: string }) => m ? <div className="card peach small">Não foi possível carregar: {m}</div> : null
const quando = (d?: string | null) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

// ---------------- A01 Painel ----------------
type Kpis = { usuarios: number; novos_7d: number; ativos_7d: number; ativos_30d: number; dias_registrados: number; refeicoes_registradas: number; ia_chamadas_30d: number; ia_erros_30d: number; tickets_abertos: number; cadastros_por_dia: { dia: string; n: number }[] }
export function PainelServidor() {
  const { dados: k, erro, recarregar } = useRpc<Kpis>('painel_kpis')
  return (
    <>
      <Cabecalho titulo="Painel" texto="Números de todo o Papa Prato, agregados. Nenhum dado individual de saúde aparece aqui." acoes={<button className="btn ghost sm" onClick={recarregar}><RefreshCw size={16} /> Atualizar</button>} />
      <Erro m={erro} />
      {k && (
        <>
          <div className="kpis">
            <div className="kpi"><small>Pessoas cadastradas</small><strong>{fmt(k.usuarios)}</strong><small>+{k.novos_7d} nos últimos 7 dias</small></div>
            <div className="kpi"><small>Ativas em 7 dias</small><strong>{fmt(k.ativos_7d)}</strong><small>{fmt(k.ativos_30d)} em 30 dias</small></div>
            <div className="kpi"><small>Refeições registradas</small><strong>{fmt(k.refeicoes_registradas)}</strong><small>em {fmt(k.dias_registrados)} dias de diário</small></div>
            <div className="kpi"><small>Fotos analisadas (30 dias)</small><strong>{fmt(k.ia_chamadas_30d)}</strong><small style={{ color: k.ia_erros_30d ? 'var(--orange)' : undefined }}>{k.ia_erros_30d} com erro</small></div>
            <div className="kpi" style={{ boxShadow: k.tickets_abertos ? 'inset 0 0 0 2px var(--orange)' : undefined }}><small>Chamados aguardando</small><strong>{fmt(k.tickets_abertos)}</strong><small>{k.tickets_abertos ? 'Veja em Suporte' : 'Nenhum pendente'}</small></div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Cadastros por dia (30 dias)</h3>
            {k.cadastros_por_dia.length ? (
              <div className="tabela-box" style={{ boxShadow: 'none' }}><table className="tabela"><thead><tr><th>Dia</th><th className="n">Cadastros</th></tr></thead>
                <tbody>{[...k.cadastros_por_dia].reverse().map(d => <tr key={d.dia}><td>{new Date(d.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td className="n">{d.n}</td></tr>)}</tbody></table></div>
            ) : <p className="muted small">Ainda sem cadastros nos últimos 30 dias.</p>}
          </div>
        </>
      )}
    </>
  )
}

// ---------------- A02 Usuários ----------------
type Usuario = { ref: string; email: string; criado_em: string; ultimo_acesso: string | null; dias_com_registro: number; tem_perfil: boolean; papel: string | null; tickets_abertos: number }
export function Usuarios() {
  const { papel } = usePapel()
  if (papel === 'admin') return <GerenciarUsuarios />
  return <UsuariosEquipe />
}

function UsuariosEquipe() {
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const { dados, erro } = useRpc<Usuario[]>('painel_usuarios', { busca: termo, limite: 100 }, [termo])
  return (
    <>
      <Cabecalho titulo="Usuários" texto="Contas com e-mail mascarado e um código de referência. Dá para buscar pelo e-mail completo ou pelo código, mas o painel nunca mostra diário, metas ou dados de saúde." />
      <form className="row" style={{ maxWidth: 520 }} onSubmit={e => { e.preventDefault(); setTermo(busca.trim()) }}>
        <input className="input grow" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por e-mail ou código" aria-label="Buscar usuário" />
        <button className="btn sm">Buscar</button>
      </form>
      <Erro m={erro} />
      <div className="tabela-box"><table className="tabela">
        <thead><tr><th>Código</th><th>E-mail</th><th>Cadastro</th><th>Último acesso</th><th className="n">Dias no diário</th><th>Situação</th></tr></thead>
        <tbody>{(dados ?? []).map(u => (
          <tr key={u.ref}><td className="num">{u.ref}</td><td>{u.email}</td><td>{quando(u.criado_em)}</td><td>{quando(u.ultimo_acesso)}</td><td className="n">{u.dias_com_registro}</td>
            <td className="row wrap" style={{ gap: 4 }}>{u.papel && <span className="tag">{u.papel}</span>}{u.tem_perfil ? <span className="tag gray">cadastro completo</span> : <span className="tag orange">sem cadastro</span>}{u.tickets_abertos > 0 && <span className="tag orange">{u.tickets_abertos} chamado(s)</span>}</td></tr>
        ))}</tbody>
      </table></div>
      {dados && !dados.length && <p className="muted small">Nenhuma conta encontrada.</p>}
    </>
  )
}

// ---------------- A08 Suporte ----------------
type TicketEquipe = { id: number; assunto: string; categoria: string; status: string; criado_em: string; atualizado_em: string; email: string; ref: string; mensagens: number; ultima: string }
export function SuporteEquipe() {
  const [filtro, setFiltro] = useState('abertos')
  const [aberto, setAberto] = useState<number | null>(null)
  const { dados, erro, recarregar } = useRpc<TicketEquipe[]>('painel_tickets', { filtro }, [filtro])
  if (aberto !== null) return <div className="card" style={{ maxWidth: 760 }}><Conversa id={aberto} equipe onVoltar={() => { setAberto(null); recarregar() }} /></div>
  return (
    <>
      <Cabecalho titulo="Suporte" texto="Chamados abertos pelas pessoas no app (Perfil → Ajuda e suporte). Ao responder, a pessoa vê a mensagem no app." acoes={<button className="btn ghost sm" onClick={recarregar}><RefreshCw size={16} /> Atualizar</button>} />
      <div className="segmented" style={{ maxWidth: 520 }}>{[['abertos', 'Em andamento'], ['aberto', 'Aguardando equipe'], ['fechado', 'Encerrados'], ['todos', 'Todos']].map(([v, n]) => <button key={v} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{n}</button>)}</div>
      <Erro m={erro} />
      <div className="tabela-box"><table className="tabela">
        <thead><tr><th>Assunto</th><th>Tipo</th><th>Pessoa</th><th>Situação</th><th>Atualizado</th><th></th></tr></thead>
        <tbody>{(dados ?? []).map(t => (
          <tr key={t.id}><td><b>{t.assunto}</b><div className="tiny">{t.ultima}</div></td><td>{CATEGORIAS[t.categoria]}</td><td>{t.email}<div className="tiny num">{t.ref}</div></td>
            <td><span className={`tag ${t.status === 'aberto' ? 'orange' : t.status === 'respondido' ? '' : 'gray'}`}>{STATUS[t.status]}</span></td><td>{quando(t.atualizado_em)}</td>
            <td><button className="btn sm" onClick={() => setAberto(t.id)}>Abrir</button></td></tr>
        ))}</tbody>
      </table></div>
      {dados && !dados.length && <p className="muted small">Nenhum chamado aqui.</p>}
    </>
  )
}

// ---------------- A09 Privacidade ----------------
type Priv = { com_termos: number; ia_sim: number; ia_nao: number; novidades_sim: number; novidades_nao: number; registros_consentimento: number; exclusoes_30d: number; exclusoes_total: number; tickets_privacidade: number }
export function Privacidade() {
  const { dados: p, erro } = useRpc<Priv>('painel_privacidade')
  return (
    <>
      <Cabecalho titulo="Privacidade (LGPD)" texto="Consentimentos registrados e exclusões de conta. Cada pessoa exclui a própria conta pelo app, e os dados somem na hora; aqui fica só a contagem, sem identificação." />
      <Erro m={erro} />
      {p && (
        <>
          <div className="kpis">
            <div className="kpi"><small>Aceitaram os termos</small><strong>{fmt(p.com_termos)}</strong></div>
            <div className="kpi"><small>Permitem IA (foto do prato)</small><strong>{fmt(p.ia_sim)}</strong><small>{fmt(p.ia_nao)} não permitem</small></div>
            <div className="kpi"><small>Aceitam novidades</small><strong>{fmt(p.novidades_sim)}</strong><small>{fmt(p.novidades_nao)} não aceitam</small></div>
            <div className="kpi"><small>Contas excluídas</small><strong>{fmt(p.exclusoes_total)}</strong><small>{fmt(p.exclusoes_30d)} nos últimos 30 dias</small></div>
            <div className="kpi" style={{ boxShadow: p.tickets_privacidade ? 'inset 0 0 0 2px var(--orange)' : undefined }}><small>Pedidos de privacidade abertos</small><strong>{fmt(p.tickets_privacidade)}</strong><small>chamados do tipo "Privacidade e dados"</small></div>
          </div>
          <div className="card small stack" style={{ gap: 8 }}>
            <h3>Como cada direito é atendido</h3>
            <p><b>Acesso e portabilidade:</b> a pessoa baixa todos os dados em Perfil → Privacidade → Baixar meus dados.</p>
            <p><b>Exclusão:</b> Perfil → Sua conta → Excluir conta apaga conta, perfil, diário, chamados e uso de IA na hora.</p>
            <p><b>Revogação:</b> as permissões de IA e novidades mudam a qualquer momento, e cada mudança fica registrada ({fmt(p.registros_consentimento)} registros).</p>
            <p><b>Prazo legal:</b> responda os chamados de privacidade em até 15 dias.</p>
          </div>
        </>
      )}
    </>
  )
}

// ---------------- A10 IA ----------------
type Ia = { por_provedor: { provedor: string; modelo: string; chamadas: number; erros: number; tokens_entrada: number; tokens_saida: number; ms_p50: number; ms_p95: number }[]; por_dia: { dia: string; ok: number; erro: number }[]; pessoas: number; ultimos_erros: { em: string; provedor: string; modelo: string; erro: string }[] }
// Preço público por milhão de tokens (US$); só modelos com preço conhecido entram na estimativa.
const PRECOS: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] }
export function IA() {
  const [dias, setDias] = useState(30)
  const { dados: d, erro } = useRpc<Ia>('painel_ia', { dias }, [dias])
  const custo = (d?.por_provedor ?? []).reduce((s, x) => { const p = PRECOS[x.modelo]; return p ? s + (x.tokens_entrada * p[0] + x.tokens_saida * p[1]) / 1e6 : s }, 0)
  const total = (d?.por_provedor ?? []).reduce((s, x) => s + x.chamadas, 0)
  const erros = (d?.por_provedor ?? []).reduce((s, x) => s + x.erros, 0)
  return (
    <>
      <Cabecalho titulo="Inteligência artificial" texto="Uso da foto do prato: chamadas, erros, tempo de resposta e custo estimado. A foto e o resultado não ficam guardados; só estes números." />
      <div className="segmented" style={{ maxWidth: 360 }}>{[1, 7, 30, 90].map(n => <button key={n} aria-pressed={dias === n} onClick={() => setDias(n)}>{n === 1 ? '24 h' : `${n} dias`}</button>)}</div>
      <Erro m={erro} />
      {d && (
        <>
          <div className="kpis">
            <div className="kpi"><small>Fotos analisadas</small><strong>{fmt(total)}</strong><small>por {fmt(d.pessoas)} pessoas</small></div>
            <div className="kpi"><small>Taxa de erro</small><strong>{total ? fmt((erros / total) * 100, 1) : 0}%</strong><small>{erros} erros</small></div>
            <div className="kpi"><small>Custo estimado (Claude)</small><strong>US$ {fmt(custo, 2)}</strong><small>pelo preço público por token</small></div>
          </div>
          <div className="tabela-box"><table className="tabela">
            <thead><tr><th>Provedor</th><th>Modelo</th><th className="n">Chamadas</th><th className="n">Erros</th><th className="n">Tokens (entrada / saída)</th><th className="n">Tempo típico</th><th className="n">95% abaixo de</th></tr></thead>
            <tbody>{d.por_provedor.map(x => (
              <tr key={x.provedor + x.modelo}><td>{x.provedor === 'claude' ? 'Claude (principal)' : 'Gemini (reserva)'}</td><td className="num">{x.modelo}</td><td className="n">{fmt(x.chamadas)}</td><td className="n">{x.erros}</td>
                <td className="n">{fmt(x.tokens_entrada)} / {fmt(x.tokens_saida)}</td><td className="n">{x.ms_p50 ? fmt(x.ms_p50 / 1000, 1) + ' s' : '—'}</td><td className="n">{x.ms_p95 ? fmt(x.ms_p95 / 1000, 1) + ' s' : '—'}</td></tr>
            ))}</tbody>
          </table></div>
          {!d.por_provedor.length && <p className="muted small">Nenhuma foto analisada no período.</p>}
          {d.ultimos_erros.length > 0 && (
            <div className="card"><h3 style={{ marginBottom: 8 }}>Últimos erros</h3>
              <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>{d.ultimos_erros.map((e, i) => <li key={i}><b>{quando(e.em)}</b> · {e.provedor}: <span className="muted">{e.erro}</span></li>)}</ul></div>
          )}
          <p className="tiny">Gemini: o custo aparece na fatura do Google Cloud. Quando o Claude falha, o Gemini assume e as duas tentativas aparecem aqui.</p>
        </>
      )}
    </>
  )
}

// ---------------- A13 Saúde do sistema ----------------
type Checagem = { nome: string; ok: boolean | null; detalhe: string }
export function Saude() {
  const [c, setC] = useState<Checagem[]>([])
  const rodar = async () => {
    const itens: Checagem[] = [
      { nome: 'Banco de dados (Supabase)', ok: null, detalhe: '' }, { nome: 'Função da foto do prato', ok: null, detalhe: '' },
      { nome: 'Base de alimentos', ok: null, detalhe: '' }, { nome: 'Open Food Facts (código de barras)', ok: null, detalhe: '' },
      { nome: 'IA nas últimas 24 horas', ok: null, detalhe: '' }, { nome: 'Modo offline (service worker)', ok: null, detalhe: '' },
    ]
    setC([...itens])
    const medir = async (i: number, f: () => Promise<[boolean, string]>) => {
      const t0 = performance.now()
      try { const [ok, det] = await f(); itens[i] = { ...itens[i], ok, detalhe: `${det} · ${Math.round(performance.now() - t0)} ms` } }
      catch (e) { itens[i] = { ...itens[i], ok: false, detalhe: (e as Error).message } }
      setC([...itens])
    }
    await Promise.all([
      medir(0, async () => { const { error } = await supabase!.from('conteudo').select('id').limit(1); return [!error, error ? error.message : 'respondendo'] }),
      medir(1, async () => {
        const r = await fetch('/api/analisar-prato', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        return r.status === 401 ? [true, 'no ar e protegida por login'] : r.status === 503 ? [false, 'no ar, mas sem chave de IA configurada'] : r.status === 404 ? [false, 'não encontrada (normal só em ambiente local, sem a Vercel)'] : [false, 'resposta inesperada ' + r.status]
      }),
      medir(2, async () => { const r = await fetch('/data/alimentos.json', { method: 'HEAD' }); const t = Number(r.headers.get('content-length') ?? 0); return [r.ok, r.ok ? (t ? `disponível · ${fmt(t / 1e6, 1)} MB` : 'disponível') : 'HTTP ' + r.status] }),
      medir(3, async () => { const r = await fetch('https://world.openfoodfacts.org/api/v2/product/7891000100103.json?fields=code'); return [r.ok, r.ok ? 'respondendo' : 'HTTP ' + r.status] }),
      medir(4, async () => {
        const { data, error } = await supabase!.rpc('painel_ia', { dias: 1 }); if (error) throw error
        const pp = (data as Ia).por_provedor; const t = pp.reduce((s, x) => s + x.chamadas, 0), e = pp.reduce((s, x) => s + x.erros, 0)
        return [t === 0 || e / t < 0.2, t ? `${t} chamadas, ${e} erros` : 'nenhuma chamada']
      }),
      medir(5, async () => { const reg = await navigator.serviceWorker?.getRegistration('/'); return [!!reg, reg ? 'ativo' : 'não registrado neste navegador'] }),
    ])
  }
  useEffect(() => { rodar() }, [])
  return (
    <>
      <Cabecalho titulo="Saúde do sistema" texto="Checagem rápida, feita agora a partir deste navegador, de cada parte de que o app depende." acoes={<button className="btn ghost sm" onClick={rodar}><RefreshCw size={16} /> Checar de novo</button>} />
      <div className="card list" style={{ padding: '0 18px', maxWidth: 760 }}>
        {c.map(x => (
          <div key={x.nome} className="item">
            {x.ok === null ? <RefreshCw size={20} className="muted" /> : x.ok ? <CheckCircle2 size={20} color="var(--green)" /> : <CircleAlert size={20} color="var(--orange)" />}
            <div className="grow"><b>{x.nome}</b><div className="tiny">{x.ok === null ? 'checando…' : x.detalhe}</div></div>
          </div>
        ))}
      </div>
      <p className="tiny">Logs detalhados da função ficam na Vercel (projeto papa-prato → Logs), e os do banco no Supabase.</p>
    </>
  )
}

// ---------------- A14 Equipe e segurança ----------------
type Membro = { tipo: 'membro' | 'convite'; email: string; papel: string; desde: string | null }
export function Equipe() {
  const sessao = useSessao()
  const { papel } = usePapel()
  const admin = papel === 'admin'
  const { dados, erro, recarregar } = useRpc<Membro[]>('equipe_listar')
  const [email, setEmail] = useState('')
  const [novoPapel, setNovoPapel] = useState<'editor' | 'admin'>('editor')
  const [senha, setSenha] = useState(''); const [senha2, setSenha2] = useState('')
  const convidar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const { data, error } = await supabase!.rpc('equipe_convidar', { email_convite: email.trim(), papel_convite: novoPapel })
    if (error) { avisar(error.message); return }
    avisar(data === 'membro' ? 'Pronto: a pessoa já tem acesso.' : 'Convite salvo: o acesso libera quando ela criar a conta com esse e-mail.')
    setEmail(''); recarregar()
  }
  const remover = async (e: string) => { const { error } = await supabase!.rpc('equipe_remover', { email_alvo: e }); avisar(error ? error.message : 'Acesso removido.'); recarregar() }
  const trocarSenha = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (senha.length < 8) { avisar('Use pelo menos 8 caracteres.'); return }
    if (senha !== senha2) { avisar('As senhas não são iguais.'); return }
    const { error } = await supabase!.auth.updateUser({ password: senha })
    avisar(error ? 'Não foi possível trocar: ' + error.message : 'Senha trocada.'); if (!error) { setSenha(''); setSenha2('') }
  }
  return (
    <>
      <Cabecalho titulo="Equipe e segurança" texto="Quem acessa o painel. Administradores mudam a equipe; editores cuidam de alimentos, conteúdo e suporte." />
      <Erro m={erro} />
      <div className="tabela-box"><table className="tabela">
        <thead><tr><th>E-mail</th><th>Papel</th><th>Situação</th><th>Desde</th><th></th></tr></thead>
        <tbody>{(dados ?? []).map(m => (
          <tr key={m.tipo + m.email}><td>{m.email.endsWith('@papaprato.invalid') ? `${m.email.split('@')[0]} (usuário interno)` : m.email}</td><td><span className="tag">{m.papel}</span></td>
            <td>{m.tipo === 'membro' ? 'Ativo' : <span className="tag orange">Convite pendente</span>}</td><td>{quando(m.desde)}</td>
            <td>{admin && m.email !== sessao?.user.email && <button className="icon-btn flat" aria-label={`Remover ${m.email}`} onClick={() => remover(m.email)}><Trash2 size={16} /></button>}</td></tr>
        ))}</tbody>
      </table></div>
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
        {admin && (
          <form className="card stack grow" style={{ minWidth: 300 }} onSubmit={convidar}>
            <h3 className="row" style={{ gap: 8 }}><UserPlus size={18} /> Convidar para a equipe</h3>
            <div className="field"><label htmlFor="eq-email">E-mail</label><input id="eq-email" className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@exemplo.com" /></div>
            <div className="segmented">{(['editor', 'admin'] as const).map(p => <button type="button" key={p} aria-pressed={novoPapel === p} onClick={() => setNovoPapel(p)}>{p === 'editor' ? 'Editor' : 'Administrador'}</button>)}</div>
            <button className="btn">Convidar</button>
            <p className="tiny">A pessoa entra no painel pelo link enviado ao e-mail.</p>
          </form>
        )}
        {sessao && (
          <form className="card stack grow" style={{ minWidth: 300 }} onSubmit={trocarSenha}>
            <h3>Trocar minha senha</h3>
            <p className="tiny">Conta: {sessao.user.email?.endsWith('@papaprato.invalid') ? sessao.user.email.split('@')[0] : sessao.user.email}</p>
            <div className="field"><label htmlFor="eq-s1">Nova senha</label><input id="eq-s1" className="input" type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} /></div>
            <div className="field"><label htmlFor="eq-s2">Repita a nova senha</label><input id="eq-s2" className="input" type="password" autoComplete="new-password" value={senha2} onChange={e => setSenha2(e.target.value)} /></div>
            <button className="btn" disabled={!senha}>Trocar senha</button>
            <button type="button" className="btn ghost" onClick={async () => { const { error } = await supabase!.auth.signOut({ scope: 'others' }); avisar(error ? 'Não foi possível agora.' : 'Sua conta saiu de todos os outros aparelhos.') }}>Sair dos outros aparelhos</button>
          </form>
        )}
      </div>
    </>
  )
}
