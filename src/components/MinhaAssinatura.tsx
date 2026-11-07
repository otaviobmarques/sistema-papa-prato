import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Folha, avisar } from './ui'
import { cancelarAssinatura, conferirAcessoDeNovo, dataCurta, reais, useAcesso } from '../lib/assinatura'

// Cartão do Perfil: plano atual, validade, cobrança em aberto e cancelamento.
export function MinhaAssinatura() {
  const { acesso } = useAcesso()
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  if (!acesso) return null
  if (acesso.equipe && !acesso.status) return <div className="card small"><b>Acesso da equipe</b><div className="muted">Você usa o app sem assinatura por fazer parte da equipe.</div></div>
  if (!acesso.status) return null
  const ate = acesso.pago_ate ? dataCurta(acesso.pago_ate) : null
  const rotulo = { ativa: 'Ativa', pendente: 'Aguardando pagamento', atrasada: 'Pagamento em aberto', cancelada: 'Cancelada' }[acesso.status]

  return (
    <div className="card stack">
      <div className="row between"><h3 className="row" style={{ gap: 8 }}><CreditCard size={18} /> Minha assinatura</h3><span className={`tag${acesso.status === 'ativa' ? '' : ' gray'}`}>{rotulo}</span></div>
      {acesso.plano_nome && <div className="row between small"><span className="muted">Plano</span><b>{acesso.plano_nome}{acesso.preco ? ` · ${reais(Number(acesso.preco))}` : ''}</b></div>}
      {ate && <div className="row between small"><span className="muted">{acesso.status === 'cancelada' ? 'Acesso até' : 'Próxima renovação'}</span><b>{ate}</b></div>}
      {acesso.ambiente === 'sandbox' && <p className="tiny">Ambiente de teste do Asaas (sandbox): nenhuma cobrança é real.</p>}
      {acesso.link_pagamento && <a className="btn block" href={acesso.link_pagamento} target="_blank" rel="noopener">Pagar cobrança em aberto</a>}
      {acesso.status !== 'cancelada' && <button className="btn ghost block" onClick={() => setConfirmar(true)}>Cancelar assinatura</button>}
      <Folha aberta={confirmar} onFechar={() => setConfirmar(false)} titulo="Cancelar a assinatura?">
        <div className="stack">
          <p>A renovação automática para. {ate ? <>Você continua usando o Papa Prato até <b>{ate}</b>.</> : null} Seus dados continuam guardados se quiser voltar.</p>
          <button className="btn danger block" disabled={ocupado} onClick={async () => {
            setOcupado(true)
            try { await cancelarAssinatura(); avisar('Assinatura cancelada.'); conferirAcessoDeNovo() }
            catch (e) { avisar('Não foi possível cancelar agora: ' + (e as Error).message) }
            setOcupado(false); setConfirmar(false)
          }}>Sim, cancelar</button>
          <button className="btn ghost block" onClick={() => setConfirmar(false)}>Manter assinatura</button>
        </div>
      </Folha>
    </div>
  )
}
