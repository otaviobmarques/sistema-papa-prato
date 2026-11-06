import { MODELOS, type Modelo } from '../data/cardapio'
import { alergenosEstimados, temCarne, temOrigemAnimal } from './alergias'
import { nutrientesDe, semAcento, somar, type Alimento, type Nutrientes } from './alimentos'
import { DIVISAO_REFEICOES, type Metas } from './metas'
import type { Perfil, Refeicao } from './store'

export type ItemPlano = { alimento: Alimento; gramas: number; n: Nutrientes }
export type RefeicaoPlano = { chave: string; refeicao: Refeicao; modelo: Modelo; itens: ItemPlano[]; total: Nutrientes; opcoes: number }
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function modeloPermitido(m: Modelo, perfil: Perfil | null, porId: Map<string, Alimento>) {
  if (!perfil) return true
  const evitar = perfil.naoGosta.split(/[,;\n]/).map(s => semAcento(s.trim())).filter(s => s.length > 2)
  return m.itens.every(({ id }) => {
    const a = porId.get(id)
    if (!a) return false
    if (perfil.dieta === 'vegano' && temOrigemAnimal(a.nome)) return false
    if (perfil.dieta === 'vegetariano' && temCarne(a.nome)) return false
    if (alergenosEstimados(a.nome).some(x => perfil.alergias.includes(x))) return false
    const n = semAcento(a.nome)
    return !evitar.some(e => n.includes(e))
  })
}

function candidatos(refeicao: Refeicao, perfil: Perfil | null, porId: Map<string, Alimento>) {
  const ok = MODELOS.filter(m => m.refeicao === refeicao && modeloPermitido(m, perfil, porId))
  if (perfil?.tempo === 'rapido') ok.sort((a, b) => Number(b.tempo === 'rapido') - Number(a.tempo === 'rapido'))
  // pratos da região da pessoa aparecem com mais frequência
  if (perfil && perfil.regiao !== 'misturar') {
    const daRegiao = ok.filter(m => m.regioes?.includes(perfil.regiao))
    return [...daRegiao, ...ok, ...daRegiao]
  }
  return ok
}

export function montarRefeicao(m: Modelo, alvoKcal: number, porId: Map<string, Alimento>) {
  const base = m.itens.map(i => ({ i, a: porId.get(i.id)! }))
  const kcalFixo = base.filter(x => x.i.fixo).reduce((s, x) => s + x.a.kcal * x.i.g / 100, 0)
  const kcalVar = base.filter(x => !x.i.fixo).reduce((s, x) => s + x.a.kcal * x.i.g / 100, 0)
  const fator = kcalVar > 0 ? Math.min(1.8, Math.max(0.5, (alvoKcal - kcalFixo) / kcalVar)) : 1
  const itens = base.map(({ i, a }) => {
    const gramas = i.fixo ? i.g : Math.max(5, Math.round((i.g * fator) / 5) * 5)
    return { alimento: a, gramas, n: nutrientesDe(a, gramas) }
  })
  return { itens, total: somar(itens.map(x => x.n)) }
}

export function planoDoDia(dia: number, semente: number, trocas: Record<string, number>, perfil: Perfil | null, metas: Metas, porId: Map<string, Alimento>): RefeicaoPlano[] {
  const out: RefeicaoPlano[] = []
  ;(['cafe', 'almoco', 'lanche', 'jantar'] as Refeicao[]).forEach((refeicao, ri) => {
    const lista = candidatos(refeicao, perfil, porId)
    if (!lista.length) return
    const chave = `${dia}-${refeicao}`
    const idx = (semente + dia * 3 + ri * 7 + (trocas[chave] ?? 0)) % lista.length
    const modelo = lista[idx]
    const { itens, total } = montarRefeicao(modelo, metas.kcal * DIVISAO_REFEICOES[refeicao], porId)
    out.push({ chave, refeicao, modelo, itens, total, opcoes: new Set(lista.map(m => m.id)).size })
  })
  return out
}

// Lista de compras da semana: soma as gramas de cada alimento nos 7 dias.
export function listaDeCompras(semana: RefeicaoPlano[][]) {
  const mapa = new Map<string, { alimento: Alimento; gramas: number; vezes: number }>()
  semana.flat().forEach(r => r.itens.forEach(i => {
    const x = mapa.get(i.alimento.id) ?? { alimento: i.alimento, gramas: 0, vezes: 0 }
    x.gramas += i.gramas; x.vezes += 1
    mapa.set(i.alimento.id, x)
  }))
  return [...mapa.values()].sort((a, b) => a.alimento.nome.localeCompare(b.alimento.nome, 'pt-BR'))
}
