// Gera favicon, ícones do PWA (Android e Apple), telas de abertura do iPhone e o banner de link preview.
// Usa o desenho do Papa que está em index.html, então tudo sai igual ao site.
//
// Uso: node scripts/gerar-icones.cjs   (precisa do Playwright com Chromium instalado)
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const raiz = path.resolve(__dirname, '..')
const pub = path.join(raiz, 'public')
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8')
const defs = html.slice(html.indexOf('<defs>'), html.indexOf('</defs>') + 7)
fs.mkdirSync(path.join(pub, 'icons'), { recursive: true })
fs.mkdirSync(path.join(pub, 'splash'), { recursive: true })

const CREME = '#FFF5EC', VERDE = '#14532D', BARRO = '#C2410C'
const fontes = '<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Inter:wght@500;600&display=swap" rel="stylesheet">'
const svgPapa = (viewBox = '0 0 290 290', extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${extra}>${defs}<use href="#papa"/></svg>`
// Só a cabeça e as folhas: legível em 16 px
const CABECA = '22 6 244 214'

async function render(page, w, h, body, arquivo, { transparente = false } = {}) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<!doctype html><html><head>${fontes}<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${transparente ? 'transparent' : CREME}}</style></head><body>${body}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(150)
  await page.screenshot({ path: arquivo, omitBackground: transparente })
}

;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ deviceScaleFactor: 1 })

  // Favicon SVG (fundo creme arredondado + cabeça do Papa)
  const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${CREME}"/><svg x="3" y="5" width="58" height="52" viewBox="${CABECA}">${defs}<use href="#papa"/></svg></svg>`
  fs.writeFileSync(path.join(pub, 'favicon.svg'), favSvg)

  // PNGs do favicon
  for (const s of [16, 32, 48]) {
    await render(p, s, s, `<div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;background:${CREME};display:grid;place-items:center">${svgPapa(CABECA, `width="${s * 0.94}" height="${s * 0.86}"`)}</div>`, path.join(pub, 'icons', `favicon-${s}.png`), { transparente: true })
  }

  // Ícone "any" (cantos arredondados, fundo creme) e "maskable" (fundo inteiro, mascote na zona segura de 80%)
  for (const s of [192, 512]) {
    await render(p, s, s, `<div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;background:${CREME};display:grid;place-items:center">${svgPapa('0 0 290 290', `width="${s * 0.86}" height="${s * 0.86}"`)}</div>`, path.join(pub, 'icons', `icon-${s}.png`), { transparente: true })
    await render(p, s, s, `<div style="width:${s}px;height:${s}px;background:${CREME};display:grid;place-items:center">${svgPapa('0 0 290 290', `width="${s * 0.66}" height="${s * 0.66}"`)}</div>`, path.join(pub, 'icons', `icon-maskable-${s}.png`))
  }
  // Apple (o iOS arredonda sozinho; fundo inteiro)
  await render(p, 180, 180, `<div style="width:180px;height:180px;background:${CREME};display:grid;place-items:center">${svgPapa('0 0 290 290', 'width="150" height="150"')}</div>`, path.join(pub, 'apple-touch-icon.png'))

  // Telas de abertura do iPhone e iPad (retrato), em pixels reais
  const telas = [
    [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532], [1125, 2436], [1242, 2688], [828, 1792], [1242, 2208], [750, 1334], [640, 1136],
    [2048, 2732], [1668, 2388], [1640, 2360], [1620, 2160], [1488, 2266], [1536, 2048],
  ]
  for (const [w, h] of telas) {
    const m = Math.min(w, h)
    await render(p, w, h, `<div style="width:${w}px;height:${h}px;display:grid;place-content:center;justify-items:center;gap:${m * 0.04}px;font-family:Fredoka,sans-serif">
      ${svgPapa('0 0 290 290', `width="${m * 0.42}" height="${m * 0.42}"`)}
      <div style="font-weight:700;font-size:${m * 0.11}px;line-height:1;color:${VERDE}">Papa <span style="color:${BARRO}">Prato</span></div>
      <div style="font:500 ${m * 0.036}px Inter,sans-serif;color:#55645B">Comida de verdade, do seu jeito</div></div>`, path.join(pub, 'splash', `splash-${w}x${h}.png`))
  }

  // Banner de link preview (Open Graph), 1200 x 630
  const telaInicio = 'data:image/webp;base64,' + fs.readFileSync(path.join(pub, 'site', 'telas', 'inicio.webp')).toString('base64')
  await render(p, 1200, 630, `
  <div style="position:relative;width:1200px;height:630px;overflow:hidden;font-family:Inter,sans-serif;background:${CREME}">
    <div style="position:absolute;right:-60px;top:-40px;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#FFE0C2,#FDBA74 70%);opacity:.75"></div>
    <div style="position:absolute;right:300px;top:330px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,#DCF7B5,#BEF264);opacity:.8"></div>
    <div style="position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:14px;font:700 40px/1 Fredoka,sans-serif;color:${VERDE}">${svgPapa('0 0 290 290', 'width="64" height="64"')}Papa <span style="color:${BARRO}">Prato</span></div>
    <div style="position:absolute;left:72px;top:170px;width:620px;font:600 64px/1.04 Fredoka,sans-serif;color:${VERDE};letter-spacing:-1px">Comer bem com <span style="color:${BARRO}">arroz e feijão</span> e zero complicação.</div>
    <div style="position:absolute;left:72px;top:418px;width:560px;font:500 25px/1.4 Inter,sans-serif;color:#55645B">Cardápio da semana, foto do prato e 18 mil alimentos brasileiros.</div>
    <div style="position:absolute;left:72px;top:512px;display:flex;gap:12px">
      <span style="background:${BARRO};color:#fff;font:600 22px/1 Inter,sans-serif;padding:16px 26px;border-radius:999px">Comece hoje</span>
      <span style="background:#fff;color:${VERDE};font:600 22px/1 Inter,sans-serif;padding:16px 22px;border-radius:999px;box-shadow:inset 0 0 0 2px #F0E1CE">No celular, sem baixar nada</span>
    </div>
    <div style="position:absolute;left:790px;top:46px;width:300px;padding:10px;border-radius:44px;background:#111;transform:rotate(-5deg);box-shadow:0 30px 60px -20px rgba(60,35,15,.45)">
      <div style="border-radius:34px;overflow:hidden;aspect-ratio:390/664"><img src="${telaInicio}" style="width:100%;height:100%;object-fit:cover;object-position:top;display:block"></div>
    </div>
    <div style="position:absolute;right:30px;bottom:-6px">${svgPapa('0 0 290 290', 'width="230" height="230"')}</div>
  </div>`, path.join(pub, 'og.png'))

  await b.close()

  // favicon.ico com 16, 32 e 48 px (PNG embutido, formato aceito por todos os navegadores atuais)
  const imgs = [16, 32, 48].map(s => ({ s, buf: fs.readFileSync(path.join(pub, 'icons', `favicon-${s}.png`)) }))
  const cab = Buffer.alloc(6); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(imgs.length, 4)
  let desloc = 6 + 16 * imgs.length
  const entradas = imgs.map(({ s, buf }) => {
    const e = Buffer.alloc(16); e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(desloc, 12); desloc += buf.length; return e
  })
  fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([cab, ...entradas, ...imgs.map(i => i.buf)]))
  console.log('ok: favicon, ícones, apple-touch-icon,', telas.length, 'telas de abertura e og.png')
})().catch(e => { console.error(e); process.exit(1) })
