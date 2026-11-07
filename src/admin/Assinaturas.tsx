import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fmt } from '../components/ui'
import { supabase } from '../lib/supabase'
import { reais } from '../lib/assinatura'
import { Cabecalho } from './Modulos'

// A07 Assinaturas: números agregados e os últimos avisos do Asaas. Não mostra CPF, nome nem dados de saúde.
type Painel = {
  ativas: number; atrasadas: number; pendentes: number; canceladas: number; profissionais_ativos: number; receita_mensal: number
  por_plano: { id: string; nome: string; ativas: number }[]
  eventos: { evento: string; ambiente: string; recebido_em: string; valor: number | null; status: string | null; processado: boolean }[]
}
const NOMES: Record<string, string> = {
  PAYMENT_CREATED: 'Cobrança criada', PAYMENT_CONFIRMED: 'Pagamento confirmado', PAYMENT_RECEIVED: 'Pagamento recebido', PAYMENT_OVERDUE: 'Cobrança vencida',
  PAYMENT_REFUNDED: 'Estornado', PAYMENT_DELETED: 'Cobrança removida', SUBSCRIPTION_CREATED: 'Assinatura criada', SUBSCRIPTION_UPDATED: 'Assinatura alterada',
  SUBSCRIPTION_INACTIVATED: 'Assinatura inativada', SUBSCRIPTION_DELETED: 'Assinatura cancelada',
}

export function Assinaturas() {
  const [d, setD] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')
  const carregar = () => supabase!.rpc('painel_assinaturas').then(({ data, error }) => { setErro(error?.message ?? ''); if (data) setD(data as Painel) })
  useEffect(() => { carregar() }, [])
  return (
    <>
      <Cabecalho titulo="Assinaturas" texto="Quem paga o Papa Prato, em números. Os pagamentos acontecem no Asaas; aqui chegam os avisos dele (webhook)." acoes={<button className="btn ghost sm" onClick={carregar}><RefreshCw size={16} /> Atualizar</button>} />
      {erro && <div className="card peach small">Não foi possível carregar: {erro}</div>}
      {d && (
        <>
          <div className="kpis">
            <div className="kpi"><small>Pacientes assinantes</small><strong>{fmt(d.ativas)}</strong><small>{d.por_plano.filter(p => (p as { publico?: string }).publico !== 'profissional').map(p => `${p.nome} ${p.ativas}`).join(' · ')}</small></div>
            <div className="kpi"><small>Nutricionistas assinantes</small><strong>{fmt(d.profissionais_ativos ?? 0)}</strong><small>planos profissionais em dia</small></div>
            <div className="kpi"><small>Receita mensal estimada</small><strong>{reais(Number(d.receita_mensal))}</strong><small>planos longos divididos por mês</small></div>
            <div className="kpi" style={{ boxShadow: d.atrasadas ? 'inset 0 0 0 2px var(--orange)' : undefined }}><small>Pagamento em aberto</small><strong>{fmt(d.atrasadas)}</strong><small>cobrança vencida</small></div>
            <div className="kpi"><small>Aguardando 1º pagamento</small><strong>{fmt(d.pendentes)}</strong><small>{fmt(d.canceladas)} canceladas</small></div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Últimos avisos do Asaas</h3>
            {d.eventos.length ? (
              <div className="tabela-box" style={{ boxShadow: 'none' }}><table className="tabela"><thead><tr><th>Quando</th><th>Evento</th><th>Ambiente</th><th className="n">Valor</th><th>Situação</th></tr></thead>
                <tbody>{d.eventos.map((e, i) => <tr key={i}><td>{new Date(e.recebido_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{NOMES[e.evento] ?? e.evento}</td><td>{e.ambiente === 'sandbox' ? <span className="tag gray">teste</span> : 'produção'}</td><td className="n">{e.valor != null ? reais(Number(e.valor)) : '—'}</td><td className="tiny">{e.status ?? ''}{e.processado ? '' : ' · só registrado'}</td></tr>)}</tbody></table></div>
            ) : <p className="muted small">Nenhum aviso recebido ainda. Configure o webhook no Asaas (Integrações → Webhooks).</p>}
          </div>
        </>
      )}
    </>
  )
}
