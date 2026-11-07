import { useEffect, useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { avisar } from './ui'
import { supabase, useSessao } from '../lib/supabase'

// A12 lado do paciente: vincula o nutricionista pelo código, escolhe se compartilha o diário e pode desfazer.
type Prof = { id: string; nome: string; crn: string; uf: string; regiao_crn: number; compartilha_diario: boolean }

export function MeuNutricionista() {
  const sessao = useSessao()
  const [lista, setLista] = useState<Prof[] | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const carregar = () => supabase!.rpc('meus_profissionais').then(({ data }) => setLista((data as Prof[]) ?? []))
  useEffect(() => { if (sessao && supabase) carregar() }, [sessao?.user.id])
  if (!sessao || !supabase || !lista) return null

  const vincular = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true)
    const { data, error } = await supabase!.rpc('vincular_profissional', { codigo })
    setOcupado(false)
    if (error) avisar(error.message); else { avisar(`Pronto! ${data.nome} agora acompanha você.`); setCodigo(''); carregar() }
  }
  const compartilhar = async (p: Prof, v: boolean) => {
    const { error } = await supabase!.from('vinculos').update({ compartilha_diario: v }).eq('profissional_id', p.id).eq('paciente_id', sessao.user.id)
    if (error) avisar(error.message); else carregar()
  }
  const remover = async (p: Prof) => {
    if (!confirm(`Desfazer o vínculo com ${p.nome}? Ela/ele deixa de ver seus dados na hora.`)) return
    const { error } = await supabase!.from('vinculos').delete().eq('profissional_id', p.id).eq('paciente_id', sessao.user.id)
    if (error) avisar(error.message); else { avisar('Vínculo desfeito.'); carregar() }
  }

  return (
    <div className="card stack">
      <h3 className="row" style={{ gap: 8 }}><Stethoscope size={18} /> Meu nutricionista</h3>
      {lista.map(p => (
        <div key={p.id} className="card soft stack" style={{ gap: 6 }}>
          <div className="row between wrap"><b>{p.nome}</b><span className="tiny">CRN-{p.regiao_crn} {p.crn}/{p.uf}</span></div>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={p.compartilha_diario} onChange={e => compartilhar(p, e.target.checked)} /> Compartilhar meu diário e meu perfil</label>
          <button className="link tiny" style={{ alignSelf: 'flex-start' }} onClick={() => remover(p)}>Desfazer vínculo</button>
        </div>
      ))}
      {lista.length < 3 && (
        <form className="row" style={{ gap: 8 }} onSubmit={vincular}>
          <input className="input grow num" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="Código do profissional" aria-label="Código do profissional" />
          <button className="btn" disabled={codigo.length !== 6 || ocupado}>Vincular</button>
        </form>
      )}
      <p className="tiny">Seu nutricionista vê seu perfil e o diário dos últimos dias só se você deixar marcado. A equipe do Papa Prato não vê.</p>
    </div>
  )
}
