import type { Refeicao } from '../lib/store'

// Modelos de refeição do cardápio. Cada item aponta para um alimento real da base
// (TACO/TBCA) e uma quantidade de referência; o app ajusta as porções à meta da pessoa.
// `fixo` = quantidade que não escala (ex.: café, azeite).
export type ItemModelo = { id: string; g: number; fixo?: boolean }
export type Modelo = { id: string; refeicao: Refeicao; nome: string; itens: ItemModelo[]; regioes?: string[]; tempo: 'rapido' | 'medio' | 'longo' }

export const MODELOS: Modelo[] = [
  // café da manhã
  { id: 'c1', refeicao: 'cafe', nome: 'Pão francês com queijo e mamão', tempo: 'rapido', itens: [{ id: 'tbca_brc0002a', g: 50 }, { id: 'tbca_brc0052g', g: 30 }, { id: 'taco_226', g: 150 }, { id: 'taco_471', g: 100, fixo: true }] },
  { id: 'c2', refeicao: 'cafe', nome: 'Cuscuz com ovo', tempo: 'rapido', regioes: ['nordeste'], itens: [{ id: 'taco_533', g: 150 }, { id: 'taco_488', g: 50 }, { id: 'taco_471', g: 100, fixo: true }] },
  { id: 'c3', refeicao: 'cafe', nome: 'Tapioca com queijo e banana', tempo: 'rapido', regioes: ['nordeste', 'norte'], itens: [{ id: 'taco_551', g: 60 }, { id: 'tbca_brc0052g', g: 30 }, { id: 'taco_182', g: 70 }] },
  { id: 'c4', refeicao: 'cafe', nome: 'Iogurte com aveia, banana e mel', tempo: 'rapido', itens: [{ id: 'taco_448', g: 170 }, { id: 'taco_7', g: 20 }, { id: 'taco_182', g: 70 }, { id: 'taco_507', g: 10 }] },
  { id: 'c5', refeicao: 'cafe', nome: 'Pão integral com pasta de amendoim e banana', tempo: 'rapido', itens: [{ id: 'taco_52', g: 50 }, { id: 'tbca_brc0290t', g: 15 }, { id: 'taco_182', g: 70 }, { id: 'taco_471', g: 100, fixo: true }] },
  { id: 'c6', refeicao: 'cafe', nome: 'Cuscuz com tofu e tomate', tempo: 'rapido', regioes: ['nordeste'], itens: [{ id: 'taco_533', g: 150 }, { id: 'tbca_brc0056t', g: 70 }, { id: 'taco_157', g: 40 }, { id: 'taco_471', g: 100, fixo: true }] },
  { id: 'c7', refeicao: 'cafe', nome: 'Aveia com maçã e castanha', tempo: 'rapido', itens: [{ id: 'taco_7', g: 30 }, { id: 'taco_222', g: 130 }, { id: 'taco_589', g: 8 }] },
  // almoço
  { id: 'a1', refeicao: 'almoco', nome: 'Arroz, feijão, frango grelhado e salada', tempo: 'medio', itens: [{ id: 'taco_3', g: 120 }, { id: 'taco_561', g: 140 }, { id: 'taco_410', g: 100 }, { id: 'taco_78', g: 30 }, { id: 'taco_157', g: 50 }, { id: 'taco_260', g: 5, fixo: true }] },
  { id: 'a2', refeicao: 'almoco', nome: 'Arroz, feijão preto, patinho e couve', tempo: 'medio', regioes: ['sudeste', 'sul'], itens: [{ id: 'taco_3', g: 120 }, { id: 'taco_567', g: 140 }, { id: 'taco_377', g: 100 }, { id: 'taco_116', g: 40 }, { id: 'taco_109', g: 50 }] },
  { id: 'a3', refeicao: 'almoco', nome: 'Arroz integral, lentilha, tofu e brócolis', tempo: 'medio', itens: [{ id: 'taco_1', g: 120 }, { id: 'taco_577', g: 120 }, { id: 'tbca_brc0056t', g: 100 }, { id: 'taco_100', g: 80 }, { id: 'taco_260', g: 5, fixo: true }] },
  { id: 'a4', refeicao: 'almoco', nome: 'Mandioca com carne de panela e couve', tempo: 'longo', regioes: ['nordeste', 'norte', 'centro-oeste'], itens: [{ id: 'taco_129', g: 150 }, { id: 'taco_328', g: 100 }, { id: 'taco_116', g: 40 }, { id: 'taco_157', g: 40 }] },
  { id: 'a5', refeicao: 'almoco', nome: 'Macarrão com carne moída e legumes', tempo: 'medio', regioes: ['sudeste', 'sul'], itens: [{ id: 'tbca_brc0116a', g: 150 }, { id: 'taco_326', g: 90 }, { id: 'taco_157', g: 60 }, { id: 'taco_100', g: 60 }] },
  { id: 'a6', refeicao: 'almoco', nome: 'Tilápia, batata-doce e abobrinha', tempo: 'medio', regioes: ['centro-oeste', 'norte'], itens: [{ id: 'taco_88', g: 150 }, { id: 'tbca_brc0486e', g: 120 }, { id: 'taco_72', g: 80 }, { id: 'taco_78', g: 30 }] },
  { id: 'a7', refeicao: 'almoco', nome: 'Arroz, feijão, ovo e salada', tempo: 'rapido', itens: [{ id: 'taco_3', g: 120 }, { id: 'taco_561', g: 140 }, { id: 'taco_490', g: 50 }, { id: 'taco_78', g: 30 }, { id: 'taco_97', g: 50 }] },
  { id: 'a8', refeicao: 'almoco', nome: 'Grão-de-bico com arroz e abóbora', tempo: 'medio', itens: [{ id: 'tbca_brc0278t', g: 160 }, { id: 'taco_3', g: 100 }, { id: 'taco_64', g: 100 }, { id: 'taco_78', g: 30 }] },
  { id: 'a9', refeicao: 'almoco', nome: 'Feijoada com arroz, couve e laranja', tempo: 'longo', regioes: ['sudeste'], itens: [{ id: 'taco_540', g: 200 }, { id: 'taco_3', g: 100 }, { id: 'taco_116', g: 40 }, { id: 'taco_208', g: 100 }] },
  // lanche
  { id: 'l1', refeicao: 'lanche', nome: 'Maçã com castanha-do-pará', tempo: 'rapido', regioes: ['norte'], itens: [{ id: 'taco_222', g: 130 }, { id: 'taco_589', g: 8 }] },
  { id: 'l2', refeicao: 'lanche', nome: 'Iogurte com morango', tempo: 'rapido', itens: [{ id: 'taco_448', g: 170 }, { id: 'taco_239', g: 80 }] },
  { id: 'l3', refeicao: 'lanche', nome: 'Banana com pasta de amendoim', tempo: 'rapido', itens: [{ id: 'taco_182', g: 70 }, { id: 'tbca_brc0290t', g: 15 }] },
  { id: 'l4', refeicao: 'lanche', nome: 'Pão de queijo com café', tempo: 'rapido', regioes: ['sudeste', 'centro-oeste'], itens: [{ id: 'taco_140', g: 40 }, { id: 'taco_471', g: 100, fixo: true }] },
  { id: 'l5', refeicao: 'lanche', nome: 'Abacaxi', tempo: 'rapido', itens: [{ id: 'taco_164', g: 150 }] },
  { id: 'l6', refeicao: 'lanche', nome: 'Manga', tempo: 'rapido', regioes: ['nordeste'], itens: [{ id: 'taco_231', g: 150 }] },
  // jantar
  { id: 'j1', refeicao: 'jantar', nome: 'Arroz, feijão, frango e abobrinha', tempo: 'medio', itens: [{ id: 'taco_3', g: 100 }, { id: 'taco_561', g: 120 }, { id: 'taco_410', g: 100 }, { id: 'taco_72', g: 80 }] },
  { id: 'j2', refeicao: 'jantar', nome: 'Omelete simples com salada e pão integral', tempo: 'rapido', itens: [{ id: 'taco_490', g: 100 }, { id: 'taco_78', g: 40 }, { id: 'taco_157', g: 60 }, { id: 'taco_52', g: 25 }] },
  { id: 'j3', refeicao: 'jantar', nome: 'Batata com carne de panela, cenoura e chuchu', tempo: 'longo', itens: [{ id: 'taco_91', g: 150 }, { id: 'taco_328', g: 80 }, { id: 'taco_109', g: 60 }, { id: 'taco_112', g: 60 }] },
  { id: 'j4', refeicao: 'jantar', nome: 'Cuscuz com frango e tomate', tempo: 'rapido', regioes: ['nordeste'], itens: [{ id: 'taco_533', g: 150 }, { id: 'taco_410', g: 80 }, { id: 'taco_157', g: 50 }] },
  { id: 'j5', refeicao: 'jantar', nome: 'Arroz integral, feijão preto, tofu e brócolis', tempo: 'medio', itens: [{ id: 'taco_1', g: 100 }, { id: 'taco_567', g: 120 }, { id: 'tbca_brc0056t', g: 80 }, { id: 'taco_100', g: 80 }] },
  { id: 'j6', refeicao: 'jantar', nome: 'Inhame com ovo cozido e salada', tempo: 'rapido', regioes: ['nordeste', 'sudeste'], itens: [{ id: 'tbca_brc0342b', g: 150 }, { id: 'taco_488', g: 100 }, { id: 'taco_78', g: 30 }, { id: 'taco_157', g: 50 }] },
  { id: 'j7', refeicao: 'jantar', nome: 'Tilápia com abóbora e brócolis', tempo: 'medio', itens: [{ id: 'tbca_brc0486e', g: 120 }, { id: 'taco_64', g: 150 }, { id: 'taco_100', g: 80 }, { id: 'taco_260', g: 5, fixo: true }] },
]

export type Receita = {
  id: string; nome: string; emoji: string; minutos: number; porcoes: number; regiao: string
  itens: { id: string; g: number; texto: string }[] // por porção
  extras: string[] // temperos e itens sem valor nutricional relevante
  passos: string[]
}

export const RECEITAS: Receita[] = [
  { id: 'r1', nome: 'Cuscuz nordestino com ovo', emoji: '🌽', minutos: 15, porcoes: 1, regiao: 'Nordeste',
    itens: [{ id: 'taco_533', g: 150, texto: '1 prato raso de cuscuz de milho' }, { id: 'taco_488', g: 50, texto: '1 ovo cozido' }, { id: 'taco_157', g: 40, texto: '½ tomate picado' }, { id: 'taco_260', g: 3, texto: '1 fio de azeite' }],
    extras: ['sal a gosto', 'coentro'],
    passos: ['Hidrate a flocão com água e sal por 10 minutos.', 'Cozinhe no vapor (cuscuzeira) por 10 minutos.', 'Cozinhe o ovo por 10 minutos.', 'Sirva com tomate, coentro e um fio de azeite.'] },
  { id: 'r2', nome: 'Escondidinho de mandioca', emoji: '🥘', minutos: 45, porcoes: 1, regiao: 'Nordeste',
    itens: [{ id: 'taco_129', g: 150, texto: '1 xícara de mandioca cozida amassada' }, { id: 'taco_326', g: 100, texto: '100 g de carne moída refogada' }, { id: 'taco_463', g: 15, texto: '1 fatia de muçarela' }],
    extras: ['cebola, alho e cheiro-verde'],
    passos: ['Cozinhe a mandioca até ficar macia e amasse como purê.', 'Refogue a carne com cebola e alho.', 'Monte: carne no fundo, purê por cima e queijo.', 'Leve ao forno por 15 minutos para gratinar.'] },
  { id: 'r3', nome: 'Tilápia grelhada com abóbora', emoji: '🐟', minutos: 30, porcoes: 1, regiao: 'Centro-Oeste',
    itens: [{ id: 'tbca_brc0486e', g: 120, texto: '1 filé de tilápia' }, { id: 'taco_64', g: 150, texto: '1 xícara de abóbora cabotiá' }, { id: 'taco_100', g: 80, texto: '1 xícara de brócolis' }, { id: 'taco_260', g: 5, texto: '1 colher de chá de azeite' }],
    extras: ['limão, sal e pimenta'],
    passos: ['Tempere o peixe com limão e sal.', 'Grelhe 4 minutos de cada lado.', 'Cozinhe a abóbora e o brócolis no vapor.', 'Finalize com azeite.'] },
  { id: 'r4', nome: 'Tofu acebolado com arroz integral', emoji: '🥢', minutos: 25, porcoes: 1, regiao: 'Todas',
    itens: [{ id: 'tbca_brc0056t', g: 120, texto: '120 g de tofu firme' }, { id: 'taco_1', g: 120, texto: '4 colheres de sopa de arroz integral' }, { id: 'taco_100', g: 80, texto: '1 xícara de brócolis' }, { id: 'taco_260', g: 5, texto: '1 colher de chá de azeite' }],
    extras: ['1 cebola em tiras', 'shoyu (opcional — contém soja)'],
    passos: ['Seque o tofu e corte em cubos.', 'Doure no azeite com a cebola.', 'Cozinhe o brócolis no vapor.', 'Sirva com o arroz integral.'] },
  { id: 'r5', nome: 'Salada de grão-de-bico', emoji: '🥗', minutos: 10, porcoes: 1, regiao: 'Todas',
    itens: [{ id: 'tbca_brc0278t', g: 150, texto: '1 concha de grão-de-bico cozido' }, { id: 'taco_157', g: 60, texto: '½ tomate' }, { id: 'taco_142', g: 50, texto: '½ pepino' }, { id: 'taco_78', g: 30, texto: 'folhas de alface' }, { id: 'taco_260', g: 5, texto: '1 colher de chá de azeite' }],
    extras: ['limão, sal e salsinha'],
    passos: ['Escorra o grão-de-bico.', 'Pique tomate e pepino.', 'Misture tudo e tempere com limão, azeite e sal.'] },
  { id: 'r6', nome: 'Vitamina de banana com aveia', emoji: '🍌', minutos: 5, porcoes: 1, regiao: 'Todas',
    itens: [{ id: 'taco_448', g: 170, texto: '1 pote de iogurte natural' }, { id: 'taco_182', g: 70, texto: '1 banana prata' }, { id: 'taco_7', g: 15, texto: '1 colher de sopa de aveia' }, { id: 'taco_507', g: 10, texto: '1 colher de chá de mel' }],
    extras: ['canela (opcional)'],
    passos: ['Bata tudo no liquidificador.', 'Sirva gelado.'] },
  { id: 'r7', nome: 'Feijoada de domingo', emoji: '🍲', minutos: 120, porcoes: 1, regiao: 'Sudeste',
    itens: [{ id: 'taco_540', g: 250, texto: '1 concha grande de feijoada' }, { id: 'taco_3', g: 100, texto: '4 colheres de sopa de arroz' }, { id: 'taco_116', g: 40, texto: 'couve refogada' }, { id: 'taco_208', g: 100, texto: '1 laranja' }],
    extras: ['farofa (opcional)'],
    passos: ['Deixe o feijão e as carnes de molho na véspera.', 'Cozinhe na pressão por 40 minutos.', 'Refogue a couve com alho.', 'Sirva com arroz e laranja — a vitamina C ajuda a absorver o ferro do feijão.'] },
]
