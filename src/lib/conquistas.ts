import { calcularMetas } from './metas'
import { chaveData, somarDias, hoje, type ConquistaEquipe, type Estado, type Registro } from './store'

export type Conquista = { id: string; emoji: string; nome: string; criterio: string; progresso: (e: Estado) => [number, number]; campanha?: { inicio: string | null; fim: string | null } }

function sequencia(e: Estado) {
  let d = hoje()
  if (!(e.dias[d]?.registros.length)) d = somarDias(d, -1) // hoje ainda não conta contra
  let n = 0
  while (e.dias[d]?.registros.length) { n++; d = somarDias(d, -1) }
  return n
}
const diasComAguaNaMeta = (e: Estado) => {
  const meta = calcularMetas(e.perfil).aguaMl
  return Object.values(e.dias).filter(d => d.agua.reduce((s, x) => s + x, 0) >= meta).length
}
const diasCompletos = (e: Estado) => Object.values(e.dias).filter(d => ['cafe', 'almoco', 'jantar'].every(r => d.registros.some(x => x.refeicao === r))).length
const alimentosDiferentes = (e: Estado) => new Set(Object.values(e.dias).flatMap(d => d.registros.map(r => r.alimentoId))).size
const totalRegistros = (e: Estado) => Object.values(e.dias).reduce((s, d) => s + d.registros.length, 0)
const comeuVerdura = (e: Estado) => Object.values(e.dias).flatMap(d => d.registros).filter(r => /couve-flor|brócolis|couve|alface|espinafre|rúcula|agrião/i.test(r.nome)).length

export const CONQUISTAS: Conquista[] = [
  { id: 'primeiro', emoji: '🍽️', nome: 'Primeiro prato', criterio: 'Registre sua primeira refeição', progresso: e => [Math.min(totalRegistros(e), 1), 1] },
  { id: 'dia-completo', emoji: '🌞', nome: 'Dia completo', criterio: 'Registre café, almoço e jantar no mesmo dia', progresso: e => [Math.min(diasCompletos(e), 1), 1] },
  { id: 'hidratado', emoji: '💧', nome: 'Bem hidratado', criterio: 'Bata a meta de água em um dia', progresso: e => [Math.min(diasComAguaNaMeta(e), 1), 1] },
  { id: 'seq3', emoji: '🔥', nome: '3 dias seguidos', criterio: 'Registre algo por 3 dias seguidos', progresso: e => [Math.min(sequencia(e), 3), 3] },
  { id: 'seq7', emoji: '🏅', nome: 'Uma semana inteira', criterio: 'Registre algo por 7 dias seguidos', progresso: e => [Math.min(sequencia(e), 7), 7] },
  { id: 'explorador', emoji: '🧭', nome: 'Explorador do sabor', criterio: 'Registre 15 alimentos diferentes', progresso: e => [Math.min(alimentosDiferentes(e), 15), 15] },
  { id: 'verde', emoji: '🥬', nome: 'Amigo do Papa', criterio: 'Registre 5 porções de verduras', progresso: e => [Math.min(comeuVerdura(e), 5), 5] },
  { id: 'agua7', emoji: '🌊', nome: 'Rio de água', criterio: 'Bata a meta de água em 7 dias', progresso: e => [Math.min(diasComAguaNaMeta(e), 7), 7] },
  { id: 'planejador', emoji: '🛒', nome: 'Planejador', criterio: 'Marque 5 itens na lista de compras', progresso: e => [Math.min(Object.values(e.compras).filter(Boolean).length, 5), 5] },
  { id: 'favorito', emoji: '❤️', nome: 'Prato do coração', criterio: 'Salve uma refeição favorita', progresso: e => [Math.min(e.favoritos.length, 1), 1] },
]

// ---- Conquistas e campanhas da equipe (A11) ----
// As mesmas regras do servidor (função progresso_conquista), para o painel e o app concordarem:
//  * em campanha (tem início), só vale registro feito no próprio dia ou no seguinte (nada retroativo);
//  * por dia contam até 10 registros e até 3 do alimento-alvo; água: até 1 L por toque, meta de 2 L.
export function progressoEquipe(c: ConquistaEquipe, e: Estado): number {
  const ini = c.inicio ?? '0000-00-00', fim = c.fim ?? '9999-99-99'
  const valido = (data: string, r: Registro) => {
    if (!c.inicio) return true
    if (!r.criadoEm) return false
    const feito = chaveData(new Date(r.criadoEm))
    return feito >= data && feito <= somarDias(data, 1)
  }
  const dias = Object.entries(e.dias).filter(([d]) => d >= ini && d <= fim).sort(([a], [b]) => a.localeCompare(b))
  const porDia = dias.map(([d, dia]) => ({ d, regs: dia.registros.filter(r => valido(d, r)), agua: dia.agua.reduce((s, x) => s + Math.min(x, 1000), 0) }))
  const comRegistro = porDia.filter(x => x.regs.length)
  const termos = c.termos.map(t => t.toLowerCase())
  switch (c.metrica) {
    case 'registros': return comRegistro.reduce((s, x) => s + Math.min(x.regs.length, 10), 0)
    case 'dias_registrados': return comRegistro.length
    case 'dias_completos': return comRegistro.filter(x => ['cafe', 'almoco', 'jantar'].every(r => x.regs.some(g => g.refeicao === r))).length
    case 'alimentos_diferentes': return new Set(comRegistro.flatMap(x => x.regs.map(r => r.alimentoId))).size
    case 'contem_alimento': return comRegistro.reduce((s, x) => s + Math.min(x.regs.filter(r => termos.some(t => r.nome.toLowerCase().includes(t))).length, 3), 0)
    case 'dias_agua': return porDia.filter(x => x.agua >= 2000).length
    case 'sequencia': {
      let melhor = 0, atual = 0, ant = ''
      for (const x of comRegistro) { atual = ant && somarDias(ant, 1) === x.d ? atual + 1 : 1; melhor = Math.max(melhor, atual); ant = x.d }
      return melhor
    }
  }
}

const daEquipe = (c: ConquistaEquipe): Conquista => ({
  id: 'eq:' + c.id, emoji: c.emoji, nome: c.nome, criterio: c.criterio,
  progresso: e => [Math.min(progressoEquipe(c, e), c.alvo), c.alvo],
  campanha: c.inicio || c.fim ? { inicio: c.inicio, fim: c.fim } : undefined,
})

// Campanhas que ainda não começaram ficam escondidas; as encerradas só aparecem para quem completou.
export function todasConquistas(e: Estado): Conquista[] {
  const h = hoje()
  const equipe = (e.conquistasEquipe ?? []).map(daEquipe).filter(c => {
    if (!c.campanha) return true
    if (c.campanha.inicio && c.campanha.inicio > h) return false
    if (c.campanha.fim && c.campanha.fim < h) { const [a, b] = c.progresso(e); return a >= b }
    return true
  })
  return [...equipe.filter(c => c.campanha), ...CONQUISTAS, ...equipe.filter(c => !c.campanha)]
}

export const desbloqueadas = (e: Estado) => todasConquistas(e).filter(c => { const [a, b] = c.progresso(e); return a >= b })
export { sequencia }
