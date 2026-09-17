/**
 * Packt die Oberflaechentexturen der Stadt.
 *
 *   node tools/pack-textures.mjs
 *
 * Quelle ist `src/core/surfaceLayers.json` - dieselbe Liste, aus der das Spiel
 * die Layernummern liest. Je Eintrag wird das 1K-JPG-Set von ambientCG (CC0)
 * geladen und auf 512 px gebracht. Heraus kommen zwei senkrechte Streifen mit
 * einer Kachel je Layer:
 *
 * - `surfaces-detail.jpg`: nur die Helligkeitsstruktur, auf Mittelwert 0,5 und
 *   eine einheitliche Streuung normiert. Die Farbe kommt weiter aus der Palette;
 *   ohne die Normierung haette jede Textur ihre eigene Helligkeit und ihren
 *   eigenen Kontrast, und `contrast` in der Liste waere nicht vergleichbar.
 * - `surfaces-normal.jpg`: die OpenGL-Normalenkarte des Sets.
 *
 * Zwei Dateien statt Struktur und Normale in einem Bild: JPEG speichert die
 * Farbkanaele in halber Aufloesung, getrennte Kanaele liefen ineinander.
 */
import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SIZE = 512
const layers = JSON.parse(readFileSync('src/core/surfaceLayers.json', 'utf8'))
const cache = join(tmpdir(), 'fynnox-textures')
mkdirSync(cache, { recursive: true })
mkdirSync('public/textures', { recursive: true })

const sources = []
for (const layer of layers) {
  const dir = join(cache, layer.asset)
  if (!existsSync(dir)) {
    const zip = join(cache, `${layer.asset}.zip`)
    const url = `https://ambientcg.com/get?file=${layer.asset}_1K-JPG.zip`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()))
    const unzip = spawnSync('unzip', ['-oq', zip, '*Color.jpg', '*NormalGL.jpg', '-d', dir])
    if (unzip.status !== 0) throw new Error(`${zip}: ${unzip.stderr}`)
  }
  const files = readdirSync(dir)
  const read = (suffix) => {
    const name = files.find((f) => f.endsWith(suffix))
    if (!name) throw new Error(`${layer.asset}: ${suffix} fehlt`)
    return 'data:image/jpeg;base64,' + readFileSync(join(dir, name)).toString('base64')
  }
  sources.push({ color: read('_Color.jpg'), normal: read('_NormalGL.jpg') })
  console.log(`geladen ${layer.id} <- ${layer.asset}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
const out = await page.evaluate(
  async ({ sources, size }) => {
    const load = (src) =>
      new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = src
      })
    const strip = (draw) => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size * sources.length
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      return { canvas, ctx }
    }
    const detail = strip()
    const normal = strip()
    for (let i = 0; i < sources.length; i++) {
      const color = await load(sources[i].color)
      detail.ctx.drawImage(color, 0, i * size, size, size)
      const image = detail.ctx.getImageData(0, i * size, size, size)
      const px = image.data
      const count = size * size
      let mean = 0
      let square = 0
      for (let p = 0; p < count; p++) {
        const l = (0.2126 * px[p * 4] + 0.7152 * px[p * 4 + 1] + 0.0722 * px[p * 4 + 2]) / 255
        mean += l
        square += l * l
      }
      mean /= count
      const std = Math.sqrt(Math.max(square / count - mean * mean, 1e-6))
      for (let p = 0; p < count; p++) {
        const l = (0.2126 * px[p * 4] + 0.7152 * px[p * 4 + 1] + 0.0722 * px[p * 4 + 2]) / 255
        // Mittelwert 0,5, eine Standardabweichung = 0,125. Damit bleibt Platz
        // fuer vier Abweichungen, bevor der Wert am Rand klemmt.
        const v = Math.round(Math.min(1, Math.max(0, 0.5 + ((l - mean) / std) * 0.125)) * 255)
        px[p * 4] = px[p * 4 + 1] = px[p * 4 + 2] = v
      }
      detail.ctx.putImageData(image, 0, i * size)
      normal.ctx.drawImage(await load(sources[i].normal), 0, i * size, size, size)
    }
    return {
      detail: detail.canvas.toDataURL('image/jpeg', 0.88),
      normal: normal.canvas.toDataURL('image/jpeg', 0.9),
    }
  },
  { sources, size: SIZE },
)
await browser.close()

for (const [name, url] of Object.entries(out)) {
  writeFileSync(`public/textures/surfaces-${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'))
}

const licenses = [
  '# Texturen - Quellen und Lizenzen',
  '',
  'Alle Texturen stammen von ambientCG und stehen unter CC0 1.0 Universal',
  '(https://docs.ambientcg.com/license/). Erzeugt mit `node tools/pack-textures.mjs`,',
  'Layerreihenfolge aus `src/core/surfaceLayers.json`.',
  '',
  '| Datei | Layer | Asset | Quelle | Lizenz |',
  '|---|---|---|---|---|',
]
layers.forEach((layer, i) => {
  for (const file of ['surfaces-detail.jpg', 'surfaces-normal.jpg']) {
    licenses.push(`| ${file} | ${i} ${layer.id} | ${layer.asset} | https://ambientcg.com/view?id=${layer.asset} | CC0 1.0 |`)
  }
})
writeFileSync('public/textures/LICENSES.md', licenses.join('\n') + '\n')
console.log(`fertig: ${layers.length} Layer`)
