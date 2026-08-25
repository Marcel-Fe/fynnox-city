/**
 * Gerahmte Aufnahmen einzelner Weltteile - fuer Optikarbeit, nicht fuer Abnahmen.
 *
 * Aufruf ueber denselben Weg wie eine Suite, weil der Preview-Server sonst
 * mitten im Lauf aufhoert:
 *
 *   sh run-suite.sh tools/shot.mjs views/turm.json
 *
 * Die Ansichtsdatei ist ein Array aus { name, pos: [x,y,z], yaw, pitch? }.
 * `pos` ist der Standort der Figur, `yaw` die Blickrichtung der Kamera in
 * Bogenmass - dieselbe Groesse wie `OrbitCameraRig.yaw`, also 0 = Blick nach
 * -Z, -PI/2 = Blick nach +X.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const OUT = process.argv[2] ?? './shots'
const URL = process.argv[3] ?? 'http://localhost:4173/'
const VIEWS = process.argv[4]
if (!VIEWS) {
  console.error('Ansichtsdatei fehlt: sh run-suite.sh tools/shot.mjs <views.json>')
  process.exit(1)
}
const views = JSON.parse(readFileSync(VIEWS, 'utf8'))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 780 } })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, null, { timeout: 90000 })
await page.evaluate(() => window.fynnoxQa.closeOnboarding())
// Ohne die hohe Stufe zeigt die Aufnahme nicht das, was ein Spieler am Rechner
// sieht - Headless-Chromium meldet zu wenige Kerne fuer die Automatik.
await page.evaluate(() => window.fynnoxQa.setDetail(true))

for (const v of views) {
  await page.evaluate(([x, y, z]) => window.fynnoxQa.teleport(x, y, z), v.pos)
  await page.evaluate((yaw) => window.fynnoxQa.setCameraYaw(yaw), v.yaw)
  if (v.pitch !== undefined) await page.evaluate((p) => window.fynnoxQa.addLook(0, p), v.pitch)
  // Headless rendert rund ein Bild pro Sekunde; die Kamera braucht ein paar
  // Bilder, bis ihr Nachlauf am Ziel steht.
  await page.evaluate(async () => {
    for (let i = 0; i < 14; i++) await new Promise(requestAnimationFrame)
  })
  await page.screenshot({ path: `${OUT}/${v.name}.png` })
  console.log(`Aufnahme ${v.name}`)
}

await browser.close()
