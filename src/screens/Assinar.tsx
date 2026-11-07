import { useEffect, useState } from 'react'
import { CheckCircle2, CreditCard, ExternalLink, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { Mascot } from '../components/Mascot'
import { FormularioLink } from '../components/Conta'
import { Assinatura as CreditoDomma } from '../components/Assinatura'
import { useSessao } from '../lib/supabase'
import { sairDaConta } from '../lib/sync'
import { useEstado } from '../lib/store'
import { assinar, carregarPlanos, conferirAcessoDeNovo, formatarCpf, reais, type Acesso, type PlanoVenda } from '../lib/assinatura'

const INCLUSO = ['Cardápio da semana do seu jeito', 'Foto do prato com IA e código de barras', '18 mil alimentos brasileiros (TACO/TBCA)', 'Lista de compras, água, diário e conquistas', 'Seus dados salvos e em todos os aparelhos']

// Tela de assinatura: aparece depois do questionário inicial e sempre que o período pago acaba.
export function Assinar({ acesso }: { acesso: Acesso | null }) {
  const sessao = useSessao()
  const apelido = useEstado(e => e.perfil?.apelido)
  const [planos, setPlanos] = useState<PlanoVenda[] | null>(null)
  const [erroPlanos, setErroPlanos] = useState('')
  const [escolhido, setEscolhido] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [link, setLink] = useState<string | null>(acesso?.link_pagamento ?? null)

  useEffect(() => {
    carregarPlanos().then(l => { setPlanos(l); setEscolhido(c => c || (l.find(p => p.destaque) ?? l[0])?.id || '') }).catch(e => setErroPlanos((e as Error).message))
  }, [])
  useEffect(() => { if (acesso?.link_pagamento) setLink(acesso.link_pagamento) }, [acesso?.link_pagamento])

  const mensal = planos?.find(p => p.meses === 1)
  const plano = planos?.find(p => p.id === escolhido)
  const aguardando = !!link && acesso?.status !== 'atrasada'

  const irParaPagamento = async (ev: React.FormEvent) => {
    ev.preventDefault(); setErro(''); setEnviando(true)
    const janela = window.open('', '_blank') // abre já no clique, para o navegador não bloquear
    try {
      const r = await assinar(escolhido, nome, cpf)
      setLink(r.link)
      if (r.link && janela) janela.location.href = r.link
      else { janela?.close(); if (r.link) location.href = r.link }
      conferirAcessoDeNovo()
    } catch (e) { janela?.close(); setErro((e as Error).message) }
    setEnviando(false)
  }

  const titulo = acesso?.status === 'atrasada' ? 'Seu pagamento está em aberto'
    : acesso?.status === 'cancelada' || (acesso?.pago_ate && new Date(acesso.pago_ate) < new Date()) ? 'Sua assinatura terminou'
    : `${apelido ? apelido + ', s' : 'S'}eu cardápio está pronto!`
  const texto = acesso?.status === 'atrasada' ? 'Pague a cobrança em aberto para continuar usando o Papa Prato. Seus dados estão guardados.'
    : acesso?.status === 'cancelada' ? 'Assine de novo para voltar de onde parou. Seu diário e suas conquistas continuam aqui.'
    : 'Escolha um plano para liberar o Papa Prato. Tudo incluído, sem recurso escondido.'

  return (
    <div className="onb">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Mascot size={84} humor="feliz" />
        <div className="balao grow"><b>{titulo}</b><div className="small" style={{ marginTop: 4 }}>{texto}</div></div>
      </div>

      {!sessao ? (
        <div className="card stack">
          <h2>Primeiro, crie sua conta</h2>
          <p className="small muted">É com ela que sua assinatura fica guardada e que você entra em qualquer aparelho.</p>
          <FormularioLink textoBotao="Criar conta e continuar" />
          <a className="link small" href="#admin">Sou da equipe: entrar com usuário e senha</a>
        </div>
      ) : acesso?.status === 'atrasada' && acesso.link_pagamento ? (
        <div className="card stack">
          <a className="btn block" href={acesso.link_pagamento} target="_blank" rel="noopener"><CreditCard size={18} /> Pagar agora</a>
          <button className="btn ghost block" onClick={conferirAcessoDeNovo}><RefreshCw size={18} /> Já paguei, conferir</button>
        </div>
      ) : aguardando ? (
        <div className="card stack">
          <h2>Falta só o pagamento</h2>
          <p className="small">Abrimos a página segura do Asaas para você pagar com <b>Pix, cartão ou boleto</b>. Assim que o pagamento for confirmado, o app libera sozinho.</p>
          <ul className="small stack" style={{ gap: 4, paddingLeft: 18, margin: 0 }}><li>Pix e cartão: em poucos segundos</li><li>Boleto: até 3 dias úteis</li></ul>
          <a className="btn block" href={link!} target="_blank" rel="noopener"><ExternalLink size={18} /> Abrir a página de pagamento</a>
          <button className="btn ghost block" onClick={conferirAcessoDeNovo}><RefreshCw size={18} /> Já paguei, conferir</button>
          <button className="link small" onClick={() => setLink(null)}>Escolher outro plano</button>
        </div>
      ) : (
        <form className="stack" onSubmit={irParaPagamento}>
          {erroPlanos && <div className="card peach small">Não foi possível carregar os planos: {erroPlanos}</div>}
          {!planos && !erroPlanos && <div className="card small muted">Carregando planos…</div>}
          <div className="stack" role="radiogroup" aria-label="Plano" style={{ gap: 10 }}>
            {planos?.map(p => {
              const porMes = p.preco / p.meses, desc = mensal && p.meses > 1 ? Math.round((1 - porMes / mensal.preco) * 100) : 0
              return (
                <button type="button" key={p.id} role="radio" aria-checked={escolhido === p.id} onClick={() => setEscolhido(p.id)} className="card"
                  style={{ textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 10px', border: 0, cursor: 'pointer', boxShadow: escolhido === p.id ? 'inset 0 0 0 2.5px var(--orange)' : 'inset 0 0 0 1.5px var(--line)' }}>
                  <b className="row" style={{ gap: 8 }}>{p.nome}{p.destaque && <span className="tag">mais vantajoso</span>}</b>
                  <b className="num" style={{ fontSize: '1.25rem', textAlign: 'right' }}>{reais(p.preco)}</b>
                  <span className="tiny">{p.descricao}</span>
                  <span className="tiny" style={{ textAlign: 'right' }}>{p.meses === 1 ? 'por mês' : `${reais(porMes)}/mês${desc > 0 ? ` · ${desc}% off` : ''}`}</span>
                </button>
              )
            })}
          </div>

          <div className="card soft small stack" style={{ gap: 6 }}>
            {INCLUSO.map(t => <div key={t} className="row" style={{ gap: 8 }}><CheckCircle2 size={16} color="var(--green)" /> {t}</div>)}
          </div>

          <div className="card stack">
            <div className="field"><label htmlFor="ass-nome">Nome completo</label><input id="ass-nome" className="input" autoComplete="name" required value={nome} onChange={e => setNome(e.target.value)} placeholder="Como está no seu documento" /></div>
            <div className="field"><label htmlFor="ass-cpf">CPF</label><input id="ass-cpf" className="input num" inputMode="numeric" autoComplete="off" required value={cpf} onChange={e => setCpf(formatarCpf(e.target.value))} placeholder="000.000.000-00" /></div>
            <p className="tiny">O Asaas pede nome e CPF para emitir a cobrança. Não guardamos seu CPF no app.</p>
            {erro && <p className="small" style={{ color: 'var(--red)' }}>{erro}</p>}
            <button className="btn block" disabled={!plano || enviando}>{enviando ? 'Preparando…' : plano ? `Assinar por ${reais(plano.preco)}` : 'Escolha um plano'}</button>
            <p className="tiny row" style={{ gap: 6 }}><ShieldCheck size={14} /> Pagamento seguro pelo Asaas: Pix, cartão ou boleto. Renova sozinho; cancele quando quiser no Perfil.</p>
          </div>
        </form>
      )}

      {sessao && <button className="link small" style={{ alignSelf: 'center' }} onClick={() => sairDaConta()}><LogOut size={14} /> Sair da conta {sessao.user.email && !sessao.user.email.endsWith('.invalid') ? `(${sessao.user.email})` : ''}</button>}
      <CreditoDomma />
    </div>
  )
}
