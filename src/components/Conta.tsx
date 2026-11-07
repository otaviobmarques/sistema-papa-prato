import { useEffect, useState } from 'react'
import { Cloud, CloudOff, LogOut, Mail, RefreshCw, Trash2 } from 'lucide-react'
import { Folha, avisar } from './ui'
import { enviarLinkDeAcesso, supabase, useSessao } from '../lib/supabase'
import { aoMudarSituacao, apagarConta, obterSituacao, sairDaConta, sincronizar } from '../lib/sync'
import { apagarTudo } from '../lib/store'

export const contasDisponiveis = !!supabase

export function FormularioLink({ destino = '', textoBotao = 'Enviar link de acesso', aoEnviar }: { destino?: string; textoBotao?: string; aoEnviar?: () => void }) {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'pronto' | 'enviando' | 'enviado'>('pronto')
  const [erro, setErro] = useState('')
  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault(); setErro(''); setEstado('enviando')
    try { aoEnviar?.(); await enviarLinkDeAcesso(email, destino); setEstado('enviado') }
    catch (e) { setErro((e as Error).message); setEstado('pronto') }
  }
  if (estado === 'enviado') return (
    <div className="card soft stack" style={{ gap: 6 }}>
      <b className="row" style={{ gap: 6 }}><Mail size={18} /> Confira seu e-mail</b>
      <p className="small">Enviamos um link para <b>{email}</b>. Abra o link neste aparelho para entrar. Pode levar um minuto; olhe também o spam.</p>
      <button className="link" onClick={() => setEstado('pronto')}>Usar outro e-mail</button>
    </div>
  )
  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={enviar}>
      <div className="field"><label htmlFor="email-conta">E-mail</label>
        <input id="email-conta" className="input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" /></div>
      {erro && <p className="small" style={{ color: 'var(--red)' }}>{erro}</p>}
      <button className="btn block" disabled={estado === 'enviando'}>{estado === 'enviando' ? 'Enviando…' : textoBotao}</button>
      <p className="tiny">Sem senha: você entra pelo link que chega no e-mail.</p>
    </form>
  )
}

function useSituacao() {
  const [s, setS] = useState(obterSituacao())
  useEffect(() => aoMudarSituacao(setS), [])
  return s
}

export function CartaoConta() {
  const sessao = useSessao()
  const sit = useSituacao()
  const [excluir, setExcluir] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  if (!contasDisponiveis) return null

  if (!sessao) return (
    <div className="card stack">
      <h3 className="row" style={{ gap: 8 }}><CloudOff size={18} /> Sua conta</h3>
      <p className="small muted">Crie uma conta grátis para guardar seu diário na nuvem, usar em mais de um aparelho e liberar a foto do prato com IA.</p>
      <FormularioLink textoBotao="Criar conta ou entrar" />
    </div>
  )

  const quando = sit.em ? new Date(sit.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className="card stack">
      <h3 className="row" style={{ gap: 8 }}><Cloud size={18} color="var(--green)" /> Sua conta</h3>
      <p className="small"><b>{sessao.user.email}</b></p>
      <p className="tiny">
        {sit.estado === 'sincronizando' && 'Sincronizando…'}
        {sit.estado === 'ok' && `Tudo salvo na nuvem${quando ? ` às ${quando}` : ''}.`}
        {sit.estado === 'erro' && <span style={{ color: 'var(--red)' }}>Não foi possível sincronizar agora. Seus dados continuam salvos no aparelho.</span>}
        {sit.estado === 'desligado' && 'Conectando…'}
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={() => sincronizar()}><RefreshCw size={16} /> Sincronizar agora</button>
        <button className="btn ghost sm" disabled={ocupado} onClick={async () => { setOcupado(true); await sairDaConta(); apagarTudo(); setOcupado(false) }}><LogOut size={16} /> Sair</button>
        <button className="btn danger sm" onClick={() => setExcluir(true)}><Trash2 size={16} /> Excluir conta</button>
      </div>
      <p className="tiny">Ao sair, os dados deste aparelho são apagados; eles continuam na sua conta.</p>

      <Folha aberta={excluir} onFechar={() => setExcluir(false)} titulo="Excluir sua conta?">
        <div className="stack">
          <p className="muted">Isso apaga para sempre sua conta, seu perfil, diário e histórico, na nuvem e neste aparelho. Não dá para desfazer.</p>
          <button className="btn danger block" disabled={ocupado} onClick={async () => {
            setOcupado(true)
            try { await apagarConta(); apagarTudo(); avisar('Conta excluída.') }
            catch (e) { avisar('Não foi possível excluir agora: ' + (e as Error).message) }
            setOcupado(false); setExcluir(false)
          }}>Sim, excluir minha conta</button>
          <button className="btn ghost block" onClick={() => setExcluir(false)}>Cancelar</button>
        </div>
      </Folha>
    </div>
  )
}
