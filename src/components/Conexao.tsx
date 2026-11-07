import { useEffect, useState } from 'react'
import { CloudOff } from 'lucide-react'
import { avisar } from './ui'
import { pendentes } from '../lib/sync'
import { obterSessao } from '../lib/supabase'
import { aoMudar } from '../lib/store'

// T35: aviso de "sem conexão" com o que falta sincronizar. O app continua funcionando normalmente.
export function AvisoConexao() {
  const [online, setOnline] = useState(navigator.onLine)
  const [n, setN] = useState(0)
  useEffect(() => {
    const on = () => { setOnline(true); if (obterSessao() && pendentes() > 0) avisar('Conexão de volta: sincronizando suas alterações.') }
    const off = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', off)
    const tira = aoMudar(() => setN(pendentes()))
    setN(pendentes())
    return () => { removeEventListener('online', on); removeEventListener('offline', off); tira() }
  }, [])
  if (online) return null
  return (
    <div role="status" className="row" style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 30, background: 'var(--brand)', color: 'var(--bg)', borderRadius: 14, padding: '10px 14px', gap: 10, fontSize: '.85rem', marginBottom: 8 }}>
      <CloudOff size={18} style={{ flex: 'none' }} />
      <span>Você está sem internet. Pode continuar usando: tudo fica salvo aqui{obterSessao() && n > 0 ? ` e ${n} ${n === 1 ? 'alteração será enviada' : 'alterações serão enviadas'} quando a conexão voltar` : ''}.</span>
    </div>
  )
}
