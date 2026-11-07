import { useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Folha, avisar } from './ui'
import { Mascot } from './Mascot'
import { useInstalacao } from '../lib/instalar'

const CHAVE = 'papa-prato:instalar-dispensado'
const dispensado = () => { try { return !!localStorage.getItem(CHAVE) } catch { return false } }

function PassosIOS({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  return (
    <Folha aberta={aberta} onFechar={onFechar} titulo="Instalar no iPhone">
      <div className="stack">
        <p className="muted small">Em 3 toques o Papa Prato vira um app na sua tela de início, abre em tela cheia e funciona até sem internet.</p>
        <ol className="stack" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', gap: 10 }}>
          <li className="card row"><span className="emoji"><Share size={22} color="var(--blue)" /></span><span>Toque em <b>Compartilhar</b> na barra do Safari (o quadrado com a seta para cima).</span></li>
          <li className="card row"><span className="emoji"><SquarePlus size={22} /></span><span>Role e toque em <b>Adicionar à Tela de Início</b>.</span></li>
          <li className="card row"><span className="emoji"><Mascot size={34} animado={false} /></span><span>Toque em <b>Adicionar</b>. Pronto: o Papa aparece entre os seus apps.</span></li>
        </ol>
        <p className="tiny">Use o Safari. Em outros navegadores do iPhone a opção pode não aparecer.</p>
        <button className="btn block" onClick={onFechar}>Entendi</button>
      </div>
    </Folha>
  )
}

// Cartão no Perfil
export function CartaoInstalar() {
  const inst = useInstalacao()
  const [ios, setIos] = useState(false)
  if (inst.instalado) return <div className="card soft small row"><Mascot size={36} animado={false} />O Papa Prato já está instalado neste aparelho.</div>
  if (!inst.disponivel) return null
  return (
    <div className="card row" style={{ alignItems: 'center' }}>
      <Mascot size={56} />
      <div className="grow"><h3>Instale o app</h3><p className="small muted">Abre direto da tela de início, em tela cheia, e funciona sem internet.</p></div>
      <button className="btn sm" onClick={async () => { const r = await inst.instalar(); if (r === 'instrucoes') setIos(true); else if (r === 'instalado') avisar('App instalado! 🎉') }}><Download size={16} /> Instalar</button>
      <PassosIOS aberta={ios} onFechar={() => setIos(false)} />
    </div>
  )
}

// Faixa discreta no Início (some quando a pessoa fecha ou instala)
export function FaixaInstalar() {
  const inst = useInstalacao()
  const [fechada, setFechada] = useState(dispensado())
  const [ios, setIos] = useState(false)
  if (fechada || !inst.disponivel) return null
  const fechar = () => { try { localStorage.setItem(CHAVE, '1') } catch { /* ok */ } setFechada(true) }
  return (
    <div className="card soft row" style={{ alignItems: 'center', padding: 14 }}>
      <Download size={20} color="var(--green-2)" style={{ flex: 'none' }} />
      <p className="small grow"><b>Tenha o Papa na tela de início.</b> Abre mais rápido e funciona offline.</p>
      <button className="btn sm" onClick={async () => { const r = await inst.instalar(); if (r === 'instrucoes') setIos(true); else if (r === 'instalado') { avisar('App instalado! 🎉'); fechar() } }}>Instalar</button>
      <button className="icon-btn flat" aria-label="Agora não" onClick={fechar}><X size={18} /></button>
      <PassosIOS aberta={ios} onFechar={() => setIos(false)} />
    </div>
  )
}
