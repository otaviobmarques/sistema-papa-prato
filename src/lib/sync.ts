import { cancelarAssinatura } from './assinatura'
// Sincronização com a nuvem. O app continua "local primeiro": tudo é salvo no aparelho na hora
// e enviado ao Supabase em segundo plano. Em conflito, vence a versão alterada por último
// (por dia do diário e para o documento do perfil).
import { supabase, aoMudarSessao, obterSessao } from './supabase'
import { CAMPOS_SINCRONIZADOS, aoMudar, atualizar, obterEstado, type Dia, type Estado } from './store'

type Situacao = { estado: 'desligado' | 'sincronizando' | 'ok' | 'erro'; em?: string; mensagem?: string }
let situacao: Situacao = { estado: 'desligado' }
const ouvintesSituacao = new Set<(s: Situacao) => void>()
const definir = (s: Situacao) => { situacao = s; ouvintesSituacao.forEach(f => f(s)) }
export const obterSituacao = () => situacao
export function aoMudarSituacao(f: (s: Situacao) => void) { ouvintesSituacao.add(f); return () => { ouvintesSituacao.delete(f) } }

const enviados = { perfil: '', dias: new Map<string, string>() } // carimbo do que já está na nuvem
let timer: number | undefined
let rodando = false

const docPerfil = (e: Estado) => Object.fromEntries(CAMPOS_SINCRONIZADOS.map(c => [c, e[c]]))
const novo = (a?: string, b?: string) => (a ?? '') > (b ?? '')

// Quantas mudanças locais ainda não foram para a nuvem (perfil conta como 1).
export function pendentes() {
  const e = obterEstado()
  let n = e.perfil && e.atualizadoEm && novo(e.atualizadoEm, enviados.perfil) ? 1 : 0
  for (const [k, d] of Object.entries(e.dias)) if (d.atualizadoEm && novo(d.atualizadoEm, enviados.dias.get(k))) n++
  return n
}

export async function sincronizar() {
  const sessao = obterSessao()
  if (!supabase || !sessao || rodando) return
  rodando = true
  definir({ estado: 'sincronizando' })
  try {
    const uid = sessao.user.id
    const [{ data: perfilRemoto, error: e1 }, { data: diasRemotos, error: e2 }] = await Promise.all([
      supabase.from('perfis').select('estado, atualizado_em').eq('user_id', uid).maybeSingle(),
      supabase.from('dias').select('data, registros, agua, atualizado_em').eq('user_id', uid),
    ])
    if (e1 || e2) throw e1 ?? e2

    // 1) Traz o que está mais novo na nuvem.
    atualizar(e => {
      let s = e
      if (perfilRemoto && (novo(perfilRemoto.atualizado_em, e.atualizadoEm) || !e.perfil)) {
        s = { ...s, ...(perfilRemoto.estado as Partial<Estado>), atualizadoEm: perfilRemoto.atualizado_em }
      }
      const dias = { ...s.dias }
      for (const d of diasRemotos ?? []) {
        if (novo(d.atualizado_em, dias[d.data]?.atualizadoEm)) dias[d.data] = { registros: d.registros, agua: d.agua, atualizadoEm: d.atualizado_em }
        enviados.dias.set(d.data, d.atualizado_em)
      }
      return { ...s, dias }
    }, { marcar: false })
    if (perfilRemoto) enviados.perfil = perfilRemoto.atualizado_em

    // 2) Envia o que está mais novo aqui.
    await enviarPendentes()
    if (!perfilRemoto) await registrarConsentimentos()
    definir({ estado: 'ok', em: new Date().toISOString() })
  } catch (err) {
    definir({ estado: 'erro', mensagem: (err as Error).message })
  } finally {
    rodando = false
  }
}

async function enviarPendentes() {
  const sessao = obterSessao()
  if (!supabase || !sessao) return
  const e = obterEstado()
  const uid = sessao.user.id
  if (e.perfil && e.atualizadoEm && novo(e.atualizadoEm, enviados.perfil)) {
    const { error } = await supabase.from('perfis').upsert({ user_id: uid, estado: docPerfil(e), atualizado_em: e.atualizadoEm })
    if (error) throw error
    enviados.perfil = e.atualizadoEm
  }
  const dias = Object.entries(e.dias).filter(([k, d]: [string, Dia]) => d.atualizadoEm && novo(d.atualizadoEm, enviados.dias.get(k)))
  if (dias.length) {
    const { error } = await supabase.from('dias').upsert(dias.map(([data, d]) => ({ user_id: uid, data, registros: d.registros, agua: d.agua, atualizado_em: d.atualizadoEm })))
    if (error) throw error
    dias.forEach(([k, d]) => enviados.dias.set(k, d.atualizadoEm!))
  }
}

export async function registrarConsentimentos() {
  const sessao = obterSessao(); const c = obterEstado().consentimento
  if (!supabase || !sessao || !c) return
  await supabase.from('consentimentos').insert([
    { user_id: sessao.user.id, tipo: 'termos', valor: true },
    { user_id: sessao.user.id, tipo: 'ia', valor: c.ia },
    { user_id: sessao.user.id, tipo: 'novidades', valor: c.novidades },
  ])
}
export async function registrarConsentimento(tipo: 'ia' | 'novidades', valor: boolean) {
  const sessao = obterSessao()
  if (supabase && sessao) await supabase.from('consentimentos').insert({ user_id: sessao.user.id, tipo, valor })
}

export function iniciarSincronizacao() {
  if (!supabase) return
  aoMudarSessao(s => {
    if (s) sincronizar()
    else { enviados.perfil = ''; enviados.dias.clear(); definir({ estado: 'desligado' }) }
  })
  // Envia mudanças locais alguns segundos depois de acontecerem.
  aoMudar(() => {
    if (!obterSessao()) return
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      definir({ estado: 'sincronizando' })
      enviarPendentes().then(() => definir({ estado: 'ok', em: new Date().toISOString() })).catch(err => definir({ estado: 'erro', mensagem: (err as Error).message }))
    }, 2000)
  })
  addEventListener('online', () => sincronizar())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar() })
}

// Conteúdo publicado pela equipe (alimentos próprios e textos do mascote).
export async function carregarConteudoDaEquipe() {
  if (!supabase) return
  const [{ data: alimentos }, { data: conteudo }, { data: modelos }, { data: receitas }, { data: conquistas }] = await Promise.all([
    supabase.from('alimentos_equipe').select('*').eq('publicado', true),
    supabase.from('conteudo').select('dados').eq('id', 'mascote').maybeSingle(),
    supabase.from('modelos_refeicao').select('id, refeicao, nome, itens, regioes, tempo').eq('status', 'publicado').order('id'),
    supabase.from('receitas').select('id, nome, emoji, minutos, porcoes, regiao, itens, extras, passos').eq('status', 'publicado').order('id'),
    supabase.from('conquistas_equipe').select('id, emoji, nome, criterio, metrica, alvo, termos, inicio, fim, ordem').eq('status', 'publicado').order('ordem'),
  ])
  atualizar(e => ({
    ...e,
    ...(alimentos ? { alimentosPersonalizados: alimentos.map(a => ({ id: a.id, nome: a.nome, kcal: +a.kcal, proteina: +a.proteina, carboidrato: +a.carboidrato, gordura: +a.gordura, fibra: a.fibra == null ? null : +a.fibra, medidas: a.medidas, publicado: a.publicado, atualizadoEm: a.atualizado_em })) } : {}),
    ...(conteudo?.dados ? { conteudo: { ...e.conteudo, ...conteudo.dados } } : {}),
    ...(modelos ? { modelosEquipe: modelos.map(m => ({ ...m, regioes: m.regioes?.length ? m.regioes : undefined })) } : {}),
    ...(receitas ? { receitasEquipe: receitas } : {}),
    ...(conquistas ? { conquistasEquipe: conquistas } : {}),
  }), { marcar: false })
}

export async function sairDaConta() {
  if (!supabase) return
  clearTimeout(timer)
  try { await enviarPendentes() } catch { /* sai mesmo assim */ }
  await supabase.auth.signOut()
}

export async function apagarConta() {
  if (!supabase) return
  // Cancela a cobrança recorrente no Asaas antes de apagar a conta, para ninguém ser cobrado depois.
  const { data: acesso } = await supabase.rpc('meu_acesso')
  if (acesso?.asaas_assinatura_id && acesso.status !== 'cancelada') await cancelarAssinatura()
  const { error } = await supabase.rpc('apagar_minha_conta')
  if (error) throw error
  await supabase.auth.signOut()
}
