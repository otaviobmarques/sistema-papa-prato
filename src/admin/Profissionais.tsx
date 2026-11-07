import { useEffect, useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import { avisar } from '../components/ui'
import { supabase } from '../lib/supabase'
import { Cabecalho } from './Modulos'

// A12 Profissionais: a equipe confere o CRN no conselho e aprova ou recusa. Não mostra dados de pacientes.
type Prof = { user_id: string; nome: string; crn: string; uf: string; regiao_crn: number; status: 'pendente' | 'verificado' | 'recusado'; motivo: string | null; criado_em: string; verificado_em: string | null }
const quando = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function Profissionais() {
  const [lista, setLista] = useState<Prof[] | null>(null)
  const [filtro, setFiltro] = useState<'pendente' | 'verificado' | 'recusado'>('pendente')
  const carregar = () => supabase!.from('profissionais').select('user_id,nome,crn,uf,regiao_crn,status,motivo,criado_em,verificado_em').order('criado_em', { ascending: false }).then(({ data, error }) => { if (error) avisar(error.message); setLista((data as Prof[]) ?? []) })
  useEffect(() => { carregar() }, [])
  const decidir = async (p: Prof, decisao: 'verificado' | 'recusado') => {
    const motivo = decisao === 'recusado' ? prompt('Motivo da recusa (o profissional vai ver):', 'Não encontramos esse registro ativo no conselho.') : null
    if (decisao === 'recusado' && motivo === null) return
    const { error } = await supabase!.rpc('profissional_decidir', { profissional: p.user_id, decisao, motivo })
    if (error) avisar(error.message); else { avisar(decisao === 'verificado' ? `${p.nome} aprovado(a).` : 'Recusado.'); carregar() }
  }
  const itens = lista?.filter(p => p.status === filtro) ?? []
  const n = (s: Prof['status']) => lista?.filter(p => p.status === s).length ?? 0
  return (
    <>
      <Cabecalho titulo="Profissionais" texto="Nutricionistas pedem acesso em /app/#profissional. Confira o nome e o número no site do CRN da região (consulta de inscritos) antes de aprovar. Aprovados ganham um código para os pacientes." acoes={<button className="btn ghost sm" onClick={carregar}><RefreshCw size={16} /> Atualizar</button>} />
      <div className="row" style={{ gap: 8 }}>
        {(['pendente', 'verificado', 'recusado'] as const).map(s => <button key={s} className="chip" aria-pressed={filtro === s} onClick={() => setFiltro(s)}>{{ pendente: 'Aguardando', verificado: 'Aprovados', recusado: 'Recusados' }[s]} ({n(s)})</button>)}
      </div>
      {lista && !itens.length && <div className="card small muted">Nada por aqui.</div>}
      {!!itens.length && (
        <div className="tabela-box"><table className="tabela"><thead><tr><th>Nome</th><th>Registro</th><th>Pedido em</th><th>{filtro === 'pendente' ? 'Decisão' : 'Decidido em'}</th></tr></thead>
          <tbody>{itens.map(p => (
            <tr key={p.user_id}>
              <td><b>{p.nome}</b>{p.motivo && <div className="tiny">{p.motivo}</div>}</td>
              <td className="num">CRN-{p.regiao_crn} {p.crn}/{p.uf}</td>
              <td className="small">{quando(p.criado_em)}</td>
              <td>{filtro === 'pendente'
                ? <div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => decidir(p, 'verificado')}><Check size={15} /> Aprovar</button><button className="btn ghost sm" onClick={() => decidir(p, 'recusado')}><X size={15} /> Recusar</button></div>
                : <span className="small">{quando(p.verificado_em)} {filtro === 'verificado' && <button className="link tiny" onClick={() => decidir(p, 'recusado')}>suspender</button>}</span>}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </>
  )
}
