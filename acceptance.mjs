import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? './shots'
const URL = process.argv[3] ?? 'http://localhost:4173/'
mkdirSync(OUT, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
}

/**
 * Der Start wartet seit dem geladenen Fynnox-Modell auf ein Asset, und der
 * Softwarerenderer im Headless-Betrieb braucht fuer den Weltaufbau ohnehin
 * rund neun Sekunden. Sobald eine zweite Seite parallel rendert - die
 * Mobilansicht weiter unten - reichten die alten 30 s nicht mehr zuverlaessig.
 *
 * Achtung auf die Argumentfolge: `waitForFunction(fn, arg, options)`. Stand die
 * Wartezeit an zweiter Stelle, war sie das Argument der Funktion und Playwright
 * nahm still die Standardzeit von 30 s - der Lauf brach dann mit "Timeout
 * 30000ms" ab, obwohl im Code 90000 stand.
 */
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 780 } })
/**
 * Playwright bricht jede Aktion nach 30 s ab. Das ist fuer eine Maschine
 * gedacht, die Bilder in Millisekunden liefert - hier rechnet der
 * Softwarerenderer 2,6 s an einem Bild, und schon ein Klick auf einen Knopf
 * wartet danach auf ein freies Zeitfenster im blockierten Hauptthread. Die
 * Grenze gilt fuer Klicks, Navigation und Aufnahmen gleichermassen, deshalb
 * steht sie hier einmal zentral statt an jedem Aufruf.
 */
page.setDefaultTimeout(180000)
page.setDefaultNavigationTimeout(180000)
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, null, { timeout: 90000 })

const state = () => page.evaluate(() => window.fynnoxQa.state())

/**
 * Laesst die Seite `n` Bilder rechnen.
 *
 * Alles Zeitabhaengige in dieser Abnahme wird in Bildern gemessen, nicht in
 * Millisekunden. Die Spielzeit ist pro Bild auf 0,05 s gedeckelt
 * (`Game.update`), waehrend ein Bild im Softwarerenderer je nach Maschine
 * zwischen 1 und 3 Sekunden braucht. Eine Wartezeit in Millisekunden misst
 * damit nicht die Spielzeit, sondern die Tagesform des Rechners.
 */
const frames = (n) =>
  page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame)
  }, n)

/**
 * Wartet auf einen Zustand, gemessen in gerechneten Bildern.
 *
 * Die alten Millisekunden-Budgets waren auf rund ein Bild pro Sekunde
 * ausgelegt. Auf einer Vier-Kern-Maschine mit 0,38 Bildern pro Sekunde wurden
 * aus 90 s nur 34 Bilder und damit 1,7 s Spielzeit - die Boarding-Kette
 * braucht allein 1,55 s und blieb deshalb regelmaessig auf halbem Weg stehen.
 * In Bildern gerechnet steht das Budget unabhaengig von der Maschine fest.
 */
async function until(predicate, budget = 60, label = '') {
  let last = await state()
  for (let i = 0; i < budget && !predicate(last); i += 3) {
    await frames(3)
    last = await state()
  }
  if (!predicate(last) && label) console.log(`  (Zeitueberschreitung bei ${label})`)
  return last
}

/**
 * Aufnahme als Beleg.
 *
 * Grosszuegiges Zeitlimit: der Softwarerenderer braucht fuer ein Bild der
 * Mobilansicht - 1170 x 2532 Pixel bei dreifacher Punktdichte - deutlich
 * laenger als die 30 s, die Playwright standardmaessig zulaesst. Ein fehlender
 * Beleg darf den Lauf trotzdem nicht abbrechen: die Pruefungen lesen den
 * Zustand ueber `window.fynnoxQa`, nicht das Bild. Er wird gemeldet.
 */
async function shot(target, name) {
  try {
    await target.screenshot({ path: `${OUT}/${name}`, timeout: 180000 })
  } catch (error) {
    console.log(`  (Aufnahme ${name} nicht moeglich: ${error.name})`)
  }
}

/** Simuliert gehaltene Eingabe ueber mehrere gerechnete Bilder. */
async function hold(x, y, count = 45) {
  await page.evaluate(([x, y]) => window.fynnoxQa.setStick(x, y), [x, y])
  await frames(count)
  await page.evaluate(() => window.fynnoxQa.setStick(0, 0))
  await frames(2)
}

// --- 1. Start und Onboarding ----------------------------------------------
await frames(3)
await shot(page, `01-onboarding.png`)
check('Onboarding-Overlay sichtbar', (await page.locator('#onboarding.visible').count()) === 1)
for (let i = 0; i < 5; i++) {
  await page.click('#onboarding-next')
  await frames(2)
}
check('Onboarding abschliessbar', (await page.locator('#onboarding.visible').count()) === 0)
await frames(2)
await shot(page, `02-start.png`)

const start = await until((s) => s.grounded, 40, 'Bodenkontakt')
check('Fynnox steht auf dem Gehweg', start.grounded && Math.abs(start.player[1] - 0.15) < 0.3,
  `y=${start.player[1].toFixed(2)}`)

// --- 2. Bewegung und freie Kamera -----------------------------------------
await hold(0, 1, 25)
const moved = await state()
const distance = Math.hypot(moved.player[0] - start.player[0], moved.player[2] - start.player[2])
check('Fynnox bewegt sich', distance > 2.0, `${distance.toFixed(2)} m`)

const yawBefore = moved.cameraYaw
for (let i = 0; i < 30; i++) await page.evaluate(() => window.fynnoxQa.addLook(40, 0))
await frames(2)
const looked = await state()
check('Kamera frei drehbar', Math.abs(looked.cameraYaw - yawBefore) > 1.5,
  `${(looked.cameraYaw - yawBefore).toFixed(2)} rad`)

// --- 3. Gebaeude vollstaendig umrunden ------------------------------------
const around = [
  [9, 0.4, -19, 'sued'],
  [17, 0.4, -28, 'ost'],
  [9, 0.4, -37, 'nord'],
  [1.6, 0.4, -28, 'west'],
]
let allSides = true
for (const [x, y, z, side] of around) {
  await page.evaluate(([x, y, z]) => window.fynnoxQa.teleport(x, y, z), [x, y, z])
  const s = await until((s) => s.grounded, 30, `Seite ${side}`)
  await shot(page, `03-block-${side}.png`)
  if (!s.grounded) allSides = false
}
check('Block A von allen vier Seiten begehbar', allSides)

// --- 4. Parkour: Kletterkante ---------------------------------------------
await page.evaluate(() => window.fynnoxQa.setCameraYaw(0))
await page.evaluate(() => window.fynnoxQa.teleport(6, 0.4, -17.4, Math.PI))
const beforeClimb = await until((s) => s.grounded, 30)
await page.evaluate(() => window.fynnoxQa.setStick(0, 1))
for (let i = 0; i < 20; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
await page.evaluate(() => window.fynnoxQa.press('jump'))
for (let i = 0; i < 60; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
await page.evaluate(() => window.fynnoxQa.setStick(0, 0))
const samples = []
for (let i = 0; i < 25; i++) {
  const s = await state()
  samples.push(`${s.player[1].toFixed(2)}${s.mantling ? 'M' : ''}${s.controlEnabled ? '' : 'X'}`)
  await frames(2)
}
console.log(`  (Hoehenverlauf: ${samples.join(' ')})`)
console.log(`  (Position: ${(await state()).player.map((v) => v.toFixed(2)).join(', ')})`)
const afterClimb = await until((s) => s.player[1] > beforeClimb.player[1] + 0.7, 60, 'Kletterkante')
check('Kletterkante ueberwindbar', afterClimb.player[1] > beforeClimb.player[1] + 0.7,
  `${beforeClimb.player[1].toFixed(2)} -> ${afterClimb.player[1].toFixed(2)} m`)
await shot(page, `04-parkour.png`)

// --- 5. Fahrzeug: Einsteigen ----------------------------------------------
await page.evaluate(() => window.fynnoxQa.placeVehicle(-24, 0.2, -13, Math.PI / 2))
await page.evaluate(() => window.fynnoxQa.teleport(-24, 0.4, -11))
await until((s) => s.grounded, 30)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const seated = await until((s) => s.boarding === 'seated', 150, 'Boarding')
check('Boarding-Kette bis vehicle_control',
  seated.boarding === 'seated' && seated.boardingState === 'vehicle_control',
  `${seated.boarding}/${seated.boardingState}`)
check('Input-Kontext ist ctx_vehicle', seated.context === 'ctx_vehicle', seated.context)
check('HUD-Zustand hud_vehicle', seated.hud === 'hud_vehicle', seated.hud)
check('Kameraprofil cam_vehicle_land', seated.camera === 'cam_vehicle_land', seated.camera)
await shot(page, `05-seated.png`)

// --- 6. Fahren -------------------------------------------------------------
const parked = [seated.vehicle[0], seated.vehicle[2]]
await hold(0.15, 1, 120)
const driven = await until(
  (s) => Math.hypot(s.vehicle[0] - parked[0], s.vehicle[2] - parked[1]) > 6,
  60,
  'Fahrt',
)
const drivenDistance = Math.hypot(driven.vehicle[0] - parked[0], driven.vehicle[2] - parked[1])
check('City Spark faehrt', drivenDistance > 6, `${drivenDistance.toFixed(1)} m`)
await shot(page, `06-driving.png`)

// --- 7. Safe Exit blockiert -> Verweigerung -------------------------------
await page.evaluate(() => window.fynnoxQa.placeVehicle(31, 0.4, -28, 0))
await frames(2)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const blocked = await until((s) => s.denial !== null, 90, 'Ausstieg-Verweigerung')
check('Blockierter Ausstieg wird verweigert', blocked.boarding === 'seated' && blocked.denial !== null,
  `${blocked.boarding} / ${blocked.denial}`)
const insideAfterDenial = Math.hypot(
  blocked.player[0] - blocked.vehicle[0],
  blocked.player[2] - blocked.vehicle[2],
)
check('Fynnox bleibt im Fahrzeug statt durch die Wand zu teleportieren', insideAfterDenial < 1.0,
  `${insideAfterDenial.toFixed(2)} m vom Fahrzeugmittelpunkt`)
await shot(page, `07-exit-denied.png`)

// --- 8. Safe Exit frei -> Ausstieg ----------------------------------------
await page.evaluate(() => window.fynnoxQa.placeVehicle(-24, 0.2, -13, Math.PI / 2))
await frames(2)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const exited = await until((s) => s.boarding === 'on_foot', 150, 'Ausstieg')
check('Ausstieg an freiem Anker', exited.boarding === 'on_foot' && exited.context === 'ctx_on_foot',
  `${exited.boarding}/${exited.context}`)
const beside = Math.hypot(exited.player[0] - exited.vehicle[0], exited.player[2] - exited.vehicle[2])
check('Fynnox steht neben dem Fahrzeug', beside > 1.2 && beside < 3.5, `${beside.toFixed(2)} m`)
await shot(page, `08-exited.png`)

// --- 9. Sammeln ------------------------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-30, 1.5, -22))
const collected = await until((s) => s.sparks >= 1, 40, 'Sammeln')
check('Stadtfunken eingesammelt', collected.sparks >= 1 && collected.wallet >= 5,
  `${collected.sparks} Funken / ${collected.wallet} Taler`)

// --- 10. Mission: Impuls scannen ------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-36, 0.4, -21.6))
await until((s) => s.grounded, 30)
await page.evaluate(() => window.fynnoxQa.press('scanner'))
const scanning = await until((s) => s.scanner === true, 40, 'Scanner an')
check('PawLink wechselt nach ctx_scanner', scanning.scanner && scanning.context === 'ctx_scanner',
  scanning.context)
await shot(page, `09-scanner.png`)
await page.evaluate(() => window.fynnoxQa.press('interact'))
const briefed = await until((s) => s.mission === 'travel', 40, 'Missionsstart')
check('Mission startet Anreise', briefed.mission === 'travel', briefed.mission)

// --- 11. Scanner-Raetsel ---------------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-13.8, 0.5, 23.4))
const atWorks = await until((s) => s.mission === 'puzzle', 60, 'Anreise')
check('Missionsschritt Raetsel erreicht', atWorks.mission === 'puzzle', atWorks.mission)

// Falsche Reihenfolge zuerst: darf nur zuruecksetzen, nichts kosten.
const walletBefore = atWorks.wallet
await page.evaluate(() => window.fynnoxQa.teleport(-8.2, 0.5, 23.4))
await until((s) => s.grounded, 30)
await page.evaluate(() => window.fynnoxQa.press('interact'))
await frames(2)
const wrongOrder = await state()
check('Falsche Reihenfolge setzt zurueck statt zu bestrafen',
  wrongOrder.puzzleProgress === 0 && wrongOrder.wallet === walletBefore,
  `progress=${wrongOrder.puzzleProgress}, wallet=${wrongOrder.wallet}`)

await page.evaluate(() => window.fynnoxQa.teleport(-13.8, 0.5, 23.4))
await until((s) => s.grounded, 30)
await page.evaluate(() => window.fynnoxQa.press('interact'))
const firstValve = await until((s) => s.puzzleProgress === 1, 40, 'Ventil 1')
check('Erstes Ventil steht', firstValve.puzzleProgress === 1, `progress=${firstValve.puzzleProgress}`)

await page.evaluate(() => window.fynnoxQa.teleport(-8.2, 0.5, 23.4))
await until((s) => s.grounded, 30)
await page.evaluate(() => window.fynnoxQa.press('interact'))
const solved = await until((s) => s.puzzleSolved, 40, 'Raetsel')
check('Raetsel geloest', solved.puzzleSolved)
check('Hafenbrunnen reaktiviert', solved.fountain)
check('Tor des vierten Wegs offen', solved.gateOpen)
await shot(page, `10-puzzle-solved.png`)

// --- 12. Der vierte Weg fuehrt wirklich aufs Dach -------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-4.8, 5.8, 13.2))
const onRoof = await until((s) => s.grounded && s.player[1] > 4.5, 60, 'Dach')
check('Wartungstreppe endet auf dem Werksdach', onRoof.grounded && onRoof.player[1] > 4.5,
  `y=${onRoof.player[1].toFixed(2)}`)

// --- 13. Payoff ------------------------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(10, 0.9, 22))
const done = await until((s) => s.mission === 'done', 60, 'Payoff')
check('Mission abgeschlossen', done.mission === 'done', done.mission)
await shot(page, `11-fountain.png`)

// --- 14. Stadtprojekt ausbauen --------------------------------------------
const sparkSpots = [
  [2, 1.2, 12],
  [18, 1.2, 29],
  [10, 1.7, 36],
  [42, 1.5, 33],
]
for (const [x, y, z] of sparkSpots) {
  await page.evaluate(([x, y, z]) => window.fynnoxQa.teleport(x, y, z), [x, y, z])
  await frames(2)
}
await page.evaluate(() => window.fynnoxQa.teleport(-6, 0.5, 22.6))
await until((s) => s.grounded, 30)
const atStation = await state()
console.log(`  (Station-Prompt: ${atStation.prompt}, Spieler: ${atStation.player.map((v) => v.toFixed(2)).join(', ')}, Taler: ${atStation.wallet})`)
let stage = atStation.projectStage
let redeemed = 0
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.fynnoxQa.press('interact'))
  await frames(2)
  const s = await state()
  if (s.projectStage > stage) {
    stage = s.projectStage
    redeemed++
  }
}
const project = await state()
check('Stadtprojekt waechst sichtbar', redeemed >= 1,
  `${redeemed} Stufe(n), jetzt ${project.projectState}`)
check('Wallet nie negativ', project.wallet >= 0, `${project.wallet} Taler`)
await page.evaluate(() => window.fynnoxQa.teleport(-20, 0.6, 24))
await frames(3)
await shot(page, `12-project.png`)

// --- 15. Speichern und Neuladen -------------------------------------------
const before = await state()
await page.evaluate(() => window.fynnoxQa.save())
await frames(2)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, null, { timeout: 90000 })
await frames(6)
const after = await state()
check('Raetselzustand ueberlebt Neuladen', after.puzzleSolved === before.puzzleSolved)
check('Brunnen laeuft nach Neuladen', after.fountain === true)
check('Tor bleibt offen', after.gateOpen === true)
check('Stadtprojekt-Zustand erhalten', after.projectStage === before.projectStage,
  `${before.projectState} -> ${after.projectState}`)
check('Wallet erhalten', after.wallet === before.wallet, `${before.wallet} -> ${after.wallet}`)
check('Gesammelte Funken erhalten', after.sparks === before.sparks, `${before.sparks} -> ${after.sparks}`)
check('Mission erhalten', after.mission === before.mission)
check('Start nach Laden zu Fuss', after.context === 'ctx_on_foot')
check('Kein Onboarding nach gespeichertem Stand',
  (await page.locator('#onboarding.visible').count()) === 0)
await page.evaluate(() => window.fynnoxQa.teleport(-20, 0.6, 24))
await frames(4)
await shot(page, `13-after-reload.png`)

// --- 16. Mobile Ansicht ----------------------------------------------------
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
})
mobile.setDefaultTimeout(180000)
mobile.setDefaultNavigationTimeout(180000)
await mobile.goto(URL, { waitUntil: 'networkidle' })
await mobile.waitForFunction(() => window.fynnoxQa !== undefined, null, { timeout: 90000 })
await mobile.waitForTimeout(1500)
await mobile.evaluate(() => window.fynnoxQa.closeOnboarding())
await mobile.waitForTimeout(900)
await shot(mobile, `14-mobile.png`)
const stickBox = await mobile.locator('#stick').boundingBox()
check('Touch-Stick auf Mobilgeraet sichtbar', stickBox !== null && stickBox.width > 100)
const btn = await mobile.locator('.btn[data-button="interact"]').boundingBox()
const deviceMin = btn ? Math.min(btn.width, btn.height) * 3 : 0
check('Touchziel erfuellt 88-px-Vorgabe', deviceMin >= 88, `${deviceMin.toFixed(0)} Geraetepixel`)

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden.`)
process.exit(failed.length === 0 ? 0 : 1)




