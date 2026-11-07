// Função da Vercel: recebe a foto do prato e pede ao Gemini para identificar os alimentos e
// estimar as porções. As credenciais existem só aqui no servidor. A foto não é guardada.
// Os valores nutricionais NÃO vêm da IA: o app liga cada item à base TACO/TBCA e a pessoa revisa.
//
// Provedores (configurados na Vercel):
//  1. Claude (Anthropic), principal: ANTHROPIC_API_KEY  (+ CLAUDE_MODEL, padrão claude-opus-5-5)
//  2. Gemini, reserva se o Claude falhar: GOOGLE_SERVICE_ACCOUNT_JSON (Vertex AI) ou GEMINI_API_KEY (AI Studio)
import { createSign } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

const MODELO = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
const MODELO_CLAUDE = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
const LIMITE_POR_HORA = 20
const usos = new Map<string, number[]>() // limite simples por pessoa (por instância)

const PROMPT = `Você analisa fotos de refeições para um app brasileiro de alimentação.
Liste cada alimento visível no prato, com nomes em português do Brasil, e estime a quantidade em gramas
da parte comestível como está servida (alimento pronto). Pense em pratos brasileiros: arroz, feijão, farofa,
cuscuz, mandioca, saladas, carnes, ovos, frutas, sucos.
Para cada item, dê:
- "nome": nome amigável (ex.: "Arroz branco", "Feijão carioca", "Bife grelhado").
- "busca": 2 a 4 palavras para buscar numa tabela de composição (ex.: "arroz tipo 1 cozido", "feijao carioca cozido",
  "carne bovina grelhada", "alface crespa crua"), sem acentos.
- "gramas": estimativa em gramas (número).
- "confianca": "alta", "media" ou "baixa".
Se a foto não mostrar comida, responda "e_comida": false e lista vazia. Não invente itens que não aparecem.
Em "observacao", uma frase curta e gentil (sem julgamentos) se algo atrapalhou a estimativa, ou vazio.`

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    e_comida: { type: 'BOOLEAN' },
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nome: { type: 'STRING' }, busca: { type: 'STRING' }, gramas: { type: 'NUMBER' },
          confianca: { type: 'STRING', enum: ['alta', 'media', 'baixa'] },
        },
        required: ['nome', 'busca', 'gramas', 'confianca'],
      },
    },
    observacao: { type: 'STRING' },
  },
  required: ['e_comida', 'itens'],
}

// Mesmo formato de resposta, validado pelo SDK (saída estruturada).
const Resultado = z.object({
  e_comida: z.boolean(),
  itens: z.array(z.object({
    nome: z.string(), busca: z.string(), gramas: z.number(), confianca: z.enum(['alta', 'media', 'baixa']),
  })),
  observacao: z.string(),
})
type TResultado = z.infer<typeof Resultado>

let clienteClaude: Anthropic | null = null
async function analisarComClaude(imagem: string, tipo: string): Promise<TResultado> {
  clienteClaude ??= new Anthropic() // lê ANTHROPIC_API_KEY do ambiente
  const r = await clienteClaude.beta.messages.parse({
    model: MODELO_CLAUDE,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // se o modelo recusar por segurança, a API tenta outro modelo recomendado
    output_config: { effort: 'low', format: zodOutputFormat(Resultado) },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: tipo as 'image/jpeg' | 'image/png' | 'image/webp', data: imagem } },
        { type: 'text', text: PROMPT },
      ],
    }],
  })
  if (r.stop_reason === 'refusal') throw new Error('recusa: ' + (r.stop_details?.category ?? 'sem categoria'))
  if (!r.parsed_output) throw new Error('resposta sem JSON válido (stop_reason ' + r.stop_reason + ')')
  return r.parsed_output
}

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

async function usuarioDoToken(token: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !chave) return null
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: chave, authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const u = await r.json()
  return typeof u?.id === 'string' ? u.id : null
}

// ---- Vertex AI: troca a conta de serviço por um token de acesso (JWT assinado, sem bibliotecas) ----
type ContaServico = { client_email: string; private_key: string; project_id: string }
let tokenVertex: { valor: string; expira: number } | null = null
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

async function tokenDoVertex(conta: ContaServico) {
  if (tokenVertex && tokenVertex.expira > Date.now() + 60_000) return tokenVertex.valor
  const agora = Math.floor(Date.now() / 1000)
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = b64url(JSON.stringify({ iss: conta.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }))
  const assinatura = createSign('RSA-SHA256').update(`${cab}.${corpo}`).sign(conta.private_key)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cab}.${corpo}.${b64url(assinatura)}` }),
  })
  if (!r.ok) throw new Error('Falha ao autenticar no Google Cloud: ' + r.status)
  const j = await r.json()
  tokenVertex = { valor: j.access_token, expira: Date.now() + j.expires_in * 1000 }
  return tokenVertex.valor
}

async function chamarGemini(corpo: unknown): Promise<Response | null> {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (sa) {
    const conta = JSON.parse(sa) as ContaServico
    const projeto = process.env.GOOGLE_CLOUD_PROJECT || conta.project_id
    const local = process.env.GOOGLE_CLOUD_LOCATION || 'global'
    const host = local === 'global' ? 'aiplatform.googleapis.com' : `${local}-aiplatform.googleapis.com`
    const token = await tokenDoVertex(conta)
    return fetch(`https://${host}/v1/projects/${projeto}/locations/${local}/publishers/google/models/${MODELO}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(corpo),
    })
  }
  const chave = process.env.GEMINI_API_KEY
  if (chave) {
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chave }, body: JSON.stringify(corpo),
    })
  }
  return null
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !process.env.GEMINI_API_KEY) {
    return json(503, { erro: 'A análise de fotos ainda não foi ativada (falta a chave de IA na Vercel).' })
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const uid = token ? await usuarioDoToken(token) : null
  if (!uid) return json(401, { erro: 'Entre na sua conta para usar a foto do prato.' })

  const agora = Date.now()
  const recentes = (usos.get(uid) ?? []).filter(t => agora - t < 3600_000)
  if (recentes.length >= LIMITE_POR_HORA) return json(429, { erro: 'Você já analisou muitas fotos nesta hora. Tente de novo mais tarde.' })
  usos.set(uid, [...recentes, agora])

  let corpo: { imagem?: string; tipo?: string }
  try { corpo = await req.json() } catch { return json(400, { erro: 'Pedido inválido.' }) }
  const imagem = corpo.imagem ?? ''
  const tipo = corpo.tipo ?? 'image/jpeg'
  if (!/^image\/(jpeg|png|webp)$/.test(tipo) || !imagem || imagem.length > 3_000_000) return json(400, { erro: 'Imagem inválida ou grande demais.' })

  // 1º Claude; se falhar (fora do ar, limite, recusa), tenta o Gemini antes de devolver erro.
  const temGemini = !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GEMINI_API_KEY)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return json(200, { ...limpar(await analisarComClaude(imagem, tipo)), modelo: MODELO_CLAUDE })
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) console.error('Claude: chave inválida')
      else if (e instanceof Anthropic.APIError) console.error('Claude', e.status, e.message)
      else console.error('Claude', (e as Error).message)
      if (!temGemini) {
        if (e instanceof Anthropic.RateLimitError) return json(429, { erro: 'Muita gente analisando fotos agora. Tente de novo em instantes.' })
        return json(502, { erro: 'A análise não funcionou agora. Tente de novo ou registre pela busca.' })
      }
      console.warn('Usando o Gemini como reserva')
    }
  }

  try {
    return json(200, { ...limpar(await analisarComGemini(imagem, tipo)), modelo: MODELO })
  } catch (e) {
    console.error('Gemini', (e as Error).message)
    return json(502, { erro: 'A análise não funcionou agora. Tente de novo ou registre pela busca.' })
  }
}

async function analisarComGemini(imagem: string, tipo: string): Promise<TResultado> {
  const r = await chamarGemini({
    contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: tipo, data: imagem } }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: ESQUEMA },
  })
  if (!r) throw new Error('sem credenciais')
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const dados = await r.json()
  const texto = dados?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  return Resultado.parse(JSON.parse(texto))
}

// Normaliza e limita o que volta da IA antes de entregar ao app.
function limpar(res: Partial<TResultado> & Record<string, unknown>) {
  const itens = (Array.isArray(res.itens) ? res.itens : []).slice(0, 12).map((i: Record<string, unknown>) => ({
    nome: String(i.nome ?? '').slice(0, 80), busca: String(i.busca ?? '').slice(0, 80),
    gramas: Math.max(1, Math.min(1500, Math.round(Number(i.gramas) || 100))),
    confianca: ['alta', 'media', 'baixa'].includes(String(i.confianca)) ? i.confianca : 'baixa',
  }))
  return { e_comida: !!res.e_comida, itens, observacao: String(res.observacao ?? '').slice(0, 300) }
}
