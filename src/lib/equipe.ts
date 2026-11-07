import { useEffect, useState } from 'react'
import { supabase, useSessao } from './supabase'
import { atualizar, obterEstado, type AlimentoPersonalizado } from './store'

export type Papel = 'admin' | 'editor'

export function usePapel(): { carregando: boolean; papel: Papel | null } {
  const sessao = useSessao()
  const [r, setR] = useState<{ carregando: boolean; papel: Papel | null }>({ carregando: true, papel: null })
  useEffect(() => {
    if (!supabase || !sessao) { setR({ carregando: false, papel: null }); return }
    setR({ carregando: true, papel: null })
    supabase.from('papeis').select('papel').eq('user_id', sessao.user.id).maybeSingle()
      .then(({ data }) => setR({ carregando: false, papel: (data?.papel as Papel) ?? null }))
  }, [sessao?.user.id])
  return r
}

const paraLinha = (a: AlimentoPersonalizado, uid?: string) => ({
  id: a.id, nome: a.nome.trim(), kcal: a.kcal, proteina: a.proteina, carboidrato: a.carboidrato, gordura: a.gordura,
  fibra: a.fibra, medidas: a.medidas, publicado: a.publicado, atualizado_em: new Date().toISOString(), atualizado_por: uid,
})

// A equipe vê também os rascunhos.
export async function carregarAlimentosEquipe() {
  if (!supabase) return
  const { data, error } = await supabase.from('alimentos_equipe').select('*').order('nome')
  if (error) throw error
  atualizar(e => ({ ...e, alimentosPersonalizados: data.map(a => ({ id: a.id, nome: a.nome, kcal: +a.kcal, proteina: +a.proteina, carboidrato: +a.carboidrato, gordura: +a.gordura, fibra: a.fibra == null ? null : +a.fibra, medidas: a.medidas, publicado: a.publicado, atualizadoEm: a.atualizado_em })) }), { marcar: false })
}

export async function salvarAlimentoEquipe(a: AlimentoPersonalizado) {
  if (!supabase) return
  const uid = (await supabase.auth.getUser()).data.user?.id
  const { error } = await supabase.from('alimentos_equipe').upsert(paraLinha(a, uid))
  if (error) throw error
  await carregarAlimentosEquipe()
}

export async function excluirAlimentoEquipe(id: string) {
  if (!supabase) return
  const { error } = await supabase.from('alimentos_equipe').delete().eq('id', id)
  if (error) throw error
  await carregarAlimentosEquipe()
}

export async function publicarConteudo() {
  if (!supabase) return
  const uid = (await supabase.auth.getUser()).data.user?.id
  const { error } = await supabase.from('conteudo').upsert({ id: 'mascote', dados: obterEstado().conteudo, atualizado_em: new Date().toISOString(), atualizado_por: uid })
  if (error) throw error
}
