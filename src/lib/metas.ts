import type { Perfil } from './store'

export type Metas = { kcal: number; proteina: number; carboidrato: number; gordura: number; aguaMl: number; estimada: boolean }

const FATOR = { sedentario: 1.2, leve: 1.375, moderado: 1.55, intenso: 1.725 }

// Estimativa educativa (Mifflin-St Jeor). Não substitui avaliação de nutricionista.
export function calcularMetas(p: Perfil | null): Metas {
  if (!p) return { kcal: 2000, proteina: 75, carboidrato: 250, gordura: 67, aguaMl: 2000, estimada: false }
  let kcal = 2000
  let estimada = false
  if (p.peso && p.altura && p.idade) {
    const base = 10 * p.peso + 6.25 * p.altura - 5 * p.idade
    const tmb = base + (p.sexo === 'm' ? 5 : p.sexo === 'f' ? -161 : -78)
    kcal = tmb * FATOR[p.atividade]
    estimada = true
  }
  if (p.objetivo === 'perder-peso') kcal *= 0.85
  if (p.objetivo === 'ganhar-massa') kcal *= 1.1
  kcal = Math.max(kcal, 1200) // piso de segurança
  kcal = Math.round(kcal / 10) * 10
  const pctProt = p.objetivo === 'ganhar-massa' ? 0.25 : 0.2
  return {
    kcal,
    proteina: Math.round((kcal * pctProt) / 4),
    carboidrato: Math.round((kcal * (0.7 - pctProt)) / 4),
    gordura: Math.round((kcal * 0.3) / 9),
    aguaMl: p.peso ? Math.round((p.peso * 35) / 50) * 50 : 2000,
    estimada,
  }
}

export const DIVISAO_REFEICOES = { cafe: 0.25, almoco: 0.35, lanche: 0.1, jantar: 0.3, ceia: 0 } as const
