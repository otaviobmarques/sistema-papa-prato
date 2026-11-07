import { MODELOS, RECEITAS } from '../data/cardapio'

// Base de alimentos (TACO, TBCA, POF, USDA, CoFID, Ciqual, CNF, AFCD, Frida e Fineli) gerada de fontes-ref
// por scripts/gerar-alimentos.py.
// Os valores são por 100 g de parte comestível, exatamente como a fonte publica.
export type Fonte = 'TACO' | 'TBCA' | 'POF' | 'USDA' | 'COFID' | 'CIQUAL' | 'CNF' | 'AFCD' | 'FRIDA' | 'FINELI' | 'OFF'
export type Medida = { nome: string; gramas: number }
export type Alimento = {
  id: string; nome: string; fonte: Fonte
  kcal: number; proteina: number; carboidrato: number; gordura: number
  fibra: number | null; sodio: number | null
  medidas: Medida[]; termos: string
  busca: string // nome + termos sem acento, para buscar
  personalizado?: boolean
  alergenosRotulo?: string[] // do rótulo (Open Food Facts); quando existe, substitui a estimativa pelo nome
  marca?: string
}
export type Nutrientes = { kcal: number; proteina: number; carboidrato: number; gordura: number; fibra: number }

export const NOME_FONTE: Record<Fonte, string> = {
  TACO: 'TACO · NEPA/UNICAMP', TBCA: 'TBCA · USP/FoRC', POF: 'IBGE · POF 2008-2009',
  USDA: 'USDA FoodData Central', COFID: 'CoFID 2021 (Reino Unido)', CIQUAL: 'Ciqual 2025 · ANSES (França)',
  CNF: 'Canadian Nutrient File 2026 (Canadá)', AFCD: 'AFCD Release 3 · FSANZ (Austrália)', FRIDA: 'Frida 5.5 · DTU (Dinamarca)',
  FINELI: 'Fineli · THL (Finlândia)', OFF: 'Open Food Facts (rótulo do produto)',
}
export const CITACAO_OFF = 'Dados do produto: Open Food Facts (openfoodfacts.org), licença ODbL. Informações enviadas por colaboradores; confira o rótulo.'
// Ordem de preferência na busca: bases brasileiras primeiro; as internacionais completam o que faltar
// (as com nome traduzido do inglês por último).
const PRIORIDADE: Record<Fonte, number> = { TACO: 0, TBCA: 1, POF: 2, USDA: 3, CNF: 4, COFID: 4, AFCD: 5, FINELI: 5, CIQUAL: 6, FRIDA: 6, OFF: 1 }

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Sinônimos regionais: quem busca "aipim" também encontra "mandioca".
const SINONIMOS: Record<string, string> = {
  aipim: 'mandioca', macaxeira: 'mandioca', jerimum: 'abobora', mexerica: 'tangerina', bergamota: 'tangerina',
  mimosa: 'tangerina', aboboa: 'abobora', 'pao de sal': 'pao frances', cacetinho: 'pao frances',
  mussarela: 'mozarela', muçarela: 'mozarela', bife: 'carne', biscoito: 'biscoito', bolacha: 'biscoito',
  'feijao de corda': 'feijao fradinho', macarronada: 'macarrao', frango: 'frango',
}

type Base = { lista: Alimento[]; porId: Map<string, Alimento>; citacao: Record<string, string> }
let cache: Base | null = null
let carregando: Promise<Base> | null = null

export function carregarAlimentos(): Promise<Base> {
  if (cache) return Promise.resolve(cache)
  if (!carregando) {
    carregando = fetch('/data/alimentos.json')
      .then(r => { if (!r.ok) throw new Error('Não foi possível carregar a base de alimentos'); return r.json() })
      .then((j: { fontes: Fonte[]; citacao: Record<string, string>; alimentos: unknown[][] }) => {
        const lista = j.alimentos.map(a => {
          const [id, nome, f, kcal, p, c, g, fib, sod, med, termos] = a as [string, string, number, number, number, number, number, number | null, number | null, [string, number][], string]
          return {
            id, nome, fonte: j.fontes[f], kcal, proteina: p ?? 0, carboidrato: c ?? 0, gordura: g ?? 0,
            fibra: fib, sodio: sod, medidas: med.map(([nome, gramas]) => ({ nome, gramas })), termos,
            busca: semAcento(nome + ' ' + termos),
          } as Alimento
        })
        const b: Base = { lista, porId: new Map(lista.map(a => [a.id, a])), citacao: j.citacao }
        cache = b
        return b
      })
      .catch(e => { carregando = null; throw e })
  }
  return carregando
}

export const baseCarregada = () => cache

// Alimentos do dia a dia (usados no cardápio e nas receitas) aparecem primeiro.
const POPULARES = new Set([...MODELOS.flatMap(m => m.itens.map(i => i.id)), ...RECEITAS.flatMap(r => r.itens.map(i => i.id))])

export function buscar(lista: Alimento[], consulta: string, limite = 40): Alimento[] {
  let q = semAcento(consulta.trim())
  if (!q) return []
  for (const [de, para] of Object.entries(SINONIMOS)) if (q.includes(de)) q = q.replace(de, para)
  const palavras = q.split(/[\s,]+/).filter(Boolean)
  const achados: { a: Alimento; nota: number }[] = []
  for (const a of lista) {
    if (!palavras.every(p => a.busca.includes(p))) continue
    const nomeN = semAcento(a.nome)
    let nota = PRIORIDADE[a.fonte] * 6
    if (!nomeN.startsWith(palavras[0])) nota += 10
    nota += Math.min(a.nome.length, 120) / 12 // nomes curtos e genéricos primeiro
    if (a.medidas.length) nota -= 2           // quem tem medida caseira é mais prático
    if (a.personalizado) nota -= 4
    if (POPULARES.has(a.id)) nota -= 8
    if (!nomeN.includes(' com ')) { // preparo básico primeiro: quem registra costuma comer o alimento pronto
      if (/\b(cozid[oa]|assad[oa]|grelhad[oa])\b/.test(nomeN)) nota -= 5
      else if (/\b(cru[a]?|in natura)\b/.test(nomeN)) nota -= 2
    }
    achados.push({ a, nota })
  }
  return achados.sort((x, y) => x.nota - y.nota).slice(0, limite).map(x => x.a)
}

export function nutrientesDe(a: Alimento, gramas: number): Nutrientes {
  const f = gramas / 100
  return {
    kcal: a.kcal * f, proteina: a.proteina * f, carboidrato: a.carboidrato * f,
    gordura: a.gordura * f, fibra: (a.fibra ?? 0) * f,
  }
}

export const somar = (lista: Nutrientes[]): Nutrientes => lista.reduce((t, n) => ({
  kcal: t.kcal + n.kcal, proteina: t.proteina + n.proteina, carboidrato: t.carboidrato + n.carboidrato,
  gordura: t.gordura + n.gordura, fibra: t.fibra + n.fibra,
}), { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0, fibra: 0 })

// Nome curto para telas pequenas: "Arroz, tipo 1, cozido" → "Arroz tipo 1 cozido"
export const nomeCurto = (nome: string) => nome.replace(/\s*\(.*?\)/g, '').replace(/,\s*/g, ' · ')
