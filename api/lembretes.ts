// Função da Vercel: envia os lembretes no celular (Web Push) de água e refeições.
// Quem chama é o agendamento do próprio banco (pg_cron, a cada 15 min), com o token que só o banco conhece
// (fica no Vault). Esta função não guarda segredo nenhum: repassa o token ao banco, que confere e devolve
// a semente das chaves VAPID e a lista de quem deve ser avisado agora.
import { createECDH, createHmac } from 'node:crypto'
import webpush from 'web-push'

type Item = { tipo: 'cafe' | 'almoco' | 'jantar' | 'agua'; falta_ml?: number }
type Devido = { user_id: string; itens: Item[]; inscricoes: { endpoint: string; p256dh: string; auth: string }[] }

const json = (status: number, corpo: unknown) => Response.json(corpo, { status })
const N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551') // ordem da curva P-256
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// Chaves VAPID derivadas da semente (sempre as mesmas para a mesma semente).
export function chavesDaSemente(semente: string) {
  for (let i = 0; ; i++) {
    const priv = createHmac('sha256', Buffer.from(semente, 'hex')).update(`papa-prato-vapid-v1:${i}`).digest()
    const k = BigInt('0x' + priv.toString('hex'))
    if (k === 0n || k >= N) continue
    const ecdh = createECDH('prime256v1'); ecdh.setPrivateKey(priv)
    return { privateKey: b64url(priv), publicKey: b64url(ecdh.getPublicKey()) }
  }
}

const TEXTOS: Record<Item['tipo'], (i: Item) => { title: string; body: string; url: string }> = {
  cafe: () => ({ title: '☀️ Bom dia! Já tomou café?', body: 'Registre seu café da manhã em poucos toques.', url: '/app/?acao=registrar' }),
  almoco: () => ({ title: '🍛 Hora do almoço', body: 'Conta pro Papa o que tem no prato hoje.', url: '/app/?acao=registrar' }),
  jantar: () => ({ title: '🌙 E o jantar?', body: 'Fechando o dia: registre o jantar e veja como foi.', url: '/app/?acao=registrar' }),
  agua: i => ({ title: '💧 Um copo d’água?', body: i.falta_ml ? `Faltam ${(i.falta_ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L para os 2 L de hoje.` : 'Hidratação em dia faz diferença.', url: '/app/' }),
}

async function rpc<T>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL!, chave = process.env.SUPABASE_PUBLISHABLE_KEY!
  const r = await fetch(`${url}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { apikey: chave, authorization: `Bearer ${chave}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
  if (!r.ok) throw Object.assign(new Error(`${nome}: ${r.status} ${(await r.text()).slice(0, 200)}`), { status: r.status })
  return r.json() as Promise<T>
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return json(503, { erro: 'Servidor sem configuração.' })
  const token = req.headers.get('x-lembretes-token') ?? ''
  if (!token) return json(401, { erro: 'Sem token.' })

  let semente: string
  try { semente = await rpc<string>('lembretes_semente', { token }) }
  catch (e) { return json((e as { status?: number }).status === 401 || /42501|token/.test((e as Error).message) ? 401 : 502, { erro: 'Token inválido ou banco indisponível.' }) }
  const chaves = chavesDaSemente(semente)
  await rpc('salvar_chave_publica_push', { token, chave_publica: chaves.publicKey }).catch(e => console.error('chave pública', (e as Error).message))

  const devidos = await rpc<Devido[]>('lembretes_devidos', { token })
  let enviados = 0, removidos = 0, falhas = 0
  await Promise.all(devidos.flatMap(d => d.itens.flatMap(item => d.inscricoes.map(async ins => {
    const t = TEXTOS[item.tipo](item)
    try {
      await webpush.sendNotification({ endpoint: ins.endpoint, keys: { p256dh: ins.p256dh, auth: ins.auth } },
        JSON.stringify({ ...t, tag: 'papa-' + item.tipo }),
        { vapidDetails: { subject: 'https://papa-prato.vercel.app', publicKey: chaves.publicKey, privateKey: chaves.privateKey }, TTL: 1800, urgency: 'normal' })
      enviados++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) { removidos++; await rpc('remover_inscricao_push', { token, endpoint: ins.endpoint }).catch(() => {}) }
      else { falhas++; console.error('push', status, (e as Error).message) }
    }
  }))))
  return json(200, { pessoas: devidos.length, enviados, removidos, falhas })
}
