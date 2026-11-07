import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { avisar } from './ui'
import { supabase, useSessao } from '../lib/supabase'

// Lembretes no celular (Web Push): o servidor avisa na hora das refeições (se ainda não registrou)
// e para beber água (até chegar a 2 L). No iPhone, só funciona com o app instalado na tela de início.
type Config = { ativo: boolean; cafe: string | null; almoco: string | null; jantar: string | null; agua: boolean; agua_inicio: number; agua_fim: number; agua_intervalo: number }
const PADRAO: Config = { ativo: true, cafe: '08:00', almoco: '12:30', jantar: '19:30', agua: true, agua_inicio: 9, agua_fim: 21, agua_intervalo: 2 }
const REF: { k: 'cafe' | 'almoco' | 'jantar'; nome: string }[] = [{ k: 'cafe', nome: 'Café da manhã' }, { k: 'almoco', nome: 'Almoço' }, { k: 'jantar', nome: 'Jantar' }]

const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
function chaveParaBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function inscreverAparelho() {
  const { data: chave } = await supabase!.rpc('chave_publica_push')
  if (!chave) throw new Error('Os lembretes estão sendo ativados no servidor. Tente de novo em alguns minutos.')
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('Permita as notificações para o Papa Prato nas configurações do navegador.')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (sub && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== chave) { await sub.unsubscribe(); sub = null }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) })
  const j = sub.toJSON()
  const { error } = await supabase!.rpc('salvar_inscricao_push', { endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' })
  if (error) throw error
}

export function Lembretes() {
  const sessao = useSessao()
  const [cfg, setCfg] = useState<Config | null>(null)
  const [salvo, setSalvo] = useState<Config | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (!sessao || !supabase) return
    supabase.from('lembretes').select('ativo,cafe,almoco,jantar,agua,agua_inicio,agua_fim,agua_intervalo').maybeSingle().then(({ data }) => {
      const c = (data as Config) ?? { ...PADRAO, ativo: false }
      setCfg(c); setSalvo(data ? c : null)
    })
  }, [sessao?.user.id])
  if (!sessao || !supabase || !cfg) return null

  const set = (x: Partial<Config>) => setCfg(c => ({ ...c!, ...x }))
  const gravar = async (c: Config) => {
    const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
    const { error } = await supabase!.from('lembretes').upsert({ user_id: sessao.user.id, ...c, fuso, atualizado_em: new Date().toISOString() })
    if (error) throw error
    setSalvo(c); setCfg(c)
  }
  const ligar = async () => {
    setOcupado(true)
    try { await inscreverAparelho(); await gravar({ ...cfg, ativo: true }); avisar('Lembretes ligados neste aparelho!') }
    catch (e) { avisar((e as Error).message) }
    setOcupado(false)
  }
  const desligar = async () => {
    setOcupado(true)
    try { await gravar({ ...cfg, ativo: false }); avisar('Lembretes desligados.') } catch (e) { avisar((e as Error).message) }
    setOcupado(false)
  }
  const mudou = JSON.stringify(cfg) !== JSON.stringify(salvo)

  return (
    <div className="card stack">
      <h3 className="row" style={{ gap: 8 }}><Bell size={18} /> Lembretes no celular</h3>
      {!suportado() ? (
        <p className="small">{ehIOS() ? 'No iPhone, os lembretes funcionam com o app instalado: toque em Compartilhar → "Adicionar à Tela de Início" e abra o Papa Prato por lá.' : 'Este navegador não recebe notificações. Tente pelo Chrome ou instale o app.'}</p>
      ) : !salvo?.ativo ? (
        <>
          <p className="small">O Papa avisa na hora das refeições (só se você ainda não registrou) e lembra de beber água até os 2 L do dia.</p>
          <button className="btn block" disabled={ocupado} onClick={ligar}><Bell size={18} /> {ocupado ? 'Ligando…' : 'Ligar lembretes'}</button>
        </>
      ) : (
        <>
          {REF.map(r => (
            <div key={r.k} className="row between">
              <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!cfg[r.k]} onChange={e => set({ [r.k]: e.target.checked ? PADRAO[r.k] : null })} /> {r.nome}</label>
              <input type="time" className="input" style={{ width: 120 }} disabled={!cfg[r.k]} value={cfg[r.k] ?? ''} onChange={e => set({ [r.k]: e.target.value || null })} aria-label={`Horário do ${r.nome}`} />
            </div>
          ))}
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={cfg.agua} onChange={e => set({ agua: e.target.checked })} /> Água</label>
          {cfg.agua && (
            <div className="row wrap small" style={{ gap: 6 }}>
              a cada <select className="input" style={{ width: 80 }} value={cfg.agua_intervalo} onChange={e => set({ agua_intervalo: Number(e.target.value) })}>{[1, 2, 3, 4].map(h => <option key={h} value={h}>{h} h</option>)}</select>
              das <select className="input" style={{ width: 84 }} value={cfg.agua_inicio} onChange={e => set({ agua_inicio: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{h}h</option>)}</select>
              às <select className="input" style={{ width: 84 }} value={cfg.agua_fim} onChange={e => set({ agua_fim: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 12).map(h => <option key={h} value={h}>{h}h</option>)}</select>
            </div>
          )}
          {mudou && <button className="btn block" disabled={ocupado || cfg.agua_fim <= cfg.agua_inicio} onClick={async () => { setOcupado(true); try { await gravar(cfg); avisar('Horários salvos.') } catch (e) { avisar((e as Error).message) } setOcupado(false) }}>Salvar horários</button>}
          <div className="row between">
            <button className="link small" onClick={ligar} disabled={ocupado}>Ligar também neste aparelho</button>
            <button className="link small row" style={{ gap: 4 }} onClick={desligar} disabled={ocupado}><BellOff size={14} /> Desligar</button>
          </div>
        </>
      )}
    </div>
  )
}
