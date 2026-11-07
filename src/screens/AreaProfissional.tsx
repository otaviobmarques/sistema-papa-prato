import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, LogOut, RefreshCw, UserRound } from 'lucide-react'
import { Mascot } from '../components/Mascot'
import { FormularioLink } from '../components/Conta'
import { Assinatura as CreditoDomma } from '../components/Assinatura'
import { Avisos, avisar, fmt } from '../components/ui'
import { supabase, useSessao } from '../lib/supabase'
import { REFEICOES } from '../lib/store'
import { assinar, cancelarAssinatura, carregarPlanos, dataCurta, formatarCpf, reais, type PlanoVenda } from '../lib/assinatura'

// A12 Área do profissional (/app/#profissional): nutricionista com CRN verificado pela equipe acompanha
// os pacientes que digitaram o código dele. O diário só aparece se o paciente autorizou.
type Cadastro = { user_id: string; nome: string; crn: string; uf: string; regiao_crn: number; status: 'pendente' | 'verificado' | 'recusado'; motivo: string | null; codigo: string }
type Paciente = { id: string; apelido: string; objetivo: string | null; desde: string; compartilha_diario: boolean; dias_7: number | null; kcal_media_7: number | null; ultimo_registro: string | null }
type Reg = { nome: string; gramas?: number; refeicao?: string; hora?: string; n?: { kcal?: number; proteina?: number; carboidrato?: number; gordura?: number } }
type Diario = { perfil: Record<string, unknown> | null; pesos?: { data: string; kg: number }[] | null; dias: { data: string; registros: Reg[]; agua: number[] }[] }

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const OBJETIVOS: Record<string, string> = { 'comer-melhor': 'Comer melhor', 'perder-peso': 'Perder peso', 'ganhar-massa': 'Ganhar massa', manter: 'Manter o peso' }
const DIETAS: Record<string, string> = { onivoro: 'Onívora', vegetariano: 'Vegetariana', vegano: 'Vegana' }
const ATIVIDADES: Record<string, string> = { sedentario: 'Sedentária', leve: 'Leve', moderado: 'Moderada', intenso: 'Intensa' }
const dataBr = (d: string) => new Date(d + (d.length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })

export function AreaProfissional() {
  const sessao = useSessao()
  const [cad, setCad] = useState<Cadastro | null | undefined>(undefined)
  const carregar = () => supabase!.from('profissionais').select('*').eq('user_id', sessao!.user.id).maybeSingle().then(({ data }) => setCad((data as Cadastro) ?? null))
  useEffect(() => { if (sessao && supabase) carregar(); else setCad(undefined) }, [sessao?.user.id])

  return (
    <div className="onb" style={{ maxWidth: 760 }}>
      <div className="row between">
        <a className="link small row" href="#" style={{ gap: 4 }} onClick={() => { location.hash = '' }}><ArrowLeft size={16} /> Voltar ao app</a>
        {sessao && <button className="link small row" style={{ gap: 4 }} onClick={() => supabase!.auth.signOut()}><LogOut size={14} /> Sair</button>}
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Mascot size={76} />
        <div className="balao grow"><b>Área do nutricionista</b><div className="small" style={{ marginTop: 4 }}>Acompanhe seus pacientes pelo Papa Prato. Assinatura para profissionais com CRN ativo.</div></div>
      </div>

      {!supabase ? <div className="card small">Contas não configuradas neste ambiente.</div>
        : !sessao ? (
          <div className="card stack"><h2>Entre ou crie sua conta</h2><FormularioLink textoBotao="Receber link de acesso" aoEnviar={() => { try { localStorage.setItem('papa-prato:voltar-profissional', '1') } catch { /* ok */ } }} /></div>
        ) : cad === undefined ? <div className="card small muted">Carregando…</div>
        : !cad || cad.status === 'recusado' ? <FormCadastro anterior={cad} onPronto={carregar} />
        : cad.status === 'pendente' ? (
          <div className="card stack">
            <h2>Cadastro em análise</h2>
            <p className="small">Recebemos seus dados (<b>{cad.nome}</b>, CRN-{cad.regiao_crn} {cad.crn}/{cad.uf}). Nossa equipe confere o registro no conselho e libera seu acesso, normalmente em até 2 dias úteis.</p>
            <button className="btn ghost sm" onClick={carregar}><RefreshCw size={16} /> Conferir de novo</button>
          </div>
        ) : <ComAssinatura cad={cad} />}
      <CreditoDomma />
      <Avisos />
    </div>
  )
}

function FormCadastro({ anterior, onPronto }: { anterior: Cadastro | null; onPronto: () => void }) {
  const [nome, setNome] = useState(anterior?.nome ?? '')
  const [crn, setCrn] = useState(anterior?.crn ?? '')
  const [uf, setUf] = useState(anterior?.uf ?? 'SP')
  const [regiao, setRegiao] = useState(anterior?.regiao_crn ?? 3)
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valido = nome.trim().length >= 5 && /^\d{3,6}$/.test(crn) && ok
  return (
    <form className="card stack" onSubmit={async e => {
      e.preventDefault(); setErro(''); setEnviando(true)
      const { error } = await supabase!.rpc('profissional_cadastrar', { nome, crn, uf, regiao_crn: regiao })
      setEnviando(false); if (error) setErro(error.message); else { avisar('Cadastro enviado!'); onPronto() }
    }}>
      <h2>Cadastro profissional</h2>
      {anterior?.status === 'recusado' && <div className="card peach small">Seu cadastro anterior não foi aprovado{anterior.motivo ? `: ${anterior.motivo}` : '.'} Corrija os dados e envie de novo.</div>}
      <div className="field"><label htmlFor="pr-nome">Nome completo (como no conselho)</label><input id="pr-nome" className="input" value={nome} onChange={e => setNome(e.target.value)} maxLength={80} /></div>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="field" style={{ width: 120 }}><label htmlFor="pr-reg">Região</label><select id="pr-reg" className="input" value={regiao} onChange={e => setRegiao(Number(e.target.value))}>{Array.from({ length: 11 }, (_, i) => <option key={i} value={i + 1}>CRN-{i + 1}</option>)}</select></div>
        <div className="field grow"><label htmlFor="pr-crn">Número do CRN</label><input id="pr-crn" className="input num" inputMode="numeric" value={crn} onChange={e => setCrn(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
        <div className="field" style={{ width: 100 }}><label htmlFor="pr-uf">UF</label><select id="pr-uf" className="input" value={uf} onChange={e => setUf(e.target.value)}>{UFS.map(u => <option key={u}>{u}</option>)}</select></div>
      </div>
      <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} style={{ marginTop: 3 }} /> Declaro que tenho registro ativo no conselho e que vou usar os dados dos pacientes só para acompanhamento nutricional, com o consentimento deles (LGPD).</label>
      {erro && <p className="small" style={{ color: 'var(--red)' }}>{erro}</p>}
      <button className="btn" disabled={!valido || enviando}>{enviando ? 'Enviando…' : 'Enviar para verificação'}</button>
    </form>
  )
}

type AcessoProf = { liberado: boolean; equipe: boolean; status: string | null; plano_nome: string | null; preco: number | null; meses: number | null; limite_pacientes: number | null; pacientes: number; pago_ate: string | null; link_pagamento: string | null; ambiente: string | null }

// O profissional verificado precisa de assinatura em dia para ver pacientes (não há plano grátis).
function ComAssinatura({ cad }: { cad: Cadastro }) {
  const [acesso, setAcesso] = useState<AcessoProf | null>(null)
  const carregar = () => supabase!.rpc('meu_acesso_prof').then(({ data }) => setAcesso(data as AcessoProf))
  useEffect(() => {
    carregar()
    const f = () => { if (document.visibilityState === 'visible') carregar() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  useEffect(() => { if (acesso && !acesso.liberado && acesso.link_pagamento) { const t = setInterval(carregar, 8000); return () => clearInterval(t) } }, [acesso?.liberado, acesso?.link_pagamento])
  if (!acesso) return <div className="card small muted">Carregando…</div>
  if (!acesso.liberado) return <PlanosProf acesso={acesso} onMudou={carregar} />
  return (
    <>
      {!acesso.equipe && (
        <div className="card small row between wrap" style={{ gap: 8 }}>
          <span><b>Plano {acesso.plano_nome}</b> · {acesso.pacientes}{acesso.limite_pacientes ? ` de ${acesso.limite_pacientes}` : ''} pacientes{acesso.pago_ate ? ` · ${acesso.status === 'cancelada' ? 'acesso até' : 'renova em'} ${dataCurta(acesso.pago_ate)}` : ''}</span>
          {acesso.status !== 'cancelada' && <button className="link tiny" onClick={async () => {
            if (!confirm('Cancelar a assinatura? Você mantém o acesso até o fim do período pago.')) return
            try { await cancelarAssinatura('profissional'); avisar('Assinatura cancelada.'); carregar() } catch (e) { avisar((e as Error).message) }
          }}>Cancelar assinatura</button>}
        </div>
      )}
      {acesso.link_pagamento && <a className="btn ghost block" href={acesso.link_pagamento} target="_blank" rel="noopener">Pagar cobrança em aberto</a>}
      <Painel cad={cad} />
    </>
  )
}

function PlanosProf({ acesso, onMudou }: { acesso: AcessoProf; onMudou: () => void }) {
  const [planos, setPlanos] = useState<PlanoVenda[] | null>(null)
  const [escolhido, setEscolhido] = useState('')
  const [nome, setNome] = useState(''), [cpf, setCpf] = useState('')
  const [enviando, setEnviando] = useState(false), [erro, setErro] = useState('')
  const [link, setLink] = useState<string | null>(acesso.status !== 'atrasada' ? acesso.link_pagamento : null)
  useEffect(() => { carregarPlanos('profissional').then(l => { setPlanos(l); setEscolhido((l.find(p => p.destaque) ?? l[0])?.id ?? '') }).catch(e => setErro((e as Error).message)) }, [])
  const plano = planos?.find(p => p.id === escolhido)
  const pagar = async (ev: React.FormEvent) => {
    ev.preventDefault(); setErro(''); setEnviando(true)
    const janela = window.open('', '_blank')
    try { const r = await assinar(escolhido, nome, cpf, 'profissional'); setLink(r.link); if (r.link && janela) janela.location.href = r.link; else { janela?.close(); if (r.link) location.href = r.link } onMudou() }
    catch (e) { janela?.close(); setErro((e as Error).message) }
    setEnviando(false)
  }
  if (acesso.status === 'atrasada' && acesso.link_pagamento) return (
    <div className="card stack"><h2>Pagamento em aberto</h2><p className="small">Pague a cobrança para voltar a ver seus pacientes. Os vínculos continuam guardados.</p>
      <a className="btn block" href={acesso.link_pagamento} target="_blank" rel="noopener">Pagar agora</a><button className="btn ghost block" onClick={onMudou}><RefreshCw size={16} /> Já paguei, conferir</button></div>
  )
  if (link) return (
    <div className="card stack"><h2>Falta só o pagamento</h2><p className="small">Pague na página segura do Asaas (Pix, cartão ou boleto). Assim que for confirmado, sua área libera sozinha.</p>
      <a className="btn block" href={link} target="_blank" rel="noopener">Abrir a página de pagamento</a>
      <button className="btn ghost block" onClick={onMudou}><RefreshCw size={16} /> Já paguei, conferir</button>
      <button className="link small" onClick={() => setLink(null)}>Escolher outro plano</button></div>
  )
  return (
    <form className="stack" onSubmit={pagar}>
      <div className="card small soft">Cadastro verificado. {acesso.status === 'cancelada' ? 'Sua assinatura terminou: assine de novo para voltar a ver seus pacientes.' : 'Escolha um plano para começar a acompanhar seus pacientes.'}</div>
      {planos?.map(p => (
        <button type="button" key={p.id} role="radio" aria-checked={escolhido === p.id} onClick={() => setEscolhido(p.id)} className="card"
          style={{ textAlign: 'left', border: 0, cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 10px', boxShadow: escolhido === p.id ? 'inset 0 0 0 2.5px var(--orange)' : 'inset 0 0 0 1.5px var(--line)' }}>
          <b className="row" style={{ gap: 8 }}>{p.nome}{p.destaque && <span className="tag">mais vantajoso</span>}</b>
          <b className="num" style={{ textAlign: 'right' }}>{reais(p.preco)}</b>
          <span className="tiny">{p.descricao}</span>
          <span className="tiny" style={{ textAlign: 'right' }}>{p.meses === 1 ? 'por mês' : `${reais(p.preco / p.meses)}/mês`}</span>
        </button>
      ))}
      <div className="card stack">
        <div className="field"><label htmlFor="pp-nome">Nome completo (para a cobrança)</label><input id="pp-nome" className="input" required value={nome} onChange={e => setNome(e.target.value)} /></div>
        <div className="field"><label htmlFor="pp-cpf">CPF</label><input id="pp-cpf" className="input num" inputMode="numeric" required value={cpf} onChange={e => setCpf(formatarCpf(e.target.value))} placeholder="000.000.000-00" /></div>
        {erro && <p className="small" style={{ color: 'var(--red)' }}>{erro}</p>}
        <button className="btn block" disabled={!plano || enviando}>{enviando ? 'Preparando…' : plano ? `Assinar por ${reais(plano.preco)}` : 'Escolha um plano'}</button>
        <p className="tiny">Pagamento pelo Asaas (Pix, cartão ou boleto), renovação automática, cancele quando quiser.</p>
      </div>
    </form>
  )
}

function Painel({ cad }: { cad: Cadastro }) {
  const [pacientes, setPacientes] = useState<Paciente[] | null>(null)
  const [aberto, setAberto] = useState<Paciente | null>(null)
  const carregar = () => supabase!.rpc('meus_pacientes').then(({ data, error }) => { if (error) avisar(error.message); setPacientes((data as Paciente[]) ?? []) })
  useEffect(() => { carregar() }, [])
  if (aberto) return <DiarioPaciente p={aberto} onVoltar={() => setAberto(null)} />
  return (
    <>
      <div className="card stack">
        <div className="row between wrap"><b>{cad.nome}</b><span className="tag">CRN-{cad.regiao_crn} {cad.crn}/{cad.uf} · verificado</span></div>
        <p className="small">Passe este código aos seus pacientes. No app, eles vão em <b>Perfil → Meu nutricionista</b> e digitam:</p>
        <div className="row" style={{ gap: 10 }}>
          <b className="num" style={{ fontSize: '2rem', letterSpacing: '.2em' }}>{cad.codigo}</b>
          <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(cad.codigo); avisar('Código copiado.') }}><Copy size={16} /> Copiar</button>
        </div>
        <p className="tiny">Os pacientes precisam ter o Papa Prato. Eles escolhem se compartilham o diário e podem desfazer o vínculo quando quiserem.</p>
      </div>
      <div className="row between"><h2>Seus pacientes</h2><button className="btn ghost sm" onClick={carregar}><RefreshCw size={16} /> Atualizar</button></div>
      {pacientes && !pacientes.length && <div className="card small muted">Nenhum paciente ainda. Assim que alguém digitar seu código, aparece aqui.</div>}
      <div className="stack" style={{ gap: 10 }}>
        {pacientes?.map(p => (
          <button key={p.id} className="card row" style={{ border: 0, textAlign: 'left', cursor: p.compartilha_diario ? 'pointer' : 'default' }} onClick={() => p.compartilha_diario && setAberto(p)}>
            <UserRound size={28} color="var(--green)" />
            <div className="grow">
              <b>{p.apelido}</b> <span className="tiny">{p.objetivo ? OBJETIVOS[p.objetivo] ?? p.objetivo : ''}</span>
              {p.compartilha_diario
                ? <div className="tiny">{p.dias_7 ?? 0} de 7 dias com registro · média {p.kcal_media_7 != null ? fmt(p.kcal_media_7) + ' kcal/dia' : '—'} · último {p.ultimo_registro ? dataBr(p.ultimo_registro) : '—'}</div>
                : <div className="tiny">O paciente não está compartilhando o diário agora.</div>}
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function DiarioPaciente({ p, onVoltar }: { p: Paciente; onVoltar: () => void }) {
  const [d, setD] = useState<Diario | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const ate = new Date(), de = new Date(); de.setDate(de.getDate() - 13)
    const k = (x: Date) => x.toISOString().slice(0, 10)
    supabase!.rpc('diario_paciente', { paciente: p.id, de: k(de), ate: k(ate) }).then(({ data, error }) => { if (error) setErro(error.message); else setD(data as Diario) })
  }, [p.id])
  const pf = d?.perfil ?? {}
  return (
    <>
      <button className="link small row" style={{ gap: 4 }} onClick={onVoltar}><ArrowLeft size={16} /> Pacientes</button>
      <h2>{p.apelido}</h2>
      {erro && <div className="card peach small">{erro}</div>}
      {d && (
        <>
          <div className="card small row wrap" style={{ gap: 14 }}>
            {[['Objetivo', OBJETIVOS[String(pf.objetivo)] ?? '—'], ['Dieta', DIETAS[String(pf.dieta)] ?? '—'], ['Idade', pf.idade ?? '—'], ['Peso', pf.peso ? `${pf.peso} kg` : '—'], ['Altura', pf.altura ? `${pf.altura} cm` : '—'], ['Atividade', ATIVIDADES[String(pf.atividade)] ?? '—'], ['Alergias', Array.isArray(pf.alergias) && pf.alergias.length ? (pf.alergias as string[]).join(', ') : 'nenhuma']].map(([k, v]) => <div key={String(k)}><span className="tiny">{String(k)}</span><div><b>{String(v)}</b></div></div>)}
          </div>
          {!!d.pesos?.length && <div className="card small"><b>Peso registrado</b><div className="row wrap" style={{ gap: 12, marginTop: 6 }}>{d.pesos.map(p => <span key={p.data} className="num">{dataBr(p.data)}: <b>{fmt(p.kg, 1)} kg</b></span>)}</div></div>}
          <p className="tiny">Últimos 14 dias. Valores calculados pelo app com a base TACO/TBCA, a partir do que o paciente registrou.</p>
          {!d.dias.length && <div className="card small muted">Sem registros nesse período.</div>}
          {d.dias.map(dia => {
            const tot = dia.registros.reduce((s, r) => ({ kcal: s.kcal + (r.n?.kcal ?? 0), p: s.p + (r.n?.proteina ?? 0), c: s.c + (r.n?.carboidrato ?? 0), g: s.g + (r.n?.gordura ?? 0) }), { kcal: 0, p: 0, c: 0, g: 0 })
            const agua = (dia.agua ?? []).reduce((s, x) => s + x, 0)
            return (
              <div key={dia.data} className="card stack" style={{ gap: 6 }}>
                <div className="row between wrap"><b>{dataBr(dia.data)}</b><span className="small num">{fmt(tot.kcal)} kcal · P {fmt(tot.p)} · C {fmt(tot.c)} · G {fmt(tot.g)} g · água {fmt(agua / 1000, 1)} L</span></div>
                {REFEICOES.map(r => {
                  const itens = dia.registros.filter(x => x.refeicao === r.id)
                  return itens.length ? <div key={r.id} className="small"><span className="muted">{r.emoji} {r.nome}:</span> {itens.map(x => `${x.nome}${x.gramas ? ` (${Math.round(x.gramas)} g)` : ''}`).join(', ')}</div> : null
                })}
              </div>
            )
          })}
        </>
      )}
    </>
  )
}
