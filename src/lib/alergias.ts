import { semAcento } from './alimentos'
// As bases de composição não trazem alérgenos. Aqui o app ESTIMA pelo nome do alimento,
// e a tela sempre avisa que é uma estimativa e que o rótulo deve ser conferido.
export const ALERGENOS = {
  leite: { rotulo: 'Leite', palavras: ['leite', 'queijo', 'iogurte', 'requeijao', 'manteiga', 'creme de leite', 'nata', 'coalhada', 'mozarela', 'parmesao', 'ricota', 'whey', 'chocolate ao leite', 'doce de leite', 'catupiry', 'pao de queijo', 'lasanha', 'pudim', 'sorvete'], excecoes: ['leite de coco', 'leite de soja', 'leite de amendoa', 'leite de aveia', 'bebida vegetal', 'vegano', 'vegetal de castanha'] },
  ovo: { rotulo: 'Ovo', palavras: ['ovo', 'omelete', 'maionese', 'gemada', 'suspiro', 'quindim', 'bolo', 'pudim', 'panqueca'], excecoes: ['sem ovo', 'vegano'] },
  gluten: { rotulo: 'Glúten', palavras: ['trigo', 'pao', 'macarrao', 'massa', 'biscoito', 'bolacha', 'bolo', 'cevada', 'centeio', 'aveia', 'pizza', 'lasanha', 'empada', 'coxinha', 'pastel', 'torrada', 'cuscuz paulista', 'farinha de rosca', 'milanesa', 'cerveja', 'esfiha', 'sanduiche'], excecoes: ['sem gluten', 'pao de queijo', 'tapioca', 'macarrao de arroz', 'pao de batata sem'] },
  amendoim: { rotulo: 'Amendoim', palavras: ['amendoim', 'pe de moleque'], excecoes: [] },
  castanhas: { rotulo: 'Castanhas', palavras: ['castanha', 'nozes', 'noz ', 'amendoa', 'avela', 'pistache', 'macadamia', 'castanha de caju'], excecoes: ['castanha portuguesa'] },
  soja: { rotulo: 'Soja', palavras: ['soja', 'tofu', 'missô', 'misso', 'shoyu', 'edamame'], excecoes: ['oleo de soja'] },
  peixe: { rotulo: 'Peixe', palavras: ['peixe', 'atum', 'sardinha', 'tilapia', 'salmao', 'bacalhau', 'pescada', 'merluza', 'tainha', 'pintado', 'tambaqui', 'pirarucu', 'corvina', 'anchova', 'manjuba'], excecoes: [] },
  crustaceos: { rotulo: 'Frutos do mar', palavras: ['camarao', 'lagosta', 'caranguejo', 'siri', 'crustaceo', 'marisco', 'mexilhao', 'ostra', 'lula', 'polvo', 'molusco', 'sururu'], excecoes: [] },
} as const
export type Alergeno = keyof typeof ALERGENOS

export function alergenosEstimados(nome: string): Alergeno[] {
  const n = ' ' + semAcento(nome).replace(/,/g, '') + ' '
  return (Object.keys(ALERGENOS) as Alergeno[]).filter(k => {
    const { palavras, excecoes } = ALERGENOS[k]
    const limpo = excecoes.reduce((s, e) => s.split(semAcento(e)).join(' '), n)
    return palavras.some(p => limpo.includes(semAcento(p)))
  })
}

// Para dietas vegetariana/vegana (também estimado pelo nome).
const CARNES = ['carne', 'frango', 'boi', 'porco', 'suino', 'bovina', 'linguica', 'salsicha', 'presunto', 'peru', 'bacon', 'toucinho', 'calabresa', 'mortadela', 'salame', 'figado', 'cordeiro', 'carneiro', 'cabrito', 'pato', 'charque', 'feijoada', 'hamburguer', 'almondega', 'moela', 'costela', 'picanha', 'alcatra', 'patinho', 'acem', 'file', 'coxa']
export function temCarne(nome: string) {
  const n = semAcento(nome)
  if (n.includes('vegano') || n.includes('vegetal') || n.includes('soja, queijo') || n.includes('tofu')) return false
  return CARNES.some(c => n.includes(c)) || alergenosEstimados(nome).some(a => a === 'peixe' || a === 'crustaceos')
}
export function temOrigemAnimal(nome: string) {
  const n = semAcento(nome)
  if (n.includes('vegano')) return false
  return temCarne(nome) || alergenosEstimados(nome).some(a => a === 'leite' || a === 'ovo') || n.includes('mel, de abelha') || n.startsWith('mel ')
}
