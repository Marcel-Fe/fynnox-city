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
// Playwright bricht jede Aktion nach 30 s ab. Im Softwarerenderer dieser
// Abnahme braucht ein Bild bis zu 3 s - schon ein Klick wartet danach auf ein
// freies Zeitfenster im blockierten Hauptthread.
page.setDefaultTimeout(180000)
page.setDefaultNavigationTimeout(180000)
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.fynnoxQa !== undefined, null, { timeout: 90000 })
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
/** Winkel auf -PI..PI zurueckfalten - Differenzen sonst um eine volle Drehung daneben. */
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a))

for (let i = 0; i < 5; i++) { await page.click('#onboarding-next'); await wait(90) }
await frames(8)

// Die Achsenpruefungen messen 22 Bilder lang gegen einen festen Kamerawinkel.
// Die Kameranachfuehrung setzt nach 0,5 s ein und liegt damit mitten in diesem
// Fenster - sie wird deshalb hier abgeschaltet und in Abschnitt 7 einzeln
// nachgewiesen. Die Schwellwerte der Achsenpruefungen bleiben unangetastet:
// sie haben 2026-08 drei echte Vorzeichenfehler gefunden.
await page.evaluate(() => window.fynnoxQa.setCameraFollow(false))

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

// --- 1b. Die Kamera fuehrt der Laufrichtung nach -------------------------
// Gemeldet am 09.09.2026, zum zweiten Mal: "Ich sehe nicht, wo ich hinlaufe.
// Wenn ich mich umdrehe, sehe ich nicht, was vor mir ist." Gemessen war der
// Winkel zwischen Blickrichtung und Laufrichtung ueber 36 Bilder konstant 180
// Grad - die Kamera stand still, egal wie weit die Figur lief.
//
// Die zweite Pruefung ist die wichtigere: 2026-08 wurde eine Nachfuehrung mit
// der Begruendung verworfen, sie drehe die Figur mit. Das stimmt fuer eine
// Nachfuehrung, die den yaw einfach mitzieht - die Bewegungsrichtung haengt am
// yaw, die Figur liefe im Kreis. Der Rig rechnet den Nachfuehr-Anteil aus der
// Bewegungsbasis heraus; die Bahn muss deshalb gerade bleiben.
await page.evaluate(([p]) => {
  window.fynnoxQa.setStick(0, 0)
  window.fynnoxQa.setCameraFollow(true)
  window.fynnoxQa.teleport(p[0], p[1], p[2], 0)
  window.fynnoxQa.setCameraYaw(0)
}, [FREE_SPOT])
await frames(10)
const followStart = await state()
await stick(0, -1)
// 8 Bilder sind 0,4 s Spielzeit und liegen damit vor der Verzoegerung von 0,5 s.
await frames(8)
const followEarly = await state()
await frames(46)
const followEnd = await state()
await stick(0, 0)

check('Kurze Schritte drehen die Kamera nicht',
  Math.abs(norm(followEarly.cameraYaw - followStart.cameraYaw)) < 0.15,
  `Yaw ${followStart.cameraYaw.toFixed(2)} -> ${followEarly.cameraYaw.toFixed(2)}`)

const runDx = followEnd.player[0] - followStart.player[0]
const runDz = followEnd.player[2] - followStart.player[2]
// Blickrichtung der Kamera bei yaw phi ist (-sin phi, -cos phi).
const view = [-Math.sin(followEnd.cameraYaw), -Math.cos(followEnd.cameraYaw)]
const runLen = Math.hypot(runDx, runDz)
const cos = (view[0] * runDx + view[1] * runDz) / Math.max(runLen, 1e-6)
const viewToRun = Math.acos(Math.max(-1, Math.min(1, cos)))
check('Kamera schwenkt hinter die Laufrichtung', runLen > 6 && viewToRun < 0.8,
  `${(viewToRun * 180 / Math.PI).toFixed(0)} Grad Rest bei ${runLen.toFixed(1)} m Strecke`)

check('Nachfuehrung dreht die Laufrichtung nicht mit',
  runDz > 6 && Math.abs(runDx) < 1.0,
  `dx=${runDx.toFixed(2)} dz=${runDz.toFixed(2)}`)

// Ab hier wird gefahren und eingestiegen: dort misst die Suite Fahrzeugachsen,
// und die Nachfuehrung gehoert der Figur zu Fuss.
await page.evaluate(() => window.fynnoxQa.setCameraFollow(false))

// --- 2. Fynnox sitzt vorwaerts im Fahrzeug -------------------------------
// Das Auto steht auf der Hauptstrasse und zeigt nach Osten: dort hat es 40 m
// freie Bahn. Nach Norden gerichtet faehrt es nach wenigen Metern gegen den
// Gehweg und die Hecke vor den Schaufenstern - dann misst der Lenktest die
// Kollisionsbremse statt die Lenkung.
const CAR_HEADING = -Math.PI / 2
await page.evaluate((heading) => {
  window.fynnoxQa.placeVehicle(10, 0, -12, heading)
  // Einstiegsanker entry_driver liegt bei heading -PI/2 auf (-0.2, 0, -1.5)
  // relativ zum Rumpf.
  window.fynnoxQa.teleport(9.8, 0.2, -13.6, 0)
  window.fynnoxQa.setCameraYaw(Math.PI / 2)
}, CAR_HEADING)
await frames(8)
await page.evaluate(() => window.fynnoxQa.press('enterExit'))
const seated = await untilFrames((s) => s.boarding === 'seated', 60, 6)
check('Eingestiegen', seated.boarding === 'seated', `${seated.boarding}/${seated.boardingState}`)

const facing = Math.abs(norm(seated.playerHeading - seated.activeVehicleHeading))
// Figurenachse +Z gegen Fahrzeugachse -Z: eine halbe Drehung ist richtig, 0 hiesse
// Fynnox schaut nach hinten.
check('Fynnox sitzt in Fahrtrichtung', Math.abs(facing - Math.PI) < 0.05,
  `differenz=${facing.toFixed(3)} rad, erwartet ${Math.PI.toFixed(3)}`)

// Fahrzeugachse: die Front zeigt nach (-sin h, -cos h), rechts davon liegt
// (cos h, -sin h). Beide Richtungen aus dem Heading zu rechnen haelt den Test
// unabhaengig davon, wie das Auto im Weltraster steht.
const front = (h) => [-Math.sin(h), -Math.cos(h)]
const rightOf = (h) => [Math.cos(h), -Math.sin(h)]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]

const camVec = [
  seated.cameraPosition[0] - seated.vehicle[0],
  seated.cameraPosition[2] - seated.vehicle[2],
]
// Hinter dem Fahrzeug heisst: entgegen der Front.
check('Kamera steht nach dem Einsteigen hinter dem Fahrzeug',
  dot(camVec, front(seated.activeVehicleHeading)) < -2,
  `abstand nach hinten=${(-dot(camVec, front(seated.activeVehicleHeading))).toFixed(2)} m`)

// --- 3. Fahrtrichtungen gegen die Fahrzeugachse --------------------------
const beforeGas = await state()
await stick(0, 1)
await frames(18)
const afterGas = await state()
const gasMove = [afterGas.vehicle[0] - beforeGas.vehicle[0], afterGas.vehicle[2] - beforeGas.vehicle[2]]
check('Gas faehrt nach vorn, weg von der Kamera',
  dot(gasMove, front(CAR_HEADING)) > 1.5 && dot(gasMove, front(CAR_HEADING)) > 0,
  `${dot(gasMove, front(CAR_HEADING)).toFixed(2)} m voraus`)

const h0 = afterGas.activeVehicleHeading
await stick(1, 1)
await frames(18)
const afterSteer = await state()
const steerMove = [afterSteer.vehicle[0] - afterGas.vehicle[0], afterSteer.vehicle[2] - afterGas.vehicle[2]]
// Rechtsdrehung heisst abnehmendes Heading; die Fahrspur muss zusaetzlich
// nach rechts der urspruenglichen Front ausweichen.
const turned = Math.atan2(Math.sin(afterSteer.activeVehicleHeading - h0), Math.cos(afterSteer.activeVehicleHeading - h0))
check('Lenken nach rechts dreht das Fahrzeug nach rechts', turned < -0.2,
  `${turned.toFixed(2)} rad`)
check('Lenken nach rechts traegt das Fahrzeug nach rechts',
  dot(steerMove, rightOf(h0)) > 0.3,
  `${dot(steerMove, rightOf(h0)).toFixed(2)} m nach rechts`)
await stick(0, 0)

// --- 4. Die Welt bewegt sich ---------------------------------------------
// Bewegung ist im Standbild nicht pruefbar; hier zaehlen die Werte zwischen
// zwei Messungen, nicht das Bild.
const motionA = await page.evaluate(() => window.fynnoxQa.motion())
await frames(16)
const motionB = await page.evaluate(() => window.fynnoxQa.motion())

const gullMoved = motionA.gulls.map((p, i) => {
  const q = motionB.gulls[i]
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
})
check('Moewen fliegen ihre Bahn', gullMoved.every((d) => d > 0.5),
  gullMoved.map((d) => d.toFixed(2)).join(' / ') + ' m')
check('Moewen bleiben ueber dem Becken', motionB.gulls.every((p) => p[1] > 3 && p[1] < 20),
  motionB.gulls.map((p) => p[1].toFixed(1)).join(' / ') + ' m hoch')

const tiltMoved = motionA.canopyTilt.some((t, i) => Math.abs(motionB.canopyTilt[i] - t) > 1e-4)
check('Baumkronen wiegen im Wind', motionA.canopyTilt.length > 0 && tiltMoved,
  `${motionA.canopyTilt.length} bewegte Kronen`)
// Der Ausschlag muss klein bleiben: der Stamm steht im statischen Batch fest,
// eine sichtbar kippende Krone risse ihn optisch mit.
check('Kronenausschlag bleibt unter drei Grad',
  motionB.canopyTilt.every((t) => Math.abs(t) < 0.052),
  Math.max(...motionB.canopyTilt.map((t) => Math.abs(t))).toFixed(4) + ' rad')

check('Windsack folgt derselben Windrichtung wie die Kronen',
  Math.abs(motionB.windsock[0] - motionB.wind[0]) < 0.2,
  `sack=${motionB.windsock[0].toFixed(2)} wind=${motionB.wind[0].toFixed(2)}`)

// --- 6. Maus dreht die Sicht, ohne dass man eine Taste haelt --------------
// Gemeldet wurde "die Sicht dreht sich nicht mit, ich sehe nicht wo ich
// hinlaufe". Ursache war, dass die Kamera am Rechner nur beim Ziehen mit
// gedrueckter Taste folgte. Diese Pruefungen kommen zuletzt, weil sie den
// Blickwinkel absichtlich verstellen. Touch bleibt unberuehrt - dort dreht das
// Wischen auf der rechten Bildhaelfte, und das lief schon vorher.
check('Ohne Klick ist die Maus frei',
  await page.evaluate(() => document.pointerLockElement === null))
await page.mouse.click(550, 400)
await wait(400)
check('Klick ins Bild faengt die Maus',
  await page.evaluate(() => document.pointerLockElement !== null))
const yawBefore = (await state()).cameraYaw
for (let i = 0; i < 6; i++) {
  await page.mouse.move(550 + i * 30, 400)
  await wait(30)
}
await frames(6)
const yawAfter = (await state()).cameraYaw
check('Maus dreht die Sicht ohne gedrueckte Taste', Math.abs(yawAfter - yawBefore) > 0.1,
  `Yaw ${yawBefore.toFixed(2)} -> ${yawAfter.toFixed(2)}`)

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden.`)
process.exit(failed.length === 0 ? 0 : 1)
