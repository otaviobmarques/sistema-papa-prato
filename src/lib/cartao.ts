// T33: cartão de conquista para compartilhar (1080 × 1350, formato de post).
// Mostra só a conquista: nada de peso, calorias ou dados de saúde.
export async function gerarCartao(c: { emoji: string; nome: string; criterio: string }, sequencia: number): Promise<Blob> {
  const W = 1080, H = 1350
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  await document.fonts?.ready
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#FFF5EC'); grad.addColorStop(1, '#FFE3C9')
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.fillStyle = '#BEF264'; g.globalAlpha = .55; g.beginPath(); g.arc(930, 180, 220, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#FDBA74'; g.beginPath(); g.arc(120, 1180, 260, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1
  const confete = ['#16A34A', '#C2410C', '#FDBA74', '#BEF264', '#2563EB', '#FACC15']
  for (let i = 0; i < 70; i++) { g.save(); g.translate(Math.random() * W, Math.random() * 560); g.rotate(Math.random() * 6); g.fillStyle = confete[i % 6]; g.fillRect(-9, -6, 18, 12); g.restore() }
  const img = new Image(); img.src = '/icons/icon-512.png'
  await img.decode().catch(() => {})
  if (img.complete && img.naturalWidth) g.drawImage(img, W / 2 - 230, 160, 460, 460)
  g.textAlign = 'center'
  g.font = '120px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.fillText(c.emoji, W / 2, 760)
  g.fillStyle = '#C2410C'; g.font = '600 40px Inter, system-ui, sans-serif'; g.fillText('CONQUISTA DESBLOQUEADA', W / 2, 840)
  g.fillStyle = '#14532D'; g.font = '700 92px Fredoka, ui-rounded, system-ui, sans-serif'; g.fillText(c.nome, W / 2, 950)
  g.fillStyle = '#55645B'; g.font = '500 40px Inter, system-ui, sans-serif'
  quebrar(g, c.criterio + '.', W / 2, 1025, 860, 52)
  if (sequencia > 1) { g.fillStyle = '#C2410C'; g.font = '600 42px Inter, system-ui, sans-serif'; g.fillText(`🔥 ${sequencia} dias seguidos`, W / 2, 1145) }
  g.fillStyle = '#14532D'; g.font = '700 54px Fredoka, ui-rounded, system-ui, sans-serif'; g.fillText('Papa Prato', W / 2, 1265)
  g.fillStyle = '#55645B'; g.font = '500 30px Inter, system-ui, sans-serif'; g.fillText('papaprato.com.br', W / 2, 1310)
  return new Promise(res => cv.toBlob(b => res(b!), 'image/png'))
}

function quebrar(g: CanvasRenderingContext2D, texto: string, x: number, y: number, larg: number, alt: number) {
  const palavras = texto.split(' '); let linha = ''
  for (const p of palavras) {
    const t = linha ? linha + ' ' + p : p
    if (g.measureText(t).width > larg && linha) { g.fillText(linha, x, y); y += alt; linha = p } else linha = t
  }
  if (linha) g.fillText(linha, x, y)
}

export async function compartilharCartao(c: { emoji: string; nome: string; criterio: string }, sequencia: number): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  const blob = await gerarCartao(c, sequencia)
  const arq = new File([blob], `conquista-${c.nome.toLowerCase().replace(/\s+/g, '-')}.png`, { type: 'image/png' })
  const texto = `Conquistei "${c.nome}" no Papa Prato! 🥦 papaprato.com.br`
  if (navigator.canShare?.({ files: [arq] })) {
    try { await navigator.share({ files: [arq], text: texto, title: 'Minha conquista no Papa Prato' }); return 'compartilhado' }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelado' }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arq.name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return 'baixado'
}
