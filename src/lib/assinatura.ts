import { useEffect, useState } from 'react'
import { supabase, useSessao } from './supabase'

// O Papa Prato é só pago. Quem decide se o acesso está liberado é o banco (meu_acesso), com base no
// pagamento confirmado pelo Asaas. Guardamos a última resposta para o app abrir sem internet.

export type Acesso = {
  liberado: boolean; equipe: boolean; status: 'pendente' | 'ativa' | 'atrasada' | 'cancelada' | null
  plano_id: string | null; plano_nome: string | null; meses: number | null; preco: number | null
  pago_ate: string | null; link_pagamento: string | null; ambiente: 'sandbox' | 'producao' | null
}
export type PlanoVenda = { id: string; nome: string; preco: number; meses: number; descricao: string; destaque: boolean }
type Estado = { carregando: boolean; acesso: Acesso | null; erro: string; recarregar: () => void }

const CHAVE = 'papa-prato:acesso'
const lerCache = (): Acesso | null => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') } catch { return null } }
const ouvintes = new Set<() => void>()
export const conferirAcessoDeNovo = () => ouvintes.forEach(f => f())

export function useAcesso(): Estado {
  const sessao = useSessao()
  const [acesso, setAcesso] = useState<Acesso | null>(() => sessao ? lerCache() : null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [n, setN] = useState(0)

  useEffect(() => { const f = () => setN(x => x + 1); ouvintes.add(f); return () => { ouvintes.delete(f) } }, [])
  // Ao voltar da página de pagamento, confere de novo.
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') setN(x => x + 1) }
    document.addEventListener('visibilitychange', f); addEventListener('focus', f)
    return () => { document.removeEventListener('visibilitychange', f); removeEventListener('focus', f) }
  }, [])

  useEffect(() => {
    if (!supabase || !sessao) { setAcesso(null); setCarregando(false); return }
    let vivo = true
    supabase.rpc('meu_acesso').then(({ data, error }) => {
      if (!vivo) return
      if (error) {
        // Sem internet: vale o que estava guardado, se o período pago ainda não acabou.
        const c = lerCache()
        setAcesso(c && (c.equipe || (c.pago_ate && new Date(c.pago_ate) > new Date())) ? c : null)
        setErro(error.message)
      } else {
        setAcesso(data as Acesso); setErro('')
        try { localStorage.setItem(CHAVE, JSON.stringify(data)) } catch { /* ok */ }
      }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [sessao?.user.id, n])

  // Enquanto espera a confirmação do pagamento, pergunta de novo a cada 8 segundos.
  useEffect(() => {
    if (!acesso || acesso.liberado || !acesso.link_pagamento) return
    const t = setInterval(() => setN(x => x + 1), 8000)
    return () => clearInterval(t)
  }, [acesso?.liberado, acesso?.link_pagamento])

  return { carregando: carregando && !acesso, acesso, erro, recarregar: () => setN(x => x + 1) }
}

export async function carregarPlanos(): Promise<PlanoVenda[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('planos').select('id,nome,preco,meses,descricao,destaque').eq('ativo', true).order('ordem')
  if (error) throw error
  return (data ?? []).map(p => ({ ...p, preco: Number(p.preco) })) as PlanoVenda[]
}

async function chamar(corpo: Record<string, unknown>) {
  const { data } = await supabase!.auth.getSession()
  const r = await fetch('/api/assinatura', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(corpo),
  })
  const res = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }))
  if (!r.ok) throw new Error(res.erro || `Erro ${r.status}`)
  return res
}
export const assinar = (plano_id: string, nome: string, cpf: string): Promise<{ link: string | null; vencimento: string }> => chamar({ acao: 'assinar', plano_id, nome, cpf })
export const cancelarAssinatura = (): Promise<{ ok: true; pago_ate: string | null }> => chamar({ acao: 'cancelar' })

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dataCurta = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
export const formatarCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
