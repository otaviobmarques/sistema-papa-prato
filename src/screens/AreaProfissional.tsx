import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, LogOut, RefreshCw, UserRound } from 'lucide-react'
import { Mascot } from '../components/Mascot'
import { FormularioLink } from '../components/Conta'
import { Assinatura as CreditoDomma } from '../components/Assinatura'
import { Avisos, avisar, fmt } from '../components/ui'
import { supabase, useSessao } from '../lib/supabase'
import { REFEICOES } from '../lib/store'

// A12 Área do profissional (/app/#profissional): nutricionista com CRN verificado pela equipe acompanha
// os pacientes que digitaram o código dele. O diário só aparece se o paciente autorizou.
type Cadastro = { user_id: string; nome: string; crn: string; uf: string; regiao_crn: number; status: 'pendente' | 'verificado' | 'recusado'; motivo: string | null; codigo: string }
type Paciente = { id: string; apelido: string; objetivo: string | null; desde: string; compartilha_diario: boolean; dias_7: number | null; kcal_media_7: number | null; ultimo_registro: string | null }
type Reg = { nome: string; gramas?: number; refeicao?: string; hora?: string; n?: { kcal?: number; proteina?: number; carboidrato?: number; gordura?: number } }
type Diario = { perfil: Record<string, unknown> | null; dias: { data: string; registros: Reg[]; agua: number[] }[] }

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
        <div className="balao grow"><b>Área do nutricionista</b><div className="small" style={{ marginTop: 4 }}>Acompanhe seus pacientes pelo Papa Prato. É grátis para profissionais com CRN ativo.</div></div>
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
        ) : <Painel cad={cad} />}
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
