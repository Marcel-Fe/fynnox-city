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

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 780 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, { timeout: 30000 })

const state = () => page.evaluate(() => window.fynnoxQa.state())
const wait = (ms) => page.waitForTimeout(ms)

/** Headless rendert langsam; deshalb auf Zustaende warten statt auf Uhrzeit. */
async function until(predicate, timeout = 20000, label = '') {
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

/** Simuliert gehaltene Eingabe ueber mehrere gerenderte Frames. */
async function hold(x, y, frames = 45) {
  await page.evaluate(([x, y]) => window.fynnoxQa.setStick(x, y), [x, y])
  for (let i = 0; i < frames; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.evaluate(() => window.fynnoxQa.setStick(0, 0))
  await wait(150)
}

// --- 1. Start und Onboarding ----------------------------------------------
await wait(700)
await page.screenshot({ path: `${OUT}/01-onboarding.png` })
check('Onboarding-Overlay sichtbar', (await page.locator('#onboarding.visible').count()) === 1)
for (let i = 0; i < 5; i++) {
  await page.click('#onboarding-next')
  await wait(120)
}
check('Onboarding abschliessbar', (await page.locator('#onboarding.visible').count()) === 0)
await wait(600)
await page.screenshot({ path: `${OUT}/02-start.png` })

const start = await until((s) => s.grounded, 8000, 'Bodenkontakt')
check('Fynnox steht auf dem Gehweg', start.grounded && Math.abs(start.player[1] - 0.15) < 0.3,
  `y=${start.player[1].toFixed(2)}`)

// --- 2. Bewegung und freie Kamera -----------------------------------------
await hold(0, 1, 25)
const moved = await state()
const distance = Math.hypot(moved.player[0] - start.player[0], moved.player[2] - start.player[2])
check('Fynnox bewegt sich', distance > 2.0, `${distance.toFixed(2)} m`)

const yawBefore = moved.cameraYaw
for (let i = 0; i < 30; i++) await page.evaluate(() => window.fynnoxQa.addLook(40, 0))
await wait(400)
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
  const s = await until((s) => s.grounded, 6000, `Seite ${side}`)
  await page.screenshot({ path: `${OUT}/03-block-${side}.png` })
  if (!s.grounded) allSides = false
}
check('Block A von allen vier Seiten begehbar', allSides)

// --- 4. Parkour: Kletterkante ---------------------------------------------
await page.evaluate(() => window.fynnoxQa.setCameraYaw(0))
await page.evaluate(() => window.fynnoxQa.teleport(6, 0.4, -17.4, Math.PI))
const beforeClimb = await until((s) => s.grounded, 6000)
await page.evaluate(() => window.fynnoxQa.setStick(0, 1))
for (let i = 0; i < 20; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
await page.evaluate(() => window.fynnoxQa.press('jump'))
for (let i = 0; i < 60; i++) await page.evaluate(() => new Promise(requestAnimationFrame))
await page.evaluate(() => window.fynnoxQa.setStick(0, 0))
const samples = []
for (let i = 0; i < 25; i++) {
  const s = await state()
  samples.push(`${s.player[1].toFixed(2)}${s.mantling ? 'M' : ''}${s.controlEnabled ? '' : 'X'}`)
  await wait(120)
}
console.log(`  (Hoehenverlauf: ${samples.join(' ')})`)
console.log(`  (Position: ${(await state()).player.map((v) => v.toFixed(2)).join(', ')})`)
const afterClimb = await until((s) => s.player[1] > beforeClimb.player[1] + 0.7, 4000, 'Kletterkante')
check('Kletterkante ueberwindbar', afterClimb.player[1] > beforeClimb.player[1] + 0.7,
  `${beforeClimb.player[1].toFixed(2)} -> ${afterClimb.player[1].toFixed(2)} m`)
await page.screenshot({ path: `${OUT}/04-parkour.png` })

// --- 5. Fahrzeug: Einsteigen ----------------------------------------------
await page.evaluate(() => window.fynnoxQa.placeVehicle(-24, 0.2, -13, Math.PI / 2))
await page.evaluate(() => window.fynnoxQa.teleport(-24, 0.4, -11))
await until((s) => s.grounded, 6000)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const seated = await until((s) => s.boarding === 'seated', 90000, 'Boarding')
check('Boarding-Kette bis vehicle_control',
  seated.boarding === 'seated' && seated.boardingState === 'vehicle_control',
  `${seated.boarding}/${seated.boardingState}`)
check('Input-Kontext ist ctx_vehicle', seated.context === 'ctx_vehicle', seated.context)
check('HUD-Zustand hud_vehicle', seated.hud === 'hud_vehicle', seated.hud)
check('Kameraprofil cam_vehicle_land', seated.camera === 'cam_vehicle_land', seated.camera)
await page.screenshot({ path: `${OUT}/05-seated.png` })

// --- 6. Fahren -------------------------------------------------------------
const parked = [seated.vehicle[0], seated.vehicle[2]]
await hold(0.15, 1, 120)
const driven = await until(
  (s) => Math.hypot(s.vehicle[0] - parked[0], s.vehicle[2] - parked[1]) > 6,
  10000,
  'Fahrt',
)
const drivenDistance = Math.hypot(driven.vehicle[0] - parked[0], driven.vehicle[2] - parked[1])
check('City Spark faehrt', drivenDistance > 6, `${drivenDistance.toFixed(1)} m`)
await page.screenshot({ path: `${OUT}/06-driving.png` })

// --- 7. Safe Exit blockiert -> Verweigerung -------------------------------
await page.evaluate(() => window.fynnoxQa.placeVehicle(31, 0.4, -28, 0))
await wait(500)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const blocked = await until((s) => s.denial !== null, 20000, 'Ausstieg-Verweigerung')
check('Blockierter Ausstieg wird verweigert', blocked.boarding === 'seated' && blocked.denial !== null,
  `${blocked.boarding} / ${blocked.denial}`)
const insideAfterDenial = Math.hypot(
  blocked.player[0] - blocked.vehicle[0],
  blocked.player[2] - blocked.vehicle[2],
)
check('Fynnox bleibt im Fahrzeug statt durch die Wand zu teleportieren', insideAfterDenial < 1.0,
  `${insideAfterDenial.toFixed(2)} m vom Fahrzeugmittelpunkt`)
await page.screenshot({ path: `${OUT}/07-exit-denied.png` })

// --- 8. Safe Exit frei -> Ausstieg ----------------------------------------
await page.evaluate(() => window.fynnoxQa.placeVehicle(-24, 0.2, -13, Math.PI / 2))
await wait(500)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const exited = await until((s) => s.boarding === 'on_foot', 90000, 'Ausstieg')
check('Ausstieg an freiem Anker', exited.boarding === 'on_foot' && exited.context === 'ctx_on_foot',
  `${exited.boarding}/${exited.context}`)
const beside = Math.hypot(exited.player[0] - exited.vehicle[0], exited.player[2] - exited.vehicle[2])
check('Fynnox steht neben dem Fahrzeug', beside > 1.2 && beside < 3.5, `${beside.toFixed(2)} m`)
await page.screenshot({ path: `${OUT}/08-exited.png` })

// --- 9. Sammeln ------------------------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-30, 1.5, -22))
const collected = await until((s) => s.sparks >= 1, 8000, 'Sammeln')
check('Stadtfunken eingesammelt', collected.sparks >= 1 && collected.wallet >= 5,
  `${collected.sparks} Funken / ${collected.wallet} Taler`)

// --- 10. Mission: Impuls scannen ------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-36, 0.4, -21.6))
await until((s) => s.grounded, 6000)
await page.evaluate(() => window.fynnoxQa.press('scanner'))
const scanning = await until((s) => s.scanner === true, 8000, 'Scanner an')
check('PawLink wechselt nach ctx_scanner', scanning.scanner && scanning.context === 'ctx_scanner',
  scanning.context)
await page.screenshot({ path: `${OUT}/09-scanner.png` })
await page.evaluate(() => window.fynnoxQa.press('interact'))
const briefed = await until((s) => s.mission === 'travel', 8000, 'Missionsstart')
check('Mission startet Anreise', briefed.mission === 'travel', briefed.mission)

// --- 11. Scanner-Raetsel ---------------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-13.8, 0.5, 23.4))
const atWorks = await until((s) => s.mission === 'puzzle', 10000, 'Anreise')
check('Missionsschritt Raetsel erreicht', atWorks.mission === 'puzzle', atWorks.mission)

// Falsche Reihenfolge zuerst: darf nur zuruecksetzen, nichts kosten.
const walletBefore = atWorks.wallet
await page.evaluate(() => window.fynnoxQa.teleport(-8.2, 0.5, 23.4))
await until((s) => s.grounded, 6000)
await page.evaluate(() => window.fynnoxQa.press('interact'))
await wait(600)
const wrongOrder = await state()
check('Falsche Reihenfolge setzt zurueck statt zu bestrafen',
  wrongOrder.puzzleProgress === 0 && wrongOrder.wallet === walletBefore,
  `progress=${wrongOrder.puzzleProgress}, wallet=${wrongOrder.wallet}`)

await page.evaluate(() => window.fynnoxQa.teleport(-13.8, 0.5, 23.4))
await until((s) => s.grounded, 6000)
await page.evaluate(() => window.fynnoxQa.press('interact'))
const firstValve = await until((s) => s.puzzleProgress === 1, 8000, 'Ventil 1')
check('Erstes Ventil steht', firstValve.puzzleProgress === 1, `progress=${firstValve.puzzleProgress}`)

await page.evaluate(() => window.fynnoxQa.teleport(-8.2, 0.5, 23.4))
await until((s) => s.grounded, 6000)
await page.evaluate(() => window.fynnoxQa.press('interact'))
const solved = await until((s) => s.puzzleSolved, 8000, 'Raetsel')
check('Raetsel geloest', solved.puzzleSolved)
check('Hafenbrunnen reaktiviert', solved.fountain)
check('Tor des vierten Wegs offen', solved.gateOpen)
await page.screenshot({ path: `${OUT}/10-puzzle-solved.png` })

// --- 12. Der vierte Weg fuehrt wirklich aufs Dach -------------------------
await page.evaluate(() => window.fynnoxQa.teleport(-4.8, 5.8, 13.2))
const onRoof = await until((s) => s.grounded && s.player[1] > 4.5, 8000, 'Dach')
check('Wartungstreppe endet auf dem Werksdach', onRoof.grounded && onRoof.player[1] > 4.5,
  `y=${onRoof.player[1].toFixed(2)}`)

// --- 13. Payoff ------------------------------------------------------------
await page.evaluate(() => window.fynnoxQa.teleport(10, 0.9, 22))
const done = await until((s) => s.mission === 'done', 10000, 'Payoff')
check('Mission abgeschlossen', done.mission === 'done', done.mission)
await page.screenshot({ path: `${OUT}/11-fountain.png` })

// --- 14. Stadtprojekt ausbauen --------------------------------------------
const sparkSpots = [
  [2, 1.2, 12],
  [18, 1.2, 29],
  [10, 1.7, 36],
  [42, 1.5, 33],
]
for (const [x, y, z] of sparkSpots) {
  await page.evaluate(([x, y, z]) => window.fynnoxQa.teleport(x, y, z), [x, y, z])
  await wait(500)
}
await page.evaluate(() => window.fynnoxQa.teleport(-6, 0.5, 22.6))
await until((s) => s.grounded, 6000)
const atStation = await state()
console.log(`  (Station-Prompt: ${atStation.prompt}, Spieler: ${atStation.player.map((v) => v.toFixed(2)).join(', ')}, Taler: ${atStation.wallet})`)
let stage = atStation.projectStage
let redeemed = 0
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.fynnoxQa.press('interact'))
  await wait(600)
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
await wait(800)
await page.screenshot({ path: `${OUT}/12-project.png` })

// --- 15. Speichern und Neuladen -------------------------------------------
const before = await state()
await page.evaluate(() => window.fynnoxQa.save())
await wait(500)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, { timeout: 30000 })
await wait(1500)
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
await wait(900)
await page.screenshot({ path: `${OUT}/13-after-reload.png` })

// --- 16. Mobile Ansicht ----------------------------------------------------
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
})
await mobile.goto(URL, { waitUntil: 'networkidle' })
await mobile.waitForFunction(() => window.fynnoxQa !== undefined, { timeout: 30000 })
await mobile.waitForTimeout(1500)
await mobile.evaluate(() => window.fynnoxQa.closeOnboarding())
await mobile.waitForTimeout(900)
await mobile.screenshot({ path: `${OUT}/14-mobile.png` })
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




