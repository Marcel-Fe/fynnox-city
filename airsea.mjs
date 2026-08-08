import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? './shots'
const URL = process.argv[3] ?? 'http://localhost:4173/'
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
/** Laesst die Simulation echte Frames rechnen. */
const frames = async (count) => {
  for (let i = 0; i < count; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
}
/**
 * Headless rendert nur rund ein Bild pro Sekunde. Zeitabhaengige Vorgaenge -
 * Auslaufen, Tauchen, Anlegen - werden deshalb ueber gerechnete Frames
 * abgewartet, nicht ueber die Wanduhr.
 */
async function untilFrames(predicate, batches = 120, batch = 6, label = '') {
  let last = await state()
  for (let i = 0; i < batches; i++) {
    if (predicate(last)) return last
    await frames(batch)
    last = await state()
  }
  if (label) console.log(`  (Frame-Timeout bei ${label})`)
  return last
}
const press = (button) => page.evaluate((b) => window.fynnoxQa.press(b), button)
const release = (button) => page.evaluate((b) => window.fynnoxQa.release(b), button)
const stick = (x, y) => page.evaluate(([x, y]) => window.fynnoxQa.setStick(x, y), [x, y])

for (let i = 0; i < 5; i++) { await page.click('#onboarding-next'); await wait(90) }
await frames(10)

// --- 1. Beide neuen Fahrzeuge liegen an ihrem Steg ------------------------
const start = await untilFrames((s) => s.skyfinDocked !== null && s.scoutDocked !== null, 40, 6, 'Anlegen')
check('Skyfin liegt am Flugsteg', start.skyfinDocked === 'dock_skyfin', String(start.skyfinDocked))
check('Bluefin Scout liegt am Tauchbecken', start.scoutDocked === 'dock_scout', String(start.scoutDocked))
check('Scout startet aufgetaucht', start.scoutSurfaced === true && start.scoutDepth < 0.05,
  `tiefe=${start.scoutDepth.toFixed(2)} m`)

// --- 2. Boarding des Skyfin ------------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-11.6, 0.6, 42.3))
await untilFrames((s) => s.grounded, 30, 4, 'Bodenkontakt Flugsteg')
await press('enterExit')
const inPlane = await untilFrames((s) => s.boarding === 'seated', 120, 6, 'Boarding Skyfin')
check('Boarding-Kette am Skyfin bis vehicle_control',
  inPlane.boarding === 'seated' && inPlane.boardingState === 'vehicle_control',
  `${inPlane.boarding}/${inPlane.boardingState}`)
check('Aktives Fahrzeug ist das Skyfin', inPlane.activeVehicle === 'vehicle_skyfin',
  String(inPlane.activeVehicle))
check('Luft-Kameraprofil cam_vehicle_air aktiv', inPlane.camera === 'cam_vehicle_air', inPlane.camera)
check('Kontext ctx_vehicle / hud_vehicle',
  inPlane.context === 'ctx_vehicle' && inPlane.hud === 'hud_vehicle',
  `${inPlane.context}/${inPlane.hud}`)
check('roll_compensation des Profils ist aktiv', inPlane.cameraRollCompensated === true)
check('Steigen/Sinken-Knoepfe sichtbar',
  (await page.locator('#btn-ascend:not(.hidden)').count()) === 1 &&
  (await page.locator('#btn-descend:not(.hidden)').count()) === 1)
await page.screenshot({ path: `${OUT}/a1-skyfin-cockpit.png` })

// --- 3. Motor gegen die Bremse hochlaufen lassen --------------------------
await press('brake')
await stick(0, 1)
await frames(30)
await stick(0, 0)
await release('brake')
const running = await state()
check('Propeller laeuft nach Gasgeben', running.skyfinPropeller > 0.5,
  `drehzahl=${running.skyfinPropeller.toFixed(2)}`)
check('Skyfin bleibt dabei am Steg', running.skyfinDocked === 'dock_skyfin', String(running.skyfinDocked))

// --- 4. Einstieg bei laufendem Propeller wird verweigert ------------------
await press('enterExit')
const ashore = await untilFrames((s) => s.boarding === 'on_foot', 120, 6, 'Ausstieg Flugsteg')
check('Ausstieg auf den Flugsteg', ashore.boarding === 'on_foot' && ashore.grounded,
  `${ashore.boarding}, y=${ashore.player[1].toFixed(2)}`)
check('Propeller dreht direkt nach dem Aussteigen noch', ashore.skyfinPropeller > 0.04,
  `drehzahl=${ashore.skyfinPropeller.toFixed(2)}`)

await press('enterExit')
const denied = await untilFrames((s) => s.denial !== null, 20, 3, 'Verweigerung Propeller')
check('Einstieg bei laufendem Propeller verweigert',
  denied.boarding === 'on_foot' && /Propeller/.test(denied.denial ?? ''),
  `${denied.boarding} / ${denied.denial}`)
await page.screenshot({ path: `${OUT}/a2-propeller-denied.png` })

// Nach dem Auslaufen geht es wieder - Scheitern kostet nur Zeit.
const cooled = await untilFrames((s) => s.skyfinPropeller < 0.04, 120, 6, 'Propeller-Auslauf')
check('Propeller laeuft von selbst aus', cooled.skyfinPropeller < 0.04,
  `drehzahl=${cooled.skyfinPropeller.toFixed(3)}`)
await press('enterExit')
const inPlaneAgain = await untilFrames((s) => s.boarding === 'seated', 120, 6, 'Zweites Boarding')
check('Einstieg nach Propellerstillstand moeglich', inPlaneAgain.boarding === 'seated',
  `${inPlaneAgain.boarding} / ${inPlaneAgain.denial}`)

// --- 5. Dritte Achse: Steigflug -------------------------------------------
// Startbahn im offenen Becken, damit der Steigflug nicht an der Mole endet.
await page.evaluate(() => window.fynnoxQa.placeSkyfin(-12, 0, 60, Math.PI))
await frames(4)
await stick(0, 1)
await press('ascend')
const climbed = await untilFrames((s) => s.skyfinAirborne && s.skyfin[1] > 5, 60, 4, 'Steigflug')
await release('ascend')
check('Skyfin hebt mit der dritten Achse ab',
  climbed.skyfinAirborne === true && climbed.skyfin[1] > 5,
  `hoehe=${climbed.skyfin[1].toFixed(1)} m, airborne=${climbed.skyfinAirborne}`)
await page.screenshot({ path: `${OUT}/a3-skyfin-flight.png` })

// --- 6. roll_compensation: der Horizont kippt nicht mit -------------------
await stick(1, 1)
const banked = await untilFrames((s) => Math.abs(s.skyfinRoll) > 0.2, 40, 4, 'Kurvenflug')
check('Skyfin legt sich in die Kurve', Math.abs(banked.skyfinRoll) > 0.2,
  `roll=${banked.skyfinRoll.toFixed(3)} rad`)
check('Kamera gleicht die Rollbewegung aus',
  Math.abs(banked.cameraRoll) < Math.abs(banked.skyfinRoll) * 0.5,
  `kamera=${banked.cameraRoll.toFixed(3)} rad, fahrzeug=${banked.skyfinRoll.toFixed(3)} rad`)
await stick(0, 0)

// --- 7. Kein Ausstieg in der Luft -----------------------------------------
await press('enterExit')
const airDenied = await untilFrames((s) => s.denial !== null, 20, 3, 'Verweigerung in der Luft')
check('Ausstieg in der Luft wird verweigert',
  airDenied.boarding === 'seated' && /Luft/.test(airDenied.denial ?? ''),
  `${airDenied.boarding} / ${airDenied.denial}`)

// Zurueck ans Wasser und aussteigen.
await page.evaluate(() => window.fynnoxQa.placeSkyfin(-12, 0, 46.5, -Math.PI / 2))
await untilFrames((s) => s.skyfinDocked === 'dock_skyfin', 30, 4, 'Rueckkehr an den Steg')
await press('enterExit')
const backAshore = await untilFrames((s) => s.boarding === 'on_foot', 120, 6, 'Ausstieg nach Flug')
check('Ausstieg nach dem Flug am Steg', backAshore.boarding === 'on_foot' && backAshore.grounded,
  `${backAshore.boarding}, y=${backAshore.player[1].toFixed(2)}`)

// --- 8. Boarding des Bluefin Scout ----------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(3.0, 0.6, 42.8))
await untilFrames((s) => s.grounded, 30, 4, 'Bodenkontakt Tauchbecken')
await press('enterExit')
const inSub = await untilFrames((s) => s.boarding === 'seated', 120, 6, 'Boarding Scout')
check('Boarding-Kette am Scout bis vehicle_control',
  inSub.boarding === 'seated' && inSub.boardingState === 'vehicle_control',
  `${inSub.boarding}/${inSub.boardingState}`)
check('Aktives Fahrzeug ist der Bluefin Scout',
  inSub.activeVehicle === 'vehicle_bluefin_scout', String(inSub.activeVehicle))
check('Wasser-Kameraprofil cam_vehicle_water aktiv', inSub.camera === 'cam_vehicle_water', inSub.camera)
check('horizon_damping des Profils ist aktiv', inSub.cameraHorizonDamped === true)
await page.screenshot({ path: `${OUT}/a4-scout-cockpit.png` })

// --- 9. Dritte Achse: Tauchfahrt, Kamera laeuft gedaempft nach ------------
await frames(12)
const beforeDive = await state()
const lagBefore = beforeDive.cameraPosition[1] - beforeDive.scout[1]
await press('descend')
let maxLag = lagBefore
let dived = beforeDive
for (let i = 0; i < 45; i++) {
  await frames(4)
  dived = await state()
  maxLag = Math.max(maxLag, dived.cameraPosition[1] - dived.scout[1])
  if (dived.scoutDepth > 2.0) break
}
check('Scout taucht mit der dritten Achse ab',
  dived.scoutDepth > 1.0 && dived.scoutSurfaced === false,
  `tiefe=${dived.scoutDepth.toFixed(2)} m`)
check('horizon_damping laesst die Kamera der Tauchfahrt nachlaufen',
  maxLag - lagBefore > 0.25,
  `${lagBefore.toFixed(2)} -> ${maxLag.toFixed(2)} m`)
await page.screenshot({ path: `${OUT}/a5-scout-dived.png` })

// --- 10. Kein Ausstieg unter Wasser ---------------------------------------
await press('enterExit')
const subDenied = await untilFrames((s) => s.denial !== null, 20, 3, 'Verweigerung getaucht')
check('Ausstieg beim getauchten U-Boot wird verweigert',
  subDenied.boarding === 'seated' && /auftauchen/i.test(subDenied.denial ?? ''),
  `${subDenied.boarding} / ${subDenied.denial}`)
const stillInside = Math.hypot(
  subDenied.player[0] - subDenied.scout[0],
  subDenied.player[2] - subDenied.scout[2],
)
check('Fynnox bleibt im U-Boot statt ins Becken teleportiert zu werden', stillInside < 1.5,
  `${stillInside.toFixed(2)} m vom Rumpfmittelpunkt`)

// --- 11. Auftauchen, entriegeln, aussteigen -------------------------------
await release('descend')
await press('ascend')
const surfaced = await untilFrames((s) => s.scoutSurfaced && !s.scoutHatchLocked, 120, 6, 'Auftauchen')
await release('ascend')
check('Scout taucht wieder auf und entriegelt die Luke',
  surfaced.scoutSurfaced === true && surfaced.scoutHatchLocked === false,
  `tiefe=${surfaced.scoutDepth.toFixed(2)} m, verriegelt=${surfaced.scoutHatchLocked}`)
await untilFrames((s) => s.scoutDocked === 'dock_scout', 40, 6, 'Anlegen Tauchbecken')
await press('enterExit')
const outOfSub = await untilFrames((s) => s.boarding === 'on_foot', 120, 6, 'Ausstieg Scout')
check('Ausstieg auf das Tauchbecken', outOfSub.boarding === 'on_foot' && outOfSub.grounded,
  `${outOfSub.boarding}, y=${outOfSub.player[1].toFixed(2)}`)
check('Kontext zurueck auf ctx_on_foot', outOfSub.context === 'ctx_on_foot', outOfSub.context)
check('Steigen/Sinken-Knoepfe wieder verborgen',
  (await page.locator('#btn-ascend.hidden').count()) === 1 &&
  (await page.locator('#btn-descend.hidden').count()) === 1)
await page.screenshot({ path: `${OUT}/a6-scout-ashore.png` })

// --- 12. Positionen ueberleben location.reload() --------------------------
await page.evaluate(() => window.fynnoxQa.placeSkyfin(-24, 0, 58, 0))
await page.evaluate(() => window.fynnoxQa.placeScout(0, 0, 60, 0))
await frames(10)
const before = await state()
await page.evaluate(() => window.fynnoxQa.save())
await wait(500)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, { timeout: 30000 })
await frames(15)
const after = await state()
check('Skyfin-Position ueberlebt das Neuladen',
  Math.hypot(after.skyfin[0] - before.skyfin[0], after.skyfin[2] - before.skyfin[2]) < 1.5,
  `${before.skyfin.map((v) => v.toFixed(1)).join(',')} -> ${after.skyfin.map((v) => v.toFixed(1)).join(',')}`)
check('Scout-Position ueberlebt das Neuladen',
  Math.hypot(after.scout[0] - before.scout[0], after.scout[2] - before.scout[2]) < 1.5,
  `${before.scout.map((v) => v.toFixed(1)).join(',')} -> ${after.scout.map((v) => v.toFixed(1)).join(',')}`)
check('Beide Fahrzeuge liegen nach dem Laden an der Oberflaeche',
  after.scoutSurfaced === true && after.skyfinAirborne === false,
  `scout=${after.scoutDepth.toFixed(2)} m, skyfin airborne=${after.skyfinAirborne}`)
check('Start nach dem Laden zu Fuss', after.context === 'ctx_on_foot' && after.boarding === 'on_foot',
  `${after.context}/${after.boarding}`)

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden.`)
process.exit(failed.length === 0 ? 0 : 1)
