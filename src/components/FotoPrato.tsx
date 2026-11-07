import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Camera, Sparkles } from 'lucide-react'
import { Mascot } from './Mascot'
import { FormularioLink, contasDisponiveis } from './Conta'
import { avisar, fmt } from './ui'
import { buscar, nomeCurto, nutrientesDe, somar, type Alimento } from '../lib/alimentos'
import { analisarFoto, prepararFoto, type ResultadoFoto } from '../lib/ia'
import { useSessao } from '../lib/supabase'
import { registrarConsentimento } from '../lib/sync'
import { REFEICOES, atualizar, registrar, useEstado, type Refeicao } from '../lib/store'

type Linha = { nome: string; confianca: string; opcoes: Alimento[]; escolhido: string; gramas: number; incluir: boolean }

export function FotoPrato({ lista, data, refeicaoInicial, onVoltar, onPronto }: { lista: Alimento[]; data: string; refeicaoInicial: Refeicao; onVoltar: () => void; onPronto: () => void }) {
  const sessao = useSessao()
  const consentiu = useEstado(e => !!e.consentimento?.ia)
  const entrada = useRef<HTMLInputElement>(null)
  const [foto, setFoto] = useState<{ base64: string; url: string } | null>(null)
  const [estado, setEstado] = useState<'inicio' | 'analisando' | 'revisar'>('inicio')
  const [erro, setErro] = useState('')
  const [res, setRes] = useState<ResultadoFoto | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [refeicao, setRefeicao] = useState<Refeicao>(refeicaoInicial)

  const voltar = <button className="link row" onClick={onVoltar} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar à busca</button>

  if (!contasDisponiveis || !sessao) return (
    <div className="stack">{voltar}<h2>Foto do prato</h2>
      <div className="row" style={{ alignItems: 'flex-start' }}><Mascot size={70} /><div className="balao grow small">Para analisar fotos, preciso que você entre na sua conta. É grátis!</div></div>
      {contasDisponiveis ? <FormularioLink textoBotao="Criar conta ou entrar" /> : <p className="muted small">As contas ainda não estão disponíveis nesta versão.</p>}
    </div>
  )
  if (!consentiu) return (
    <div className="stack">{voltar}<h2>Foto do prato</h2>
      <div className="card stack">
        <p className="small">A foto é enviada para o <b>Gemini (Google)</b>, que identifica os alimentos e estima as porções. A foto não fica guardada no Papa Prato.</p>
        <p className="small muted">Os valores nutricionais vêm das tabelas TACO e TBCA, e você revisa tudo antes de salvar.</p>
        <button className="btn block" onClick={() => { atualizar(e => ({ ...e, consentimento: { ...e.consentimento!, ia: true } })); registrarConsentimento('ia', true) }}><Sparkles size={18} /> Permitir análise por IA</button>
        <p className="tiny">Você pode desligar em Perfil → Privacidade.</p>
      </div>
    </div>
  )

  const escolherArquivo = async (f?: File) => {
    if (!f) return
    setErro('')
    try { setFoto(await prepararFoto(f)) } catch { setErro('Não consegui abrir essa imagem. Tente outra foto.') }
  }
  const analisar = async () => {
    if (!foto) return
    setEstado('analisando'); setErro('')
    try {
      const r = await analisarFoto(foto.base64)
      setRes(r)
      setLinhas(r.itens.map(i => {
        const opcoes = buscar(lista, i.busca, 6).concat(buscar(lista, i.nome, 3)).filter((a, k, arr) => arr.findIndex(b => b.id === a.id) === k).slice(0, 6)
        return { nome: i.nome, confianca: i.confianca, opcoes, escolhido: opcoes[0]?.id ?? '', gramas: i.gramas, incluir: opcoes.length > 0 }
      }))
      setEstado('revisar')
    } catch (e) { setErro((e as Error).message); setEstado('inicio') }
  }

  if (estado === 'revisar' && res) return (
    <Revisao linhas={linhas} setLinhas={setLinhas} res={res} foto={foto!.url} refeicao={refeicao} setRefeicao={setRefeicao}
      onOutra={() => { setFoto(null); setRes(null); setEstado('inicio') }}
      onSalvar={() => {
        const sel = linhas.filter(l => l.incluir && l.escolhido)
        sel.forEach(l => {
          const a = l.opcoes.find(o => o.id === l.escolhido)!
          registrar(data, { alimentoId: a.id, nome: a.nome, fonte: a.fonte, gramas: l.gramas, refeicao, n: nutrientesDe(a, l.gramas) })
        })
        avisar(`${sel.length} ${sel.length === 1 ? 'item adicionado' : 'itens adicionados'}!`)
        onPronto()
      }} />
  )

  return (
    <div className="stack">
      {voltar}
      <h2>Foto do prato</h2>
      <input ref={entrada} type="file" accept="image/*" capture="environment" hidden onChange={e => escolherArquivo(e.target.files?.[0])} />
      {foto ? <img src={foto.url} alt="Foto do prato" className="foto-previa" /> : (
        <button className="leitor" style={{ border: 0, cursor: 'pointer' }} onClick={() => entrada.current?.click()}>
          <div className="leitor-aviso"><Camera size={40} />Toque para tirar ou escolher uma foto</div>
        </button>
      )}
      {erro && <div className="card peach small">{erro}</div>}
      {estado === 'analisando' ? (
        <div className="empty"><Mascot size={80} humor="pensativo" />Analisando o prato…</div>
      ) : foto ? (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost grow" onClick={() => entrada.current?.click()}>Trocar foto</button>
          <button className="btn grow" onClick={analisar}><Sparkles size={18} /> Analisar</button>
        </div>
      ) : null}
      <p className="tiny">Dica: fotografe de cima, com boa luz e o prato inteiro. A IA pode errar; você confere tudo antes de salvar.</p>
    </div>
  )
}

function Revisao({ linhas, setLinhas, res, foto, refeicao, setRefeicao, onOutra, onSalvar }: {
  linhas: Linha[]; setLinhas: (l: Linha[]) => void; res: ResultadoFoto; foto: string; refeicao: Refeicao; setRefeicao: (r: Refeicao) => void; onOutra: () => void; onSalvar: () => void
}) {
  const muda = (i: number, m: Partial<Linha>) => setLinhas(linhas.map((l, k) => (k === i ? { ...l, ...m } : l)))
  const total = useMemo(() => somar(linhas.filter(l => l.incluir && l.escolhido).map(l => nutrientesDe(l.opcoes.find(o => o.id === l.escolhido)!, l.gramas))), [linhas])
  const n = linhas.filter(l => l.incluir && l.escolhido).length
  return (
    <div className="stack">
      <img src={foto} alt="Foto do prato" className="foto-previa" style={{ maxHeight: 160 }} />
      {!res.e_comida || !linhas.length ? (
        <div className="empty"><Mascot size={80} humor="pensativo" />Não encontrei comida nessa foto. Tente outra, de cima e com boa luz.<button className="btn ghost" onClick={onOutra}>Tirar outra foto</button></div>
      ) : (
        <>
          <div className="card soft small row" style={{ alignItems: 'flex-start' }}><AlertTriangle size={16} style={{ flex: 'none', color: 'var(--orange)' }} /><span>Estimativa da IA. Confira cada alimento e a quantidade antes de salvar.{res.observacao ? ` ${res.observacao}` : ''}</span></div>
          <div className="card" style={{ padding: '4px 16px' }}>
            {linhas.map((l, i) => (
              <div key={i} className="item-ia">
                <label className="row between" style={{ cursor: 'pointer' }}>
                  <span className="row" style={{ gap: 8 }}><input type="checkbox" checked={l.incluir} disabled={!l.opcoes.length} onChange={e => muda(i, { incluir: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--green)' }} /><b>{l.nome}</b></span>
                  <span className={`tag ${l.confianca === 'alta' ? '' : 'orange'}`}>{l.confianca === 'alta' ? 'confiança alta' : l.confianca === 'media' ? 'confira' : 'incerto'}</span>
                </label>
                {l.opcoes.length ? (
                  <div className="row" style={{ gap: 8 }}>
                    <select className="input grow" value={l.escolhido} onChange={e => muda(i, { escolhido: e.target.value })} aria-label={`Alimento para ${l.nome}`}>
                      {l.opcoes.map(o => <option key={o.id} value={o.id}>{nomeCurto(o.nome)} ({o.fonte})</option>)}
                    </select>
                    <input className="input num" style={{ width: 86, textAlign: 'right' }} inputMode="numeric" value={l.gramas} onChange={e => muda(i, { gramas: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label={`Gramas de ${l.nome}`} />
                    <span className="small muted">g</span>
                  </div>
                ) : <p className="tiny">Não achei na base. Adicione pela busca depois.</p>}
              </div>
            ))}
          </div>
          <div className="card row between"><span className="muted">Total estimado</span><b className="num">{fmt(total.kcal)} kcal</b></div>
          <div className="chips">{REFEICOES.map(r => <button key={r.id} className="chip" aria-pressed={refeicao === r.id} onClick={() => setRefeicao(r.id)}>{r.emoji} {r.nome}</button>)}</div>
          <button className="btn block" disabled={!n} onClick={onSalvar}>Adicionar {n} {n === 1 ? 'item' : 'itens'} ao diário</button>
          <button className="btn ghost block" onClick={onOutra}>Tirar outra foto</button>
          <p className="fonte-cit">Identificação: Gemini (Google). Valores nutricionais: TACO (NEPA/UNICAMP) e TBCA (USP/FoRC).</p>
        </>
      )}
    </div>
  )
}
