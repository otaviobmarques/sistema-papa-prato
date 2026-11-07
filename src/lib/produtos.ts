// Produtos industrializados pelo código de barras, consultados no Open Food Facts (licença ODbL).
// Consulta produto a produto, como combinado no fontes-ref: não copiamos a base deles.
import type { Alergeno } from './alergias'
import { semAcento, type Alimento } from './alimentos'
import type { Produto } from './store'

const MAPA_ALERGENOS: Record<string, Alergeno> = {
  'en:milk': 'leite', 'en:eggs': 'ovo', 'en:gluten': 'gluten', 'en:peanuts': 'amendoim', 'en:nuts': 'castanhas',
  'en:soybeans': 'soja', 'en:fish': 'peixe', 'en:crustaceans': 'crustaceos', 'en:molluscs': 'crustaceos',
}

export const codigoValido = (c: string) => /^\d{8}$|^\d{12,14}$/.test(c)

export async function buscarProduto(codigo: string): Promise<Produto> {
  const c = codigo.replace(/\D/g, '')
  if (!codigoValido(c)) throw new Error('Código inválido. Ele tem 8 ou 13 números, embaixo das barras.')
  const campos = 'code,product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity,allergens_tags,traces_tags,image_front_small_url'
  let r: Response
  try { r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${campos}`) }
  catch { throw new Error('Sem conexão. Verifique a internet e tente de novo.') }
  if (r.status === 404) throw new Error('Produto não encontrado no Open Food Facts. Busque pelo nome ou cadastre lá pelo app deles.')
  if (!r.ok) throw new Error('O Open Food Facts não respondeu agora. Tente de novo em instantes.')
  const j = await r.json()
  if (j.status !== 1 || !j.product) throw new Error('Produto não encontrado no Open Food Facts. Busque pelo nome.')
  const p = j.product
  const n = p.nutriments ?? {}
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : undefined)
  if (kcal == null) throw new Error('Esse produto está no Open Food Facts, mas sem tabela nutricional. Busque pelo nome.')
  const nome = (p.product_name_pt || p.product_name || 'Produto sem nome').trim()
  const g = Number(p.serving_quantity)
  return {
    id: 'off_' + c, codigo: c, nome, marca: p.brands?.split(',')[0]?.trim() || undefined,
    kcal: Math.round(kcal), proteina: +(n.proteins_100g ?? 0), carboidrato: +(n.carbohydrates_100g ?? 0), gordura: +(n.fat_100g ?? 0),
    fibra: n.fiber_100g != null ? +n.fiber_100g : null, sodio: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) : null,
    porcao: g > 0 ? { nome: 'porção do rótulo', gramas: g } : undefined,
    alergenos: [...new Set([...(p.allergens_tags ?? []), ...(p.traces_tags ?? [])].map((t: string) => MAPA_ALERGENOS[t]).filter(Boolean))] as string[],
    imagem: p.image_front_small_url || undefined,
  }
}

export function produtoParaAlimento(p: Produto): Alimento {
  const nome = p.marca ? `${p.nome} (${p.marca})` : p.nome
  return {
    id: p.id, nome, fonte: 'OFF', kcal: p.kcal, proteina: p.proteina, carboidrato: p.carboidrato, gordura: p.gordura,
    fibra: p.fibra, sodio: p.sodio, medidas: p.porcao ? [p.porcao] : [], termos: p.codigo, busca: semAcento(nome + ' ' + p.codigo),
    alergenosRotulo: p.alergenos, marca: p.marca,
  }
}
