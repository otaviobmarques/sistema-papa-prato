import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Keyboard } from 'lucide-react'
import { Mascot } from './Mascot'
import { buscarProduto, codigoValido } from '../lib/produtos'
import { atualizar, type Produto } from '../lib/store'

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

// Lê o código pela câmera (BarcodeDetector nativo; zxing como reserva no iPhone) ou digitado.
export function LeitorCodigo({ onProduto, onVoltar }: { onProduto: (p: Produto) => void; onVoltar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<'abrindo' | 'ativa' | 'indisponivel'>('abrindo')
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  const lido = useRef(false)

  const consultar = async (c: string) => {
    if (buscando) return
    setErro(''); setBuscando(true)
    try {
      const p = await buscarProduto(c)
      atualizar(e => ({ ...e, produtos: { ...e.produtos, [p.id]: p } }))
      onProduto(p)
    } catch (e) { setErro((e as Error).message); lido.current = false }
    finally { setBuscando(false) }
  }

  useEffect(() => {
    let parar = () => {}
    let ativo = true
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamera('indisponivel'); return }
      try {
        const formatos = ['ean_13', 'ean_8', 'upc_a', 'upc_e']
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
        if (BD) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          if (!ativo) { stream.getTracks().forEach(t => t.stop()); return }
          const v = video.current!
          v.srcObject = stream; await v.play(); setCamera('ativa')
          const det = new BD({ formats: formatos })
          let loop = 0
          const passo = async () => {
            if (!ativo) return
            try {
              const r = await det.detect(v)
              const c = r.find(x => codigoValido(x.rawValue))?.rawValue
              if (c && !lido.current) { lido.current = true; navigator.vibrate?.(60); setCodigo(c); consultar(c) }
            } catch { /* quadro ilegível */ }
            loop = window.setTimeout(passo, 250)
          }
          passo()
          parar = () => { clearTimeout(loop); stream.getTracks().forEach(t => t.stop()) }
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const leitor = new BrowserMultiFormatReader()
          const controles = await leitor.decodeFromVideoDevice(undefined, video.current!, res => {
            const c = res?.getText()
            if (c && codigoValido(c) && !lido.current) { lido.current = true; navigator.vibrate?.(60); setCodigo(c); consultar(c) }
          })
          if (!ativo) { controles.stop(); return }
          setCamera('ativa')
          parar = () => controles.stop()
        }
      } catch { setCamera('indisponivel') }
    })()
    return () => { ativo = false; parar() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="stack">
      <button className="link row" onClick={onVoltar} style={{ gap: 6 }}><ArrowLeft size={18} /> Voltar à busca</button>
      <h2>Código de barras</h2>
      <div className="leitor">
        <video ref={video} playsInline muted aria-label="Imagem da câmera" />
        {camera === 'ativa' && <div className="leitor-mira" aria-hidden />}
        {camera === 'abrindo' && <div className="leitor-aviso">Abrindo a câmera…</div>}
        {camera === 'indisponivel' && <div className="leitor-aviso"><Mascot size={70} humor="pensativo" />Não consegui usar a câmera. Permita o acesso nas configurações do navegador ou digite o código abaixo.</div>}
      </div>
      <p className="small muted">Aponte para as barras do produto. Também dá para digitar os números.</p>
      <form className="row" onSubmit={e => { e.preventDefault(); consultar(codigo) }}>
        <div className="search grow"><Keyboard size={18} /><input className="input" inputMode="numeric" value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="7891234567890" aria-label="Número do código de barras" /></div>
        <button className="btn" disabled={buscando || !codigoValido(codigo)}>{buscando ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {erro && <div className="card peach small">{erro}</div>}
      <p className="fonte-cit">Produtos do Open Food Facts (openfoodfacts.org), base colaborativa sob licença ODbL.</p>
    </div>
  )
}
