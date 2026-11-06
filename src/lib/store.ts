import { useSyncExternalStore } from 'react'
import type { Alergeno } from './alergias'
import type { Fonte, Medida, Nutrientes } from './alimentos'

export type Refeicao = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'ceia'
export const REFEICOES: { id: Refeicao; nome: string; emoji: string }[] = [
  { id: 'cafe', nome: 'Café da manhã', emoji: '☀️' },
  { id: 'almoco', nome: 'Almoço', emoji: '🍛' },
  { id: 'lanche', nome: 'Lanche', emoji: '🍎' },
  { id: 'jantar', nome: 'Jantar', emoji: '🌙' },
  { id: 'ceia', nome: 'Ceia', emoji: '🍵' },
]

export type Registro = {
  id: string; alimentoId: string; nome: string; fonte: Fonte
  gramas: number; medida?: string; qtd?: number
  refeicao: Refeicao; hora: string
  n: Nutrientes // guardado no momento do registro: o diário não muda se a base for atualizada
}
export type Dia = { registros: Registro[]; agua: number[] }
export type Objetivo = 'comer-melhor' | 'perder-peso' | 'ganhar-massa' | 'manter'
export type Perfil = {
  apelido: string; objetivo: Objetivo
  idade?: number; sexo?: 'f' | 'm'; altura?: number; peso?: number
  atividade: 'sedentario' | 'leve' | 'moderado' | 'intenso'
  dieta: 'onivoro' | 'vegetariano' | 'vegano'
  alergias: Alergeno[]; naoGosta: string; gostos: string[]
  regiao: 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul' | 'misturar'
  tempo: 'rapido' | 'medio' | 'longo'; orcamento: 'economico' | 'equilibrado' | 'flexivel'
  criadoEm: string
}
export type AlimentoPersonalizado = {
  id: string; nome: string; kcal: number; proteina: number; carboidrato: number; gordura: number
  fibra: number | null; medidas: Medida[]; publicado: boolean; atualizadoEm: string
}
export type Favorito = { id: string; nome: string; itens: Omit<Registro, 'id' | 'refeicao' | 'hora'>[] }

export type Estado = {
  versao: 1
  perfil: Perfil | null
  consentimento: { termos: string; ia: boolean; novidades: boolean } | null
  dias: Record<string, Dia>
  plano: { semente: number; trocas: Record<string, number> }
  favoritos: Favorito[]
  compras: Record<string, boolean>
  conquistasVistas: string[]
  ajustes: { fonteGrande: boolean; altoContraste: boolean; menosAnimacao: boolean; tema: 'auto' | 'claro' | 'escuro' }
  alimentosPersonalizados: AlimentoPersonalizado[]
  conteudo: { dicas: string[]; saudacoes: { manha: string; tarde: string; noite: string } }
  tourVisto: boolean
}

export const DICAS_PADRAO = [
  'Metade do prato com legumes e verduras deixa tudo mais colorido e nutritivo.',
  'Arroz com feijão é uma dupla campeã: juntos formam uma proteína completa!',
  'Água por perto ajuda a lembrar de beber. Que tal uma garrafinha na mesa?',
  'Comer devagar ajuda a perceber quando você está satisfeito.',
  'Fruta da estação costuma ser mais barata e mais saborosa.',
  'Planejar a semana evita desperdício e economiza no mercado.',
  'Prefira alimentos in natura e preparações caseiras aos ultraprocessados.',
]

const inicial = (): Estado => ({
  versao: 1, perfil: null, consentimento: null, dias: {},
  plano: { semente: Math.floor(Math.random() * 1000), trocas: {} },
  favoritos: [], compras: {}, conquistasVistas: [],
  ajustes: { fonteGrande: false, altoContraste: false, menosAnimacao: false, tema: 'auto' },
  alimentosPersonalizados: [],
  conteudo: { dicas: DICAS_PADRAO, saudacoes: { manha: 'Bom dia', tarde: 'Boa tarde', noite: 'Boa noite' } },
  tourVisto: false,
})

const CHAVE = 'papa-prato:v1'
function ler(): Estado {
  try {
    const s = localStorage.getItem(CHAVE)
    if (s) return { ...inicial(), ...JSON.parse(s) }
  } catch { /* armazenamento indisponível: segue em memória */ }
  return inicial()
}

let estado: Estado = ler()
const ouvintes = new Set<() => void>()

export function atualizar(fn: (e: Estado) => Estado) {
  estado = fn(estado)
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)) } catch { /* sem persistência */ }
  ouvintes.forEach(o => o())
}
export const obterEstado = () => estado
export function apagarTudo() {
  try { localStorage.removeItem(CHAVE) } catch { /* ok */ }
  estado = inicial(); ouvintes.forEach(o => o())
}

export function useEstado<T>(sel: (e: Estado) => T): T {
  return useSyncExternalStore(cb => { ouvintes.add(cb); return () => ouvintes.delete(cb) }, () => sel(estado))
}

// ---- datas ----
export const hoje = () => chaveData(new Date())
export function chaveData(d: Date) {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}
export function somarDias(chave: string, n: number) {
  const [a, m, d] = chave.split('-').map(Number)
  return chaveData(new Date(a, m - 1, d + n))
}
export const diaVazio = (): Dia => ({ registros: [], agua: [] })
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

// ---- ações ----
export function registrar(data: string, r: Omit<Registro, 'id' | 'hora'>) {
  const hora = new Date().toTimeString().slice(0, 5)
  atualizar(e => {
    const dia = e.dias[data] ?? diaVazio()
    return { ...e, dias: { ...e.dias, [data]: { ...dia, registros: [...dia.registros, { ...r, id: uid(), hora }] } } }
  })
}
export function removerRegistro(data: string, id: string) {
  atualizar(e => {
    const dia = e.dias[data] ?? diaVazio()
    return { ...e, dias: { ...e.dias, [data]: { ...dia, registros: dia.registros.filter(r => r.id !== id) } } }
  })
}
export function editarRegistro(data: string, id: string, mud: Partial<Registro>) {
  atualizar(e => {
    const dia = e.dias[data] ?? diaVazio()
    return { ...e, dias: { ...e.dias, [data]: { ...dia, registros: dia.registros.map(r => r.id === id ? { ...r, ...mud } : r) } } }
  })
}
export function beberAgua(data: string, ml: number) {
  atualizar(e => {
    const dia = e.dias[data] ?? diaVazio()
    return { ...e, dias: { ...e.dias, [data]: { ...dia, agua: [...dia.agua, ml] } } }
  })
}
export function desfazerAgua(data: string) {
  atualizar(e => {
    const dia = e.dias[data] ?? diaVazio()
    return { ...e, dias: { ...e.dias, [data]: { ...dia, agua: dia.agua.slice(0, -1) } } }
  })
}
