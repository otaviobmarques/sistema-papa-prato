import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { iniciarSincronizacao } from './lib/sync'

iniciarSincronizacao()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// Funciona offline depois da primeira visita (apenas quando servido por http/https próprio).
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai') && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
