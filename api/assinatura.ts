// Função da Vercel: cria e cancela a assinatura do Papa Prato no Asaas.
// O pagamento (Pix, cartão ou boleto) acontece na página segura do Asaas; o app nunca vê dados de cartão.
// Quem libera o acesso é o webhook (/api/asaas-webhook) quando o Asaas confirma o pagamento.
//
// Variáveis na Vercel: ASAAS_AMBIENTE (sandbox | producao), ASAAS_API_KEY_SANDBOX, ASAAS_API_KEY,
// ASAAS_WEBHOOK_TOKEN (também prova ao banco que o pedido vem deste servidor), SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.

type Acesso = {
  liberado: boolean; equipe: boolean; status: string | null; plano_id: string | null; pago_ate: string | null
  link_pagamento: string | null; ambiente: string | null; asaas_cliente_id: string | null; asaas_assinatura_id: string | null
}
type Plano = { id: string; nome: string; preco: number; meses: number; ativo: boolean }

const json = (status: number, corpo: unknown) => Response.json(corpo, { status })
const CICLO: Record<number, string> = { 1: 'MONTHLY', 3: 'QUARTERLY', 6: 'SEMIANNUALLY', 12: 'YEARLY' }
const pedidos = new Map<string, number[]>()

export function cpfValido(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}
const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

function asaas() {
  const amb = process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox'
  const chave = amb === 'producao' ? process.env.ASAAS_API_KEY : process.env.ASAAS_API_KEY_SANDBOX
  const base = amb === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
  const chamar = async <T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { access_token: chave ?? '', 'content-type': 'application/json', 'user-agent': 'papa-prato' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const dados = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = (dados as { errors?: { description?: string }[] }).errors?.map(e => e.description).join(' ') || `Asaas respondeu ${r.status}`
      throw Object.assign(new Error(msg), { status: r.status })
    }
    return dados as T
  }
  return { amb, configurado: !!chave, chamar }
}

async function supa<T>(caminho: string, token: string, corpo?: unknown): Promise<T> {
  const url = process.env.SUPABASE_URL!, chave = process.env.SUPABASE_PUBLISHABLE_KEY!
  const r = await fetch(url + caminho, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { apikey: chave, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error(`banco respondeu ${r.status}: ${await r.text().catch(() => '')}`)
  return r.json() as Promise<T>
}

const salvar = (usuario: string, dados: Record<string, unknown>, prof = false) =>
  supa(`/rest/v1/rpc/${prof ? 'servidor_salvar_assinatura_prof' : 'servidor_salvar_assinatura'}`, process.env.SUPABASE_PUBLISHABLE_KEY!, { token: process.env.ASAAS_WEBHOOK_TOKEN, usuario, dados })

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.ASAAS_WEBHOOK_TOKEN) return json(503, { erro: 'Pagamentos ainda não configurados.' })
  const api = asaas()
  if (!api.configurado) return json(503, { erro: 'Pagamentos ainda não configurados (falta a chave do Asaas).' })

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const usuario = token ? await supa<{ id?: string; email?: string }>('/auth/v1/user', token).catch(() => null) : null
  if (!usuario?.id) return json(401, { erro: 'Entre na sua conta para assinar.' })
  const uid = usuario.id

  const agora = Date.now(), recentes = (pedidos.get(uid) ?? []).filter(t => agora - t < 600_000)
  if (recentes.length >= 10) return json(429, { erro: 'Muitas tentativas. Espere alguns minutos.' })
  pedidos.set(uid, [...recentes, agora])

  let corpo: { acao?: string; plano_id?: string; nome?: string; cpf?: string; publico?: string }
  try { corpo = await req.json() } catch { return json(400, { erro: 'Pedido inválido.' }) }

  try {
    // Profissional (nutricionista) tem assinatura própria; no Asaas a referência é 'prof:<id>'.
    const prof = corpo.publico === 'profissional'
    const ref = prof ? `prof:${uid}` : uid
    const acesso = await supa<Acesso | null>(prof ? '/rest/v1/rpc/meu_acesso_prof' : '/rest/v1/rpc/meu_acesso', token, {})

    if (corpo.acao === 'cancelar') {
      if (!acesso?.asaas_assinatura_id || acesso.status === 'cancelada') return json(400, { erro: 'Você não tem uma assinatura ativa para cancelar.' })
      await api.chamar('DELETE', `/subscriptions/${encodeURIComponent(acesso.asaas_assinatura_id)}`).catch(e => { if (e.status !== 404) throw e })
      await salvar(uid, { status: 'cancelada', link_pagamento: null, ambiente: acesso.ambiente ?? api.amb }, prof)
      return json(200, { ok: true, pago_ate: acesso.pago_ate })
    }

    if (corpo.acao !== 'assinar') return json(400, { erro: 'Ação desconhecida.' })
    if (acesso?.status === 'ativa' || acesso?.status === 'atrasada') {
      if (acesso.status === 'atrasada' && acesso.link_pagamento) return json(200, { link: acesso.link_pagamento })
      return json(409, { erro: 'Você já tem uma assinatura ativa. Para trocar de plano, cancele no Perfil e assine o novo.' })
    }

    const nome = (corpo.nome ?? '').trim().replace(/\s+/g, ' ')
    const cpf = (corpo.cpf ?? '').replace(/\D/g, '')
    if (nome.length < 5 || !nome.includes(' ')) return json(400, { erro: 'Informe seu nome completo.' })
    if (!cpfValido(cpf)) return json(400, { erro: 'CPF inválido. Confira os números.' })

    if (prof) {
      const [cad] = await supa<{ status: string }[]>(`/rest/v1/profissionais?select=status&user_id=eq.${uid}`, token)
      if (cad?.status !== 'verificado') return json(403, { erro: 'Seu cadastro profissional ainda não foi verificado pela equipe.' })
    }
    const [plano] = await supa<Plano[]>(`/rest/v1/planos?select=id,nome,preco,meses,ativo&id=eq.${encodeURIComponent(corpo.plano_id ?? '')}&ativo=eq.true&publico=eq.${prof ? 'profissional' : 'paciente'}`, token)
    if (!plano || !CICLO[plano.meses]) return json(400, { erro: 'Plano indisponível.' })

    // Assinatura pendente (ainda não paga): troca pela nova, para não deixar duas cobranças abertas.
    if (acesso?.asaas_assinatura_id && acesso.status === 'pendente' && acesso.ambiente === api.amb) {
      await api.chamar('DELETE', `/subscriptions/${encodeURIComponent(acesso.asaas_assinatura_id)}`).catch(() => {})
    }

    let cliente = acesso?.ambiente === api.amb ? acesso?.asaas_cliente_id : null
    if (cliente) await api.chamar('POST', `/customers/${encodeURIComponent(cliente)}`, { name: nome, cpfCnpj: cpf }).catch(() => { cliente = null })
    if (!cliente) {
      const c = await api.chamar<{ id: string }>('POST', '/customers', { name: nome, cpfCnpj: cpf, email: usuario.email, externalReference: ref, notificationDisabled: false })
      cliente = c.id
    }

    // Quem cancelou e ainda tem dias pagos só é cobrado quando esse período acabar.
    const hoje = hojeEmSP()
    const ate = acesso?.pago_ate && new Date(acesso.pago_ate) > new Date() ? acesso.pago_ate.slice(0, 10) : hoje
    const vencimento = ate > hoje ? ate : hoje

    const assinatura = await api.chamar<{ id: string }>('POST', '/subscriptions', {
      customer: cliente, billingType: 'UNDEFINED', value: Number(plano.preco), nextDueDate: vencimento,
      cycle: CICLO[plano.meses], description: `Papa Prato${prof ? ' Profissional' : ''} - plano ${plano.nome}`, externalReference: ref,
    })

    let link: string | null = null
    for (let i = 0; i < 4 && !link; i++) {
      const p = await api.chamar<{ data: { invoiceUrl?: string }[] }>('GET', `/subscriptions/${assinatura.id}/payments?limit=1`)
      link = p.data?.[0]?.invoiceUrl ?? null
      if (!link) await new Promise(r => setTimeout(r, 700))
    }

    await salvar(uid, { plano_id: plano.id, ambiente: api.amb, status: 'pendente', asaas_cliente_id: cliente, asaas_assinatura_id: assinatura.id, link_pagamento: link }, prof)
    return json(200, { link, vencimento })
  } catch (e) {
    console.error('assinatura', (e as Error).message)
    return json(502, { erro: 'Não foi possível falar com o sistema de pagamento agora. Tente de novo em instantes.', detalhe: (e as Error).message })
  }
}
