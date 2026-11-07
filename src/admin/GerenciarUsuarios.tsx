import { useEffect, useState } from 'react'
import { Ban, KeyRound, Plus, RefreshCw, Trash2, Unlock, UserPlus, CalendarCheck } from 'lucide-react'
import { Folha, avisar } from '../components/ui'
import { supabase, useSessao } from '../lib/supabase'
import { Cabecalho } from './Modulos'

// Gestão de usuários (só administradores): cadastrar com senha, trocar senha, bloquear, dar acesso e excluir.
type U = { id: string; email: string; criado_em: string; ultimo_acesso: string | null; bloqueado: boolean; papel: string | null; assinatura: string | null; pago_ate: string | null; profissional: string | null; dias_com_registro: number }
const quando = (d?: string | null) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const data = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const hojeMais = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10) }
function gerarSenha() {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), n => c[n % c.length]).join('')
}
const emDia = (u: U) => !!u.pago_ate && new Date(u.pago_ate) > new Date()

export function GerenciarUsuarios() {
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<U[] | null>(null)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(false)
  const [aberto, setAberto] = useState<U | null>(null)
  const carregar = () => supabase!.rpc('admin_listar_usuarios', { busca: termo, limite: 200 }).then(({ data, error }) => { setErro(error?.message ?? ''); setLista((data as U[]) ?? []) })
  useEffect(() => { carregar() }, [termo])

  return (
    <>
      <Cabecalho titulo="Usuários" texto="Como administrador, você cadastra contas com senha, troca senhas, bloqueia, dá acesso sem assinatura e exclui. O painel nunca mostra diário nem dados de saúde."
        acoes={<div className="row" style={{ gap: 8 }}><button className="btn ghost sm" onClick={carregar}><RefreshCw size={16} /> Atualizar</button><button className="btn sm" onClick={() => setNovo(true)}><Plus size={16} /> Novo usuário</button></div>} />
      <form className="row" style={{ maxWidth: 520 }} onSubmit={e => { e.preventDefault(); setTermo(busca.trim()) }}>
        <input className="input grow" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por e-mail" aria-label="Buscar usuário" />
        <button className="btn sm">Buscar</button>
      </form>
      {erro && <div className="card peach small">{erro}</div>}
      <div className="tabela-box"><table className="tabela">
        <thead><tr><th>E-mail</th><th>Cadastro</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead>
        <tbody>{(lista ?? []).map(u => (
          <tr key={u.id} style={{ opacity: u.bloqueado ? 0.6 : 1 }}>
            <td>{u.email}</td><td className="small">{data(u.criado_em)}</td><td className="small">{quando(u.ultimo_acesso)}</td>
            <td><div className="row wrap" style={{ gap: 4 }}>
              {u.bloqueado && <span className="tag orange">bloqueado</span>}
              {u.papel && <span className="tag">{u.papel}</span>}
              {u.papel ? <span className="tag gray">acesso da equipe</span> : emDia(u) ? <span className="tag">acesso até {data(u.pago_ate)}</span> : u.assinatura ? <span className="tag gray">assinatura {u.assinatura}</span> : <span className="tag gray">sem assinatura</span>}
              {u.profissional && <span className="tag gray">nutricionista {u.profissional}</span>}
            </div></td>
            <td><button className="btn ghost sm" onClick={() => setAberto(u)}>Gerenciar</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      {lista && !lista.length && <p className="muted small">Nenhuma conta encontrada.</p>}
      <NovoUsuario aberta={novo} onFechar={() => setNovo(false)} onCriado={() => { setNovo(false); carregar() }} />
      {aberto && <Acoes u={aberto} onFechar={() => setAberto(null)} onMudou={() => { setAberto(null); carregar() }} />}
    </>
  )
}

function NovoUsuario({ aberta, onFechar, onCriado }: { aberta: boolean; onFechar: () => void; onCriado: () => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState(gerarSenha())
  const [cortesia, setCortesia] = useState(false)
  const [ate, setAte] = useState(hojeMais(30))
  const [ocupado, setOcupado] = useState(false)
  const [criado, setCriado] = useState<{ email: string; senha: string } | null>(null)
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true)
    const { error } = await supabase!.rpc('admin_criar_usuario', { email, senha, acesso_ate: cortesia ? ate : null })
    setOcupado(false)
    if (error) avisar(error.message); else setCriado({ email: email.trim().toLowerCase(), senha })
  }
  const fechar = () => { const ok = !!criado; setCriado(null); setEmail(''); setSenha(gerarSenha()); setCortesia(false); ok ? onCriado() : onFechar() }
  return (
    <Folha aberta={aberta} onFechar={fechar} titulo="Novo usuário">
      {criado ? (
        <div className="stack">
          <p>Conta criada. Passe estes dados para a pessoa (a senha não aparece de novo):</p>
          <div className="card soft stack" style={{ gap: 4 }}><div>E-mail: <b>{criado.email}</b></div><div>Senha: <b className="num">{criado.senha}</b></div></div>
          <button className="btn ghost block" onClick={() => { navigator.clipboard?.writeText(`Papa Prato\nE-mail: ${criado.email}\nSenha: ${criado.senha}\nEntre em https://papaprato.com.br/app/`); avisar('Copiado.') }}>Copiar dados de acesso</button>
          <p className="tiny">Ela entra em papaprato.com.br/app → "Tenho senha: entrar com e-mail e senha" (ou pelo link no e-mail, se preferir).</p>
          <button className="btn block" onClick={fechar}>Concluir</button>
        </div>
      ) : (
        <form className="stack" onSubmit={salvar}>
          <div className="field"><label htmlFor="nu-email">E-mail</label><input id="nu-email" className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="nu-senha">Senha (mínimo 8 caracteres)</label>
            <div className="row" style={{ gap: 8 }}><input id="nu-senha" className="input grow num" required minLength={8} value={senha} onChange={e => setSenha(e.target.value)} /><button type="button" className="btn ghost sm" onClick={() => setSenha(gerarSenha())}>Gerar</button></div></div>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={cortesia} onChange={e => setCortesia(e.target.checked)} /> Dar acesso sem assinatura (cortesia, parceria)</label>
          {cortesia && <div className="field"><label htmlFor="nu-ate">Acesso até</label><input id="nu-ate" type="date" className="input" min={hojeMais(0)} value={ate} onChange={e => setAte(e.target.value)} /></div>}
          <button className="btn block" disabled={ocupado}><UserPlus size={18} /> {ocupado ? 'Criando…' : 'Criar conta'}</button>
        </form>
      )}
    </Folha>
  )
}

function Acoes({ u, onFechar, onMudou }: { u: U; onFechar: () => void; onMudou: () => void }) {
  const sessao = useSessao()
  const euMesmo = sessao?.user.id === u.id
  const [senha, setSenha] = useState('')
  const [ate, setAte] = useState(hojeMais(30))
  const [confirmar, setConfirmar] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const rodar = async (f: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setOcupado(true); const { error } = await f(); setOcupado(false)
    if (error) avisar(error.message); else { avisar(ok); onMudou() }
  }
  const excluir = async () => {
    setOcupado(true)
    const { data } = await supabase!.auth.getSession()
    const r = await fetch('/api/admin-usuarios', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ acao: 'excluir', usuario: u.id }) })
    const res = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) avisar(res.erro || 'Não foi possível excluir.'); else { avisar('Conta excluída.'); onMudou() }
  }
  return (
    <Folha aberta onFechar={onFechar} titulo={u.email}>
      <div className="stack">
        <div className="small muted">Cadastro {data(u.criado_em)} · último acesso {quando(u.ultimo_acesso)} · {u.dias_com_registro} dias no diário</div>

        <div className="card stack">
          <h3 className="row" style={{ gap: 8 }}><KeyRound size={18} /> Trocar senha</h3>
          <div className="row" style={{ gap: 8 }}><input className="input grow num" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Nova senha (mín. 8)" aria-label="Nova senha" /><button type="button" className="btn ghost sm" onClick={() => setSenha(gerarSenha())}>Gerar</button></div>
          <button className="btn sm" disabled={ocupado || senha.length < 8} onClick={() => rodar(() => supabase!.rpc('admin_definir_senha', { usuario: u.id, senha }), 'Senha trocada. Passe a nova senha para a pessoa.')}>Salvar senha</button>
          <p className="tiny">A pessoa sai dos outros aparelhos e entra de novo com a senha nova.</p>
        </div>

        <div className="card stack">
          <h3 className="row" style={{ gap: 8 }}><CalendarCheck size={18} /> Acesso sem assinatura</h3>
          <p className="small">{emDia(u) ? `Hoje tem acesso até ${data(u.pago_ate)}.` : 'Hoje não tem acesso liberado.'}</p>
          <div className="row" style={{ gap: 8 }}><input type="date" className="input" min={hojeMais(0)} value={ate} onChange={e => setAte(e.target.value)} aria-label="Acesso até" />
            <button className="btn sm" disabled={ocupado} onClick={() => rodar(() => supabase!.rpc('admin_dar_acesso', { usuario: u.id, ate }), 'Acesso liberado.')}>Liberar até essa data</button></div>
          {emDia(u) && <button className="link small" style={{ alignSelf: 'flex-start' }} disabled={ocupado} onClick={() => rodar(() => supabase!.rpc('admin_dar_acesso', { usuario: u.id, ate: null }), 'Cortesia removida.')}>Tirar acesso de cortesia</button>}
          <p className="tiny">Não mexe em assinaturas pagas pelo Asaas.</p>
        </div>

        {!euMesmo && (
          <div className="card stack">
            <h3 className="row" style={{ gap: 8 }}>{u.bloqueado ? <Unlock size={18} /> : <Ban size={18} />} {u.bloqueado ? 'Desbloquear' : 'Bloquear'}</h3>
            <p className="small">{u.bloqueado ? 'A pessoa volta a conseguir entrar.' : 'A pessoa sai de todos os aparelhos e não consegue mais entrar. Os dados ficam guardados e a cobrança no Asaas não é cancelada.'}</p>
            <button className={u.bloqueado ? 'btn sm' : 'btn danger sm'} disabled={ocupado} onClick={() => rodar(() => supabase!.rpc('admin_bloquear_usuario', { usuario: u.id, bloquear: !u.bloqueado }), u.bloqueado ? 'Conta desbloqueada.' : 'Conta bloqueada.')}>{u.bloqueado ? 'Desbloquear conta' : 'Bloquear conta'}</button>
          </div>
        )}

        {!euMesmo && u.papel !== 'admin' && (
          <div className="card stack" style={{ boxShadow: 'inset 0 0 0 1.5px var(--red)' }}>
            <h3 className="row" style={{ gap: 8 }}><Trash2 size={18} /> Excluir conta</h3>
            <p className="small">Apaga a conta e todos os dados (diário, perfil, conversas). As assinaturas no Asaas são canceladas antes. <b>Não dá para desfazer.</b></p>
            <div className="field"><label htmlFor="ex-conf">Digite o e-mail para confirmar</label><input id="ex-conf" className="input" value={confirmar} onChange={e => setConfirmar(e.target.value)} placeholder={u.email} /></div>
            <button className="btn danger sm" disabled={ocupado || confirmar.trim().toLowerCase() !== u.email.toLowerCase()} onClick={excluir}>Excluir definitivamente</button>
          </div>
        )}
      </div>
    </Folha>
  )
}
