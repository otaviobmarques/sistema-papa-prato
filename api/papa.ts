// Função da Vercel: Conversa com o Papa (T34). A pessoa conversa com o mascote sobre alimentação.
// Claude é o principal; se falhar, tenta o Gemini (AI Studio). Só para assinantes em dia (ou equipe).
// O histórico fica no banco (tabela conversa_papa), visível só para a própria pessoa, que pode apagar.
import Anthropic from '@anthropic-ai/sdk'

const MODELO_CLAUDE = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
const MODELO_GEMINI = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
const LIMITE_DIA = 30 // uso justo: mensagens por pessoa em 24 h (cada uma custa ~R$ 0,06 de IA)
const usos = new Map<string, number[]>()
let clienteClaude: Anthropic | null = null

const SISTEMA = `Você é o Papa, o mascote do app Papa Prato: uma couve-flor simpática que ajuda brasileiros a comer melhor
com comida de verdade (arroz, feijão, frutas, legumes, comida regional), sem dieta da moda e sem culpa.

Como você fala:
- Português do Brasil, leve e acolhedor, frases curtas. Pode usar uma ou outra expressão regional, sem exagero.
- Respostas curtas: em geral até 120 palavras. Use listas só quando ajudar (receita, lista de compras, opções).
- Nunca julgue, nunca use "proibido", "pecado", "trapaça" nem fale de peso ou corpo de forma negativa.
- Dê ideias práticas com o que a pessoa já tem e com o perfil dela (objetivo, dieta, alergias, o que não come, região,
  tempo e orçamento). Respeite SEMPRE alergias, dieta (vegetariana/vegana) e o que ela não come.
- Ao citar números (calorias, proteínas), deixe claro que são estimativas e arredonde. Os valores do app vêm da TACO/TBCA.

Limites (importante):
- Você não é nutricionista nem médico. Para doenças (diabetes, hipertensão, doença renal, gestação, alergias graves,
  uso de remédios, cirurgia bariátrica), dê só orientação geral e recomende acompanhamento com nutricionista ou médico.
- Nunca recomende dietas abaixo de 1.200 kcal/dia, jejum prolongado, remédios, suplementos para emagrecer, laxantes ou
  diuréticos.
- Se a pessoa mostrar sinais de transtorno alimentar (culpa intensa, compensar comendo nada, vomitar, medo de comer)
  ou falar em se machucar: acolha com carinho, não dê números nem metas, e sugira procurar ajuda profissional; se
  houver risco, indique o CVV (ligue 188, 24 horas, grátis) ou o SAMU (192).
- Assuntos fora de alimentação, receitas, compras e hábitos: responda em uma frase gentil e volte ao tema.
- Não invente funções do app. O app tem: cardápio da semana, lista de compras, diário, foto do prato, código de barras,
  água, conquistas e esta conversa.`

type Msg = { papel: 'pessoa' | 'papa'; texto: string }
type Uso = { tokens_entrada?: number; tokens_saida?: number }
const json = (status: number, corpo: unknown) => Response.json(corpo, { status })

async function supa(caminho: string, token: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL!, chave = process.env.SUPABASE_PUBLISHABLE_KEY!
  return fetch(url + caminho, { ...init, headers: { apikey: chave, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })
}

// Junta mensagens seguidas do mesmo papel e garante que a conversa começa pela pessoa.
function organizar(historico: Msg[]) {
  const saida: Msg[] = []
  for (const m of historico) {
    const ult = saida[saida.length - 1]
    if (ult && ult.papel === m.papel) ult.texto += '\n\n' + m.texto
    else saida.push({ ...m })
  }
  while (saida.length && saida[0].papel !== 'pessoa') saida.shift()
  return saida
}

async function comClaude(sistemaDia: string, conversa: Msg[], uso: Uso) {
  clienteClaude ??= new Anthropic()
  const r = await clienteClaude.beta.messages.create({
    model: MODELO_CLAUDE,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }, { type: 'text', text: sistemaDia }],
    messages: conversa.map(m => ({ role: m.papel === 'pessoa' ? 'user' as const : 'assistant' as const, content: m.texto })),
  })
  uso.tokens_entrada = r.usage?.input_tokens; uso.tokens_saida = r.usage?.output_tokens
  if (r.stop_reason === 'refusal') throw new Error('recusa')
  const texto = r.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim()
  if (!texto) throw new Error('resposta vazia (' + r.stop_reason + ')')
  return texto
}

async function comGemini(sistemaDia: string, conversa: Msg[], uso: Uso) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA + '\n\n' + sistemaDia }] },
      contents: conversa.map(m => ({ role: m.papel === 'pessoa' ? 'user' : 'model', parts: [{ text: m.texto }] })),
      generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
    }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${d?.error?.message ?? ''}`.slice(0, 200))
  uso.tokens_entrada = d?.usageMetadata?.promptTokenCount; uso.tokens_saida = d?.usageMetadata?.candidatesTokenCount
  const texto = (d?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim()
  if (!texto) throw new Error('Gemini sem texto')
  return texto
}

async function registrarUso(token: string, uid: string, provedor: 'claude' | 'gemini', modelo: string, ok: boolean, inicio: number, uso: Uso, erro?: string) {
  await supa('/rest/v1/ia_uso', token, {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: uid, funcao: 'conversa', provedor, modelo, ok, ms: Date.now() - inicio, tokens_entrada: uso.tokens_entrada ?? null, tokens_saida: uso.tokens_saida ?? null, erro: erro ? erro.slice(0, 300) : null }),
  }).catch(e => console.error('registro de uso', (e as Error).message))
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return json(503, { erro: 'Servidor sem configuração.' })
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) return json(503, { erro: 'A conversa ainda não foi ativada (falta a chave de IA).' })

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const u = token ? await supa('/auth/v1/user', token).then(r => (r.ok ? r.json() : null)).catch(() => null) : null
  const uid: string | undefined = u?.id
  if (!uid) return json(401, { erro: 'Entre na sua conta para conversar com o Papa.' })

  const acesso = await supa('/rest/v1/rpc/meu_acesso', token, { method: 'POST', body: '{}' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  if (acesso?.liberado !== true) return json(402, { erro: 'A conversa com o Papa faz parte da assinatura.' })

  const agora = Date.now(), recentes = (usos.get(uid) ?? []).filter(t => agora - t < 60_000)
  if (recentes.length >= 6) return json(429, { erro: 'Calma, estou pensando! Espere um minutinho e mande de novo.' })
  usos.set(uid, [...recentes, agora])
  const noDia = await supa('/rest/v1/rpc/mensagens_papa_24h', token, { method: 'POST', body: '{}' }).then(r => r.json()).catch(() => 0)
  if (Number(noDia) >= LIMITE_DIA) return json(429, { erro: 'Conversamos bastante hoje! Volte amanhã que eu continuo te ajudando.' })

  let corpo: { mensagem?: string; contexto?: unknown }
  try { corpo = await req.json() } catch { return json(400, { erro: 'Pedido inválido.' }) }
  const mensagem = (corpo.mensagem ?? '').trim().slice(0, 1500)
  if (!mensagem) return json(400, { erro: 'Escreva uma mensagem.' })
  const contexto = JSON.stringify(corpo.contexto ?? {}).slice(0, 2500)
  const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' }).format(new Date())
  const sistemaDia = `Agora é ${hoje}. Dados da pessoa no app (perfil, metas e o que registrou hoje), em JSON; use para personalizar, sem recitar tudo:\n${contexto}`

  const hist: Msg[] = await supa('/rest/v1/conversa_papa?select=papel,texto&order=id.desc&limit=16', token).then(r => (r.ok ? r.json() : [])).catch(() => [])
  const conversa = organizar([...hist.reverse(), { papel: 'pessoa', texto: mensagem }])

  let resposta = '', erroFinal = ''
  if (process.env.ANTHROPIC_API_KEY) {
    const inicio = Date.now(), uso: Uso = {}
    try { resposta = await comClaude(sistemaDia, conversa, uso); await registrarUso(token, uid, 'claude', MODELO_CLAUDE, true, inicio, uso) }
    catch (e) {
      erroFinal = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message
      console.error('papa claude', erroFinal); await registrarUso(token, uid, 'claude', MODELO_CLAUDE, false, inicio, uso, erroFinal)
    }
  }
  if (!resposta && process.env.GEMINI_API_KEY) {
    const inicio = Date.now(), uso: Uso = {}
    try { resposta = await comGemini(sistemaDia, conversa, uso); await registrarUso(token, uid, 'gemini', MODELO_GEMINI, true, inicio, uso) }
    catch (e) { erroFinal = (e as Error).message; console.error('papa gemini', erroFinal); await registrarUso(token, uid, 'gemini', MODELO_GEMINI, false, inicio, uso, erroFinal) }
  }
  if (!resposta) return json(502, { erro: 'O Papa não conseguiu responder agora. Tente de novo em instantes.' })

  resposta = resposta.slice(0, 4000)
  await supa('/rest/v1/conversa_papa', token, {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify([{ user_id: uid, papel: 'pessoa', texto: mensagem }, { user_id: uid, papel: 'papa', texto: resposta }]),
  }).catch(e => console.error('gravar conversa', (e as Error).message))
  return json(200, { resposta })
}
