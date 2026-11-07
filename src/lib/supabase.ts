import { createClient, type Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Sem as variáveis, o app funciona só no aparelho (como na versão 0.1).
export const supabase = url && chave
  ? createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'papa-prato:sessao' } })
  : null

let sessaoAtual: Session | null = null
const ouvintes = new Set<(s: Session | null) => void>()
if (supabase) {
  supabase.auth.getSession().then(({ data }) => { sessaoAtual = data.session; ouvintes.forEach(f => f(sessaoAtual)) })
  supabase.auth.onAuthStateChange((_ev, s) => { sessaoAtual = s; ouvintes.forEach(f => f(s)) })
}
export const obterSessao = () => sessaoAtual
export function aoMudarSessao(f: (s: Session | null) => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }

export function useSessao() {
  const [s, setS] = useState<Session | null>(sessaoAtual)
  useEffect(() => aoMudarSessao(setS), [])
  return s
}

export async function enviarLinkDeAcesso(email: string, destino = '') {
  if (!supabase) throw new Error('Contas ainda não estão disponíveis.')
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: location.origin + location.pathname + destino },
  })
  if (error) throw new Error(traduzirErro(error.message))
}

export function traduzirErro(m: string) {
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Esse e-mail não parece válido. Confira e tente de novo.'
  if (/network|fetch/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.'
  return m
}
