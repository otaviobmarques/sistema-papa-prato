// Função da Vercel: o administrador exclui uma conta. Antes de apagar, cancela no Asaas as assinaturas
// (de paciente e de profissional) para a pessoa não continuar sendo cobrada. Quem confere se é admin é o banco.

const json = (status: number, corpo: unknown) => Response.json(corpo, { status })

async function rpc<T>(nome: string, token: string, corpo: unknown): Promise<T> {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST', body: JSON.stringify(corpo),
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw Object.assign(new Error((d as { message?: string })?.message ?? `banco respondeu ${r.status}`), { status: r.status })
  return d as T
}

async function cancelarNoAsaas(ambiente: string | null, assinatura: string) {
  const prod = ambiente === 'producao'
  const chave = prod ? process.env.ASAAS_API_KEY : process.env.ASAAS_API_KEY_SANDBOX
  if (!chave) throw new Error(`sem chave do Asaas para ${prod ? 'produção' : 'sandbox'}`)
  const r = await fetch(`${prod ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'}/subscriptions/${encodeURIComponent(assinatura)}`, {
    method: 'DELETE', headers: { access_token: chave, 'user-agent': 'papa-prato' },
  })
  if (!r.ok && r.status !== 404) throw new Error(`Asaas respondeu ${r.status} ao cancelar a assinatura`)
}

type Cobranca = { assinatura: string | null; status: string | null; ambiente: string | null } | null

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return json(503, { erro: 'Servidor sem configuração.' })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { erro: 'Entre como administrador.' })
  let corpo: { acao?: string; usuario?: string }
  try { corpo = await req.json() } catch { return json(400, { erro: 'Pedido inválido.' }) }
  if (corpo.acao !== 'excluir' || !/^[0-9a-f-]{36}$/.test(corpo.usuario ?? '')) return json(400, { erro: 'Pedido inválido.' })

  try {
    const c = await rpc<{ paciente: Cobranca; profissional: Cobranca }>('admin_cobrancas_do_usuario', token, { usuario: corpo.usuario })
    for (const a of [c.paciente, c.profissional]) {
      if (a?.assinatura && a.status !== 'cancelada') await cancelarNoAsaas(a.ambiente, a.assinatura)
    }
    await rpc('admin_excluir_usuario', token, { usuario: corpo.usuario })
    return json(200, { ok: true })
  } catch (e) {
    const status = (e as { status?: number }).status
    return json(status === 401 || status === 403 ? 403 : 400, { erro: (e as Error).message })
  }
}
