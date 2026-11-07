import { supabase } from './supabase'

export type ItemFoto = { nome: string; busca: string; gramas: number; confianca: 'alta' | 'media' | 'baixa' }
export type ResultadoFoto = { e_comida: boolean; itens: ItemFoto[]; observacao: string }

// Reduz a foto para no máximo 1024 px antes de enviar (mais rápido e gasta menos dados).
export async function prepararFoto(arquivo: File): Promise<{ base64: string; url: string }> {
  const bmp = await createImageBitmap(arquivo)
  const escala = Math.min(1, 1024 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const url = c.toDataURL('image/jpeg', 0.82)
  return { base64: url.split(',')[1], url }
}

export async function analisarFoto(base64: string): Promise<ResultadoFoto> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token
  if (!token) throw new Error('Entre na sua conta para usar a foto do prato.')
  let r: Response
  try {
    r = await fetch('/api/analisar-prato', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ imagem: base64, tipo: 'image/jpeg' }) })
  } catch { throw new Error('Sem conexão. Verifique a internet e tente de novo.') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || 'A análise não funcionou agora. Tente de novo.')
  return j as ResultadoFoto
}
