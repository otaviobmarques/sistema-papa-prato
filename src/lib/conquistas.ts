import { calcularMetas } from './metas'
import { somarDias, hoje, type Estado } from './store'

export type Conquista = { id: string; emoji: string; nome: string; criterio: string; progresso: (e: Estado) => [number, number] }

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

export const desbloqueadas = (e: Estado) => CONQUISTAS.filter(c => { const [a, b] = c.progresso(e); return a >= b })
export { sequencia }
