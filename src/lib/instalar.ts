import { useEffect, useState } from 'react'

// Instalação como app (PWA). No Android/Chrome o navegador oferece o evento beforeinstallprompt;
// no iPhone/iPad (Safari) a instalação é manual: Compartilhar → Adicionar à Tela de Início.
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let evento: EventoInstalar | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach(f => f())

export function iniciarInstalacao() {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); evento = e as EventoInstalar; avisar() })
  addEventListener('appinstalled', () => { evento = null; avisar() })
}

export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const jaInstalado = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export function useInstalacao() {
  const [, forcar] = useState(0)
  useEffect(() => { const f = () => forcar(x => x + 1); ouvintes.add(f); return () => { ouvintes.delete(f) } }, [])
  const instalado = jaInstalado()
  const ios = ehIOS()
  return {
    instalado,
    ios,
    // Pode oferecer o botão: Android com o evento disponível, ou iPhone (instruções).
    disponivel: !instalado && (!!evento || ios),
    async instalar(): Promise<'instalado' | 'recusado' | 'instrucoes'> {
      if (ios || !evento) return 'instrucoes'
      await evento.prompt()
      const { outcome } = await evento.userChoice
      evento = null; avisar()
      return outcome === 'accepted' ? 'instalado' : 'recusado'
    },
  }
}
