// Função da Vercel: recebe os avisos do Asaas (cobranças e assinaturas) e guarda cada evento no banco.
// Configuração no Asaas: Integrações → Webhooks, URL https://<site>/api/asaas-webhook,
// com o token que o Asaas gerou: produção em ASAAS_WEBHOOK_TOKEN e sandbox em ASAAS_WEBHOOK_TOKEN_SANDBOX
// (variáveis da Vercel). O Asaas manda o token no cabeçalho asaas-access-token; sem ele (ou com outro), recusa.
// O banco confere o token de novo (pelo hash) e ignora eventos repetidos, então reenvios são seguros.
import { timingSafeEqual } from 'node:crypto'

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
const json = (corpo: unknown, status = 200) => Response.json(corpo, { status })

export async function POST(req: Request) {
  const aceitos = [process.env.ASAAS_WEBHOOK_TOKEN, process.env.ASAAS_WEBHOOK_TOKEN_SANDBOX].filter((t): t is string => !!t)
  const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!aceitos.length || !url || !chave) return json({ erro: 'webhook não configurado' }, 503)

  const token = req.headers.get('asaas-access-token') ?? ''
  if (!aceitos.some(t => iguais(token, t))) return json({ erro: 'token inválido' }, 401)

  let evento: unknown
  try { evento = await req.json() } catch { return json({ erro: 'corpo inválido' }, 400) }
  if (!evento || typeof evento !== 'object' || Array.isArray(evento)) return json({ erro: 'corpo inválido' }, 400)

  const r = await fetch(`${url}/rest/v1/rpc/registrar_evento_asaas`, {
    method: 'POST',
    headers: { apikey: chave, authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ token, evento }),
  }).catch(() => null)
  // Se o banco falhar, respondemos erro: o Asaas tenta de novo mais tarde.
  if (!r?.ok) {
    console.error('asaas-webhook: falha ao gravar', r?.status, await r?.text().catch(() => ''))
    return json({ erro: 'falha ao gravar' }, 502)
  }
  return json({ recebido: true })
}

export function GET() { return json({ ok: true, info: 'Webhook do Asaas do Papa Prato. Use POST.' }) }
