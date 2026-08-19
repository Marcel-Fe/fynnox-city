import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * Achsenabnahme der Steuerung.
 *
 * Die Welt kennt zwei Vorwaertsachsen: Figurenmodelle sind mit der Schnauze
 * nach +Z gebaut, Fahrzeuge folgen der Paketkonvention "Vorderseite nach -Z".
 * Ein Vorzeichenfehler dazwischen faellt in keiner der anderen Suiten auf -
 * die pruefen Zustandsketten und Entfernungen, und die stimmen auch dann,
 * wenn Fynnox rueckwaerts im Sitz haengt oder A und D vertauscht sind.
 * Diese Suite misst deshalb Richtungen gegen die Kamera, nicht Zustaende.
 */

const OUT = process.argv[2] ?? './shots'
const URL = process.argv[3] ?? 'http://localhost:4173/'
mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, { timeout: 30000 })
await page.evaluate(() => localStorage.clear())

const state = () => page.evaluate(() => window.fynnoxQa.state())
const wait = (ms) => page.waitForTimeout(ms)
const frames = async (count) => {
  for (let i = 0; i < count; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
}
async function untilFrames(predicate, batches = 60, batch = 6) {
  let last = await state()
  for (let i = 0; i < batches; i++) {
    if (predicate(last)) return last
    await frames(batch)
    last = await state()
  }
  return last
}
const stick = (x, y) => page.evaluate(([x, y]) => window.fynnoxQa.setStick(x, y), [x, y])

for (let i = 0; i < 5; i++) { await page.click('#onboarding-next'); await wait(90) }
await frames(8)

/**
 * Kamerayaw 0 stellt die Kamera auf +Z hinter den Spieler; sie blickt nach -Z.
 * Damit ist "im Bild vorwaerts" gleich -Z und "im Bild rechts" gleich +X.
 */
const FREE_SPOT = [20, 1.2, -12]

/** Laesst den Stick eine Weile stehen und liefert die zurueckgelegte Strecke. */
async function walk(x, y) {
  await page.evaluate(([p]) => {
    window.fynnoxQa.setStick(0, 0)
    window.fynnoxQa.teleport(p[0], p[1], p[2], 0)
    window.fynnoxQa.setCameraYaw(0)
  }, [FREE_SPOT])
  await frames(10)
  const before = await state()
  await stick(x, y)
  await frames(22)
  const after = await state()
  await stick(0, 0)
  return { dx: after.player[0] - before.player[0], dz: after.player[2] - before.player[2] }
}

// --- 1. Laufrichtungen gegen die Kamera ----------------------------------
const forward = await walk(0, 1)
check('Vorwaerts laeuft von der Kamera weg', forward.dz < -1.5 && Math.abs(forward.dx) < 0.6,
  `dx=${forward.dx.toFixed(2)} dz=${forward.dz.toFixed(2)}`)

const back = await walk(0, -1)
check('Rueckwaerts laeuft auf die Kamera zu', back.dz > 1.5 && Math.abs(back.dx) < 0.6,
  `dx=${back.dx.toFixed(2)} dz=${back.dz.toFixed(2)}`)

const right = await walk(1, 0)
check('Rechts laeuft nach rechts im Bild', right.dx > 1.5 && Math.abs(right.dz) < 0.6,
  `dx=${right.dx.toFixed(2)} dz=${right.dz.toFixed(2)}`)

const left = await walk(-1, 0)
check('Links laeuft nach links im Bild', left.dx < -1.5 && Math.abs(left.dz) < 0.6,
  `dx=${left.dx.toFixed(2)} dz=${left.dz.toFixed(2)}`)

// Rechtshaendige Basis: die Diagonale muss die Summe der Einzelachsen sein.
const diagonal = await walk(1, 1)
check('Diagonale vorne-rechts spiegelt nicht',
  diagonal.dx > 0.8 && diagonal.dz < -0.8,
  `dx=${diagonal.dx.toFixed(2)} dz=${diagonal.dz.toFixed(2)}`)

// --- 2. Fynnox sitzt vorwaerts im Fahrzeug -------------------------------
// Die Kamera blickt dem Auto absichtlich entgegen: genau so kommt ein Spieler
// beim Fahrzeug an, und genau dann faellt eine nicht mitgedrehte Kamera auf.
await page.evaluate(() => {
  window.fynnoxQa.placeVehicle(20, 0, -12, 0)
  window.fynnoxQa.teleport(18.2, 0.2, -11.8, 0)
  window.fynnoxQa.setCameraYaw(Math.PI)
})
await frames(8)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const seated = await untilFrames((s) => s.boarding === 'seated', 60, 6)
check('Eingestiegen', seated.boarding === 'seated', `${seated.boarding}/${seated.boardingState}`)

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const facing = Math.abs(norm(seated.playerHeading - seated.activeVehicleHeading))
// Figurenachse +Z gegen Fahrzeugachse -Z: eine halbe Drehung ist richtig, 0 hiesse
// Fynnox schaut nach hinten.
check('Fynnox sitzt in Fahrtrichtung', Math.abs(facing - Math.PI) < 0.05,
  `differenz=${facing.toFixed(3)} rad, erwartet ${Math.PI.toFixed(3)}`)

const camBehind = [
  seated.cameraPosition[0] - seated.vehicle[0],
  seated.cameraPosition[2] - seated.vehicle[2],
]
// Fahrzeug mit heading 0 zeigt nach -Z, hinter ihm liegt +Z.
check('Kamera steht nach dem Einsteigen hinter dem Fahrzeug',
  camBehind[1] > 2 && Math.abs(camBehind[0]) < 2,
  `dx=${camBehind[0].toFixed(2)} dz=${camBehind[1].toFixed(2)}`)

// --- 3. Fahrtrichtungen gegen die Kamera ---------------------------------
const beforeGas = await state()
await stick(0, 1)
await frames(18)
const afterGas = await state()
check('Gas faehrt nach vorn, weg von der Kamera',
  afterGas.vehicle[2] - beforeGas.vehicle[2] < -1.5,
  `dz=${(afterGas.vehicle[2] - beforeGas.vehicle[2]).toFixed(2)}`)

await stick(1, 1)
await frames(22)
const afterSteer = await state()
check('Lenken nach rechts zieht nach rechts',
  afterSteer.vehicle[0] - afterGas.vehicle[0] > 0.8,
  `dx=${(afterSteer.vehicle[0] - afterGas.vehicle[0]).toFixed(2)}, heading ${afterGas.activeVehicleHeading.toFixed(2)} -> ${afterSteer.activeVehicleHeading.toFixed(2)}`)
await stick(0, 0)

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden.`)
process.exit(failed.length === 0 ? 0 : 1)
