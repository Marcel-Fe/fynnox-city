import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? './shots'
const URL = process.argv[3] ?? 'http://localhost:4174/'
mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 780 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, { timeout: 30000 })
await page.evaluate(() => localStorage.clear())

const state = () => page.evaluate(() => window.fynnoxQa.state())
const wait = (ms) => page.waitForTimeout(ms)
async function until(predicate, timeout = 25000, label = '') {
  const deadline = Date.now() + timeout
  let last = await state()
  while (Date.now() < deadline) {
    last = await state()
    if (predicate(last)) return last
    await wait(120)
  }
  if (label) console.log(`  (Timeout bei ${label})`)
  return last
}
async function hold(x, y, frames = 60) {
  await page.evaluate(([x, y]) => window.fynnoxQa.setStick(x, y), [x, y])
  for (let i = 0; i < frames; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.evaluate(() => window.fynnoxQa.setStick(0, 0))
  await wait(200)
}

for (let i = 0; i < 5; i++) { await page.click('#onboarding-next'); await wait(90) }
await wait(700)

// --- 1. Wassertaxi liegt am Anleger --------------------------------------
const start = await until((s) => s.waterTaxiDocked !== null, 12000, 'Anlegen')
check('Bluefin liegt beim Start am Stationsanleger', start.waterTaxiDocked === 'mooring_station',
  String(start.waterTaxiDocked))

// --- 2. Dialog mit Mira (ctx_dialogue) ------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(13.2, 0.6, 33.6))
await until((s) => s.grounded, 8000)
await page.evaluate(() => window.fynnoxQa.press('interact'))
const talking = await until((s) => s.dialogue === true, 10000, 'Dialogstart')
check('Dialog startet und wechselt nach ctx_dialogue',
  talking.dialogue && talking.context === 'ctx_dialogue' && talking.hud === 'hud_dialogue',
  `${talking.context}/${talking.hud}`)
check('Gespraechspartner ist Mira', talking.dialogueSpeaker === 'Mira', String(talking.dialogueSpeaker))
await page.screenshot({ path: `${OUT}/h1-dialog.png` })

// Die Welt darf waehrend des Gespraechs nicht einfrieren.
const framesBefore = talking.frames
await wait(1600)
const during = await state()
check('Welt laeuft waehrend des Dialogs weiter', during.frames > framesBefore + 3,
  `${framesBefore} -> ${during.frames} Frames`)
check('Steuerung ruht im Dialog', during.controlEnabled === false)

for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.fynnoxQa.dialogueNext())
  await wait(200)
}
const briefed = await until((s) => s.harborTask === 'briefed', 10000, 'Auftrag')
check('Auftrag freigeschaltet', briefed.harborTask === 'briefed', briefed.harborTask)
check('Kontext zurueck auf ctx_on_foot', briefed.context === 'ctx_on_foot', briefed.context)
check('Steuerung wieder frei', briefed.controlEnabled === true)

// --- 3. Boarding des Wassertaxis ------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(13.6, 0.6, 38.9))
await until((s) => s.grounded, 8000)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const aboard = await until((s) => s.boarding === 'seated', 60000, 'Boarding Boot')
check('Boarding-Kette am Wassertaxi vollstaendig',
  aboard.boarding === 'seated' && aboard.boardingState === 'vehicle_control',
  `${aboard.boarding}/${aboard.boardingState}`)
check('Aktives Fahrzeug ist das Wassertaxi',
  aboard.activeVehicle === 'vehicle_bluefin_water_taxi', String(aboard.activeVehicle))
check('Wasser-Kameraprofil aktiv', aboard.camera === 'cam_vehicle_water', aboard.camera)
await page.screenshot({ path: `${OUT}/h2-aboard.png` })

// --- 4. Ausstieg auf offenem Wasser wird verweigert -----------------------
await page.evaluate(() => window.fynnoxQa.placeWaterTaxi(24, 0, 70, 0))
await wait(600)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const openWater = await until((s) => s.denial !== null, 15000, 'Verweigerung auf See')
check('Kein Ausstieg auf offenem Wasser',
  openWater.boarding === 'seated' && openWater.denial !== null,
  `${openWater.boarding} / ${openWater.denial}`)
await page.screenshot({ path: `${OUT}/h3-open-water.png` })

// --- 5. Fahrt und Anlegen an der Forschungsplattform ----------------------
await page.evaluate(() => window.fynnoxQa.placeWaterTaxi(26.6, 0, 62, Math.PI))
const moored = await until((s) => s.waterTaxiDocked === 'mooring_platform', 15000, 'Anlegen Plattform')
check('Bluefin legt an der Plattform an', moored.waterTaxiDocked === 'mooring_platform',
  String(moored.waterTaxiDocked))

await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const ashore = await until((s) => s.boarding === 'on_foot', 60000, 'Ausstieg Plattform')
check('Ausstieg auf die Plattform', ashore.boarding === 'on_foot', ashore.boarding)
check('Fynnox steht auf dem Plattformdeck', ashore.grounded && ashore.player[1] > 0.4,
  `y=${ashore.player[1].toFixed(2)}`)
await page.screenshot({ path: `${OUT}/h4-platform.png` })

// --- 6. Marine-Lab und Rueckmeldung --------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(31.5, 1.0, 59.0))
await until((s) => s.grounded, 8000)
await page.evaluate(() => window.fynnoxQa.press('interact'))
const sampled = await until((s) => s.harborTask === 'sampled', 12000, 'Marine-Lab')
check('Forschungsprobe ausgewertet', sampled.harborTask === 'sampled', sampled.harborTask)

const walletBefore = sampled.wallet
await page.evaluate(() => window.fynnoxQa.teleport(13.2, 0.6, 33.6))
await until((s) => s.grounded, 8000)
await page.evaluate(() => window.fynnoxQa.press('interact'))
await until((s) => s.dialogue === true, 10000, 'Rueckmeldung')
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.fynnoxQa.dialogueNext())
  await wait(200)
}
const reported = await until((s) => s.harborTask === 'reported', 12000, 'Abschluss')
check('Auftrag abgeschlossen', reported.harborTask === 'reported', reported.harborTask)
check('Belohnung ausgezahlt', reported.wallet === walletBefore + 20,
  `${walletBefore} -> ${reported.wallet}`)

// --- 7. Speichern und Neuladen -------------------------------------------
await page.evaluate(() => window.fynnoxQa.save())
await wait(500)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, { timeout: 30000 })
await wait(1500)
const after = await state()
check('Hafenauftrag ueberlebt Neuladen', after.harborTask === 'reported', after.harborTask)
check('Bootsposition erhalten',
  Math.hypot(after.waterTaxi[0] - reported.waterTaxi[0], after.waterTaxi[2] - reported.waterTaxi[2]) < 1.5,
  `${after.waterTaxi.map((v) => v.toFixed(1)).join(',')}`)
check('Belohnung erhalten', after.wallet === reported.wallet, `${reported.wallet} -> ${after.wallet}`)
check('Kein offener Dialog nach dem Laden', after.dialogue === false)

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden.`)
process.exit(failed.length === 0 ? 0 : 1)

