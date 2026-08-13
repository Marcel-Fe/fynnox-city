import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
import {
  PartBatcher,
  between,
  box,
  capsule,
  cone,
  cylinder,
  roundedBox,
  sphere,
  torus,
} from '../core/Shapes'
import { buildSockets, type BoardableVehicle } from './BoardableVehicle'
import type { Mooring } from './BluefinWaterTaxi'

const WATER_LEVEL = -0.4
const MAX_ALTITUDE = 45
/** Ab hier gilt das Flugzeug als in der Luft - darunter liegt es im Wasser. */
const AIRBORNE_MARGIN = 0.35
/** Hoechstfahrt auf dem Wasser - muss ueber TAKEOFF_SPEED liegen, sonst
 *  koennte das Flugzeug seine Startgeschwindigkeit nie erreichen. */
const TAXI_SPEED = 14
const AIR_SPEED = 26
const REVERSE_SPEED = 2
/** Unter dieser Fahrt traegt der Fluegel nicht - vorher hebt nichts ab. */
const TAKEOFF_SPEED = 9
const CLIMB_RATE = 7
const SINK_RATE = 4
/** Auslaufzeit des Propellers: rund vier Sekunden von voller Drehzahl auf null.
 *  Lang genug, dass der Wiedereinstieg direkt nach dem Abstellen lesbar
 *  verweigert wird, kurz genug, dass Warten nicht wie ein Fehler wirkt. */
const PROPELLER_SPINDOWN = 0.25
const DOCK_RADIUS = 8
const DOCK_SPEED = 1.4
/** Halbmasse von Rumpf und Schwimmern, ohne die Fluegel. */
const HALF = new THREE.Vector3(2.2, 1.3, 3.6)

const BODY = COLORS.skyfinBody
const TEAL = COLORS.skyfinTeal
const TEAL_DARK = COLORS.skyfinTealDark
const TRIM = COLORS.skyfinTrim
/** Mitte des Rumpfs auf der Hochachse - alle Anbauteile haengen daran. */
const AXIS_Y = 1.42

/**
 * Skyfin Kuestenflugzeug.
 * Ein Schwimmerflugzeug, das am Flugsteg im Hafenbecken liegt und erst mit
 * Startgeschwindigkeit abhebt. Die Einstiegskette ist dieselbe wie beim Buggy;
 * neu sind die Bedingungen aus dem Manifest - vehicle_docked_or_parked,
 * propeller_stopped und cockpit_clear - und die dritte Achse.
 */
export class Skyfin implements BoardableVehicle {
  readonly id = 'vehicle_skyfin'
  readonly label = 'Skyfin'
  readonly seatOffset = new THREE.Vector3(0, -0.45, 0)
  readonly verticalLabels = { up: 'Steigen', down: 'Sinken' }
  readonly root = new THREE.Group()
  readonly sockets = new Map<string, THREE.Object3D>()
  readonly position = new THREE.Vector3()
  heading = 0
  speed = 0
  private steer = 0
  private bank = 0
  private pitch = 0
  private vertical = 0
  private clock = 0
  private doorOpen = 0
  private doorTarget = 0
  /** 0 = stillstehend, 1 = volle Drehzahl. Beantwortet propeller_stopped. */
  private propeller = 0
  private readonly door = new THREE.Group()
  private readonly propellerBlades = new THREE.Group()
  private readonly rudder = new THREE.Group()
  private readonly ailerons: THREE.Group[] = []
  private readonly belt = new THREE.Group()
  private dock: Mooring | null = null
  private dockBlend = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
    private readonly docks: Mooring[],
  ) {
    this.buildFuselage()
    this.buildWing()
    this.buildTail()
    this.buildFloats()
    this.buildFittings()

    for (const [name, object] of buildSockets(this.id, this.root, {
      entry_pilot: [-2.6, 0.55, -0.4],
      exit_pilot_primary: [-3.4, 0.55, -0.4],
      seat_pilot: [0, 1.5, -0.9],
      camera_boarding: [-4.6, 2.8, 2.6],
      camera_drive: [0, 3.4, 10],
      hand_grab_lower: [-0.72, 1.1, -0.4],
      hand_cockpit_frame: [-0.68, 2.05, -1.9],
      hand_control_l: [-0.3, 1.7, -2.1],
      hand_control_r: [0.3, 1.7, -2.1],
      foot_float_step: [-1.6, 0.45, 0.1],
      foot_cockpit_step: [-0.55, 1.05, -0.9],
      belt_anchor_l: [-0.42, 1.42, -0.6],
      belt_anchor_r: [0.42, 1.42, -0.6],
    })) {
      this.sockets.set(name, object)
    }

    scene.add(this.root)
  }

  /**
   * Rumpf nach der Seitenansicht: runde cremefarbene Roehre mit tealem Bauch,
   * schlank auslaufendem Heckausleger, tealer Motorhaube und Kanzelverglasung.
   */
  private buildFuselage(): void {
    const b = new PartBatcher()
    b.add(capsule(0.7, 2.6, 12), BODY, { pos: [0, AXIS_Y, -1.0], rot: [Math.PI / 2, 0, 0] })
    // Heckausleger: verjuengt sich nach hinten, statt als Kiste durchzulaufen.
    b.add(cylinder(0.26, 0.7, 2.7, 12), BODY, { pos: [0, AXIS_Y, 2.35], rot: [Math.PI / 2, 0, 0] })
    // Heckabschluss: ein offenes Rohrende liest wie ein abgesaegtes Teil.
    b.add(sphere(0.27, 10, 8), BODY, { pos: [0, AXIS_Y, 3.68], scale: [1, 1, 1.3] })
    // Tealer Bauch mit der Trennlinie der Referenz.
    b.add(capsule(0.5, 3.2, 10), TEAL, {
      pos: [0, AXIS_Y - 0.42, -0.5],
      rot: [Math.PI / 2, 0, 0],
      scale: [1.22, 1, 0.66],
    })
    b.pair((side) => ({
      geometry: capsule(0.05, 3.1, 6),
      color: TRIM,
      place: {
        pos: [side * 0.66, AXIS_Y - 0.22, -0.5],
        rot: [Math.PI / 2, 0, 0],
        scale: [0.5, 1, 1],
      },
    }))

    // Motorhaube und Spinner mit Pfotenemblem (Frontansicht des Pakets).
    b.add(cylinder(0.6, 0.68, 0.55, 14), TEAL, { pos: [0, AXIS_Y, -2.9], rot: [Math.PI / 2, 0, 0] })
    b.add(torus(0.58, 0.06, 6, 16), TRIM, { pos: [0, AXIS_Y, -3.16] })
    b.add(cone(0.26, 0.42, 10), TRIM, { pos: [0, AXIS_Y, -3.38], rot: [-Math.PI / 2, 0, 0] })
    // Landescheinwerfer links und rechts der Haube.
    b.pair((side) => ({
      geometry: sphere(0.11, 8, 6),
      color: COLORS.gold,
      place: { pos: [side * 0.42, AXIS_Y + 0.12, -3.02], scale: [1, 1, 0.7] },
    }))

    // Kanzelrahmen: dunkle Streben, dazwischen kommt die Verglasung.
    b.add(cylinder(0.6, 0.6, 0.09, 12), COLORS.metal, {
      pos: [0, AXIS_Y + 0.56, -2.24],
      rot: [Math.PI / 2, 0, 0],
      scale: [1.02, 1, 0.62],
    })
    b.add(cylinder(0.62, 0.62, 0.09, 12), COLORS.metal, {
      pos: [0, AXIS_Y + 0.52, -0.34],
      rot: [Math.PI / 2, 0, 0],
      scale: [1.02, 1, 0.66],
    })

    // Cockpit: Sitzschalen und Instrumententafel bleiben durch die Kanzel lesbar.
    for (const sx of [-0.3, 0.3]) {
      b.add(box(0.44, 0.1, 0.5), COLORS.navy, { pos: [sx, AXIS_Y - 0.06, -0.9] })
      b.add(box(0.44, 0.55, 0.1), COLORS.navy, { pos: [sx, AXIS_Y + 0.22, -0.65] })
    }
    b.add(box(1.0, 0.34, 0.16), COLORS.navyMid, { pos: [0, AXIS_Y + 0.18, -2.1] })
    b.add(box(0.34, 0.16, 0.08), COLORS.cyan, { pos: [-0.28, AXIS_Y + 0.2, -2.18] })
    b.finish(this.root)

    const glass = new PartBatcher()
    glass.add(sphere(0.62, 12, 10), COLORS.glass, {
      pos: [0, AXIS_Y + 0.28, -1.3],
      scale: [1.03, 1.05, 1.6],
    })
    glass.finish(this.root, { opacity: 0.42 })
  }

  /** Hochdecker mit orangen Spitzen und den Solarfeldern der Draufsicht. */
  private buildWing(): void {
    const b = new PartBatcher()
    b.add(roundedBox(9.4, 0.17, 1.9, 0.07), BODY, { pos: [0, 2.35, -0.3] })
    b.pair((side) => ({
      geometry: roundedBox(1.1, 0.18, 1.9, 0.07),
      color: TRIM,
      place: { pos: [side * 5.24, 2.35, -0.3] },
    }))
    b.pair((side) => ({
      geometry: box(3.3, 0.05, 1.2),
      color: COLORS.solarPanel,
      place: { pos: [side * 2.7, 2.45, -0.35] },
    }))
    // Aufsattelung auf dem Rumpfruecken.
    b.add(roundedBox(0.9, 0.28, 1.6, 0.08), BODY, { pos: [0, 2.18, -0.3] })
    // Fluegelstreben zum Schwimmerausleger.
    for (const side of [-1, 1]) {
      const upper = between([side * 0.7, 2.18, -0.3], [side * 3.1, 2.3, -0.3])
      b.add(cylinder(0.05, 0.05, upper.length, 6), COLORS.metal, upper.place)
    }
    b.finish(this.root)

    // Querruder schlagen sichtbar aus, also eigene Gruppen.
    for (const sx of [-3.6, 3.6]) {
      const aileron = new THREE.Group()
      aileron.position.set(sx, 2.35, 0.85)
      this.root.add(aileron)
      const a = new PartBatcher()
      a.add(roundedBox(2.2, 0.12, 0.5, 0.04), BODY)
      a.finish(aileron, { castShadow: false })
      this.ailerons.push(aileron)
    }
  }

  /** Leitwerk: orange Finne mit Pfote, cremefarbenes Hoehenruder mit Spitzen. */
  private buildTail(): void {
    const b = new PartBatcher()
    b.add(roundedBox(0.16, 1.75, 1.35, 0.06), TRIM, { pos: [0, 2.6, 3.0] })
    b.add(cylinder(0.28, 0.28, 0.04, 12), BODY, {
      pos: [0.1, 2.85, 3.1],
      rot: [0, 0, Math.PI / 2],
    })
    for (const [dx, dy] of [
      [-0.12, 0.16],
      [0, 0.19],
      [0.12, 0.16],
    ]) {
      b.add(sphere(0.05, 6, 5), BODY, {
        pos: [0.1, 2.85 + dy, 3.1 + dx],
        scale: [0.4, 1, 1],
      })
    }
    // Das Hoehenruder sitzt auf dem Heckausleger, nicht darueber in der Luft.
    b.add(roundedBox(3.4, 0.14, 1.0, 0.05), BODY, { pos: [0, 1.62, 3.2] })
    b.pair((side) => ({
      geometry: roundedBox(0.5, 0.15, 1.0, 0.05),
      color: TRIM,
      place: { pos: [side * 1.7, 1.62, 3.2] },
    }))
    b.finish(this.root)

    this.rudder.position.set(0, 2.5, 3.7)
    this.root.add(this.rudder)
    const r = new PartBatcher()
    r.add(roundedBox(0.14, 1.3, 0.6, 0.05), TRIM, { pos: [0, 0, 0.2] })
    r.finish(this.rudder, { castShadow: false })
  }

  /** Schwimmer mit oranger Spitze und den gekreuzten Streben der Seitenansicht. */
  private buildFloats(): void {
    const b = new PartBatcher()
    for (const side of [-1, 1]) {
      const sx = side * 1.6
      b.add(capsule(0.38, 3.5, 10), TEAL, {
        pos: [sx, 0.15, 0.1],
        rot: [Math.PI / 2, 0, 0],
        scale: [1.06, 1, 0.82],
      })
      b.add(capsule(0.3, 3.4, 8), TEAL_DARK, {
        pos: [sx, -0.06, 0.1],
        rot: [Math.PI / 2, 0, 0],
        scale: [1.05, 1, 0.55],
      })
      b.add(sphere(0.3, 10, 8), TRIM, { pos: [sx, 0.2, -2.05], scale: [1.05, 0.85, 1.3] })
      b.add(capsule(0.05, 3.2, 6), TRIM, {
        pos: [sx + side * 0.36, 0.15, 0.1],
        rot: [Math.PI / 2, 0, 0],
        scale: [0.4, 1, 1],
      })
      // Streben: senkrecht plus Kreuz, wie in der Seitenansicht.
      for (const sz of [-1.5, 1.5]) {
        const leg = between([sx, 0.42, sz], [side * 0.62, AXIS_Y - 0.55, sz * 0.8])
        b.add(cylinder(0.055, 0.055, leg.length, 6), COLORS.metal, leg.place)
      }
      const cross1 = between([sx, 0.45, -1.5], [side * 0.62, AXIS_Y - 0.55, 1.2])
      const cross2 = between([sx, 0.45, 1.5], [side * 0.62, AXIS_Y - 0.55, -1.2])
      b.add(cylinder(0.04, 0.04, cross1.length, 6), COLORS.metal, cross1.place)
      b.add(cylinder(0.04, 0.04, cross2.length, 6), COLORS.metal, cross2.place)
    }
    b.finish(this.root)
  }

  /** Bewegliche Teile: Propeller, Cockpittuer, Gurt. */
  private buildFittings(): void {
    this.propellerBlades.position.set(0, AXIS_Y, -3.5)
    this.root.add(this.propellerBlades)
    const p = new PartBatcher()
    p.add(sphere(0.2, 8, 6), TRIM, { scale: [1, 1, 1.4] })
    for (const angle of [0, 2.094, 4.189]) {
      p.add(capsule(0.08, 2.2, 6), COLORS.fynnoxLeather, {
        rot: [0, 0, angle],
        scale: [1, 1, 0.32],
      })
    }
    p.finish(this.propellerBlades, { castShadow: false })

    // cockpit_door schwingt um ihr Scharnier an Backbord.
    this.door.position.set(-0.66, 1.5, -1.9)
    this.root.add(this.door)
    const d = new PartBatcher()
    d.add(roundedBox(0.1, 0.92, 1.4, 0.05), BODY, { pos: [0, 0, 0.7] })
    d.add(box(0.06, 0.12, 0.28), COLORS.metal, { pos: [-0.06, -0.1, 1.15] })
    d.finish(this.door)

    // seat_belt: liegt offen ueber dem Sitz, solange die Tuer offen steht.
    this.belt.position.set(0, 1.42, -0.62)
    this.root.add(this.belt)
    const s = new PartBatcher()
    s.add(box(0.86, 0.08, 0.09), TRIM)
    s.add(box(0.12, 0.12, 0.12), COLORS.metal)
    s.finish(this.belt, { castShadow: false })
  }

  hasSocket(name: string): boolean {
    return this.sockets.has(name)
  }

  socketWorld(name: string, target = new THREE.Vector3()): THREE.Vector3 {
    const socket = this.sockets.get(name)
    if (!socket) throw new Error(`Socket unbekannt: ${name}`)
    this.root.updateMatrixWorld(true)
    return socket.getWorldPosition(target)
  }

  get roll(): number {
    return this.bank
  }

  get isAirborne(): boolean {
    return this.position.y > this.floorAt(this.position.x, this.position.z) + AIRBORNE_MARGIN
  }

  get isStationary(): boolean {
    return Math.abs(this.speed) < 0.35 && !this.isAirborne
  }

  /** Sichtbare Drehzahl - Grundlage der Bedingung propeller_stopped. */
  get propellerRate(): number {
    return this.propeller
  }

  get dockedAt(): Mooring | null {
    return this.dock
  }

  get entryPartState(): 'open' | 'closed' | 'moving' {
    if (this.doorOpen > 0.97) return 'open'
    if (this.doorOpen < 0.03) return 'closed'
    return 'moving'
  }

  setEntryPartOpen(open: boolean): void {
    this.doorTarget = open ? 1 : 0
  }

  setVerticalInput(value: number): void {
    this.vertical = THREE.MathUtils.clamp(value, -1, 1)
  }

  /** entry_conditions aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json. */
  checkEntryCondition(condition: string): boolean {
    switch (condition) {
      case 'vehicle_docked_or_parked':
        return this.dock !== null && !this.isAirborne
      case 'propeller_stopped':
        return this.propeller < 0.04
      case 'cockpit_clear': {
        // Geprueft wird der Stehplatz am Einstieg, nicht das Cockpit selbst -
        // dort steht Fynnox, bevor er sich hineinzieht.
        const anchor = this.socketWorld('entry_pilot')
        const ground = this.collision.groundHeightAt(anchor.x, anchor.z, anchor.y + 1.5, 0.35, 'vehicle')
        const base = ground > -100 ? ground : anchor.y
        const box = new THREE.Box3(
          new THREE.Vector3(anchor.x - 0.35, base + 0.15, anchor.z - 0.35),
          new THREE.Vector3(anchor.x + 0.35, base + 1.6, anchor.z + 0.35),
        )
        return this.collision.isFree(box, 'vehicle')
      }
      default:
        throw new Error(`${this.id} kennt die Bedingung ${condition} nicht`)
    }
  }

  exitBlockedReason(): string | null {
    if (this.isAirborne) return 'Skyfin ist in der Luft - erst auf dem Wasser aufsetzen.'
    return null
  }

  place(position: THREE.Vector3, heading: number): void {
    this.position.copy(position)
    this.heading = heading
    this.speed = 0
    this.vertical = 0
    this.bank = 0
    this.propeller = 0
    // Ein geladener Stand darf das Flugzeug nicht mitten in der Luft oder ueber
    // der Stadt absetzen: dann geht es zurueck an den Steg.
    if (!this.isWater(position.x, position.z) && this.docks.length > 0) {
      const home = this.nearestDock(true) ?? this.docks[0]
      this.position.copy(home.position)
      this.heading = home.heading
    }
    this.position.y = WATER_LEVEL
    this.dock = this.nearestDock()
    this.dockBlend = this.dock ? 1 : 0
    this.syncTransform()
    this.updateCollider()
  }

  /** Flugphysik: Arcade, kein Schaden, kein Rammen (Sicherheitsinvariante). */
  drive(delta: number, throttle: number, steerInput: number, brake: boolean): void {
    const airborne = this.isAirborne
    const limit = airborne ? AIR_SPEED : TAXI_SPEED

    if (brake && !airborne) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * delta)
    } else if (throttle !== 0) {
      const target = throttle > 0 ? limit : -REVERSE_SPEED
      this.speed += (target - this.speed) * Math.min(1, delta * 0.7)
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.5 * delta)
    }

    // Der Propeller folgt dem Gasgriff, laeuft aber deutlich langsamer aus -
    // deshalb ist der Wiedereinstieg direkt nach dem Abstellen noch gesperrt.
    const demand = Math.max(Math.abs(throttle), Math.abs(this.speed) / AIR_SPEED)
    this.propeller +=
      demand > this.propeller
        ? Math.min(demand - this.propeller, delta * 2.5)
        : -Math.min(this.propeller - demand, delta * PROPELLER_SPINDOWN)

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1)
    this.steer += (steerInput - this.steer) * Math.min(1, delta * 3.5)
    this.bank += (-this.steer * 0.6 * speedFactor - this.bank) * Math.min(1, delta * 3)
    const turnRate = airborne ? 0.85 : 0.55
    this.heading -= this.steer * speedFactor * delta * turnRate * Math.sign(this.speed || 1)

    // Auftrieb erst ab Startgeschwindigkeit; ohne Fahrt sinkt das Flugzeug zurueck.
    let climb = 0
    if (this.vertical > 0 && this.speed > TAKEOFF_SPEED) climb = CLIMB_RATE * this.vertical
    else if (this.vertical < 0) climb = CLIMB_RATE * 0.75 * this.vertical
    else if (airborne && this.speed <= TAKEOFF_SPEED) climb = -SINK_RATE
    this.pitch += (THREE.MathUtils.clamp(climb / CLIMB_RATE, -1, 1) * 0.22 - this.pitch) * Math.min(1, delta * 3)

    const next = this.position.clone()
    next.x -= Math.sin(this.heading) * this.speed * delta
    next.z -= Math.cos(this.heading) * this.speed * delta
    next.y = THREE.MathUtils.clamp(this.position.y + climb * delta, -100, MAX_ALTITUDE)
    next.y = Math.max(next.y, this.floorAt(next.x, next.z))

    if (this.canOccupy(next, airborne)) {
      this.position.copy(next)
    } else {
      // Anstossen bremst, beschaedigt aber nichts.
      this.speed *= 0.25
      this.position.y = Math.max(this.position.y, this.floorAt(this.position.x, this.position.z))
    }

    this.updateDock(delta)
    this.syncTransform()
    this.updateCollider()
  }

  update(delta: number): void {
    this.clock += delta
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, delta * 5)
    this.door.rotation.y = -this.doorOpen * 1.25
    // seat_belt: geschlossene Tuer heisst angeschnallt, offene Tuer geloester Gurt.
    this.belt.rotation.z = this.doorOpen * 0.9
    this.belt.position.y = 1.42 + this.doorOpen * 0.12
    this.propellerBlades.rotation.z += delta * (1.5 + this.propeller * 42)
    this.rudder.rotation.y = this.steer * 0.45
    for (let i = 0; i < this.ailerons.length; i++) {
      this.ailerons[i].rotation.x = (i === 0 ? 1 : -1) * this.steer * 0.3
    }
    this.syncTransform()
  }

  /** Ruhezustand: das Flugzeug sinkt zurueck aufs Wasser und legt am Steg an. */
  settle(delta: number): void {
    this.vertical = 0
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2.2 * delta)
    this.propeller = Math.max(0, this.propeller - delta * PROPELLER_SPINDOWN)
    this.bank += (0 - this.bank) * Math.min(1, delta * 2)
    const floor = this.floorAt(this.position.x, this.position.z)
    if (this.position.y > floor) this.position.y = Math.max(floor, this.position.y - SINK_RATE * delta)
    this.updateDock(delta)
    this.syncTransform()
    this.updateCollider()
  }

  /** Automatisches Anlegen am Flugsteg, sobald das Flugzeug langsam genug ist. */
  private updateDock(delta: number): void {
    const slow = Math.abs(this.speed) < DOCK_SPEED && !this.isAirborne
    const candidate = slow ? this.nearestDock() : null
    if (candidate !== this.dock) {
      this.dock = candidate
      this.dockBlend = 0
    }
    if (!this.dock) return
    this.dockBlend = Math.min(1, this.dockBlend + delta * 2)
    const t = this.dockBlend * Math.min(1, delta * 5)
    this.position.lerp(this.dock.position, t)
    this.position.y = WATER_LEVEL
    let diff = this.dock.heading - this.heading
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.heading += diff * t
    this.speed *= 0.85
  }

  private nearestDock(ignoreDistance = false): Mooring | null {
    let best: Mooring | null = null
    let bestDistance = ignoreDistance ? Infinity : DOCK_RADIUS
    for (const dock of this.docks) {
      const distance = Math.hypot(dock.position.x - this.position.x, dock.position.z - this.position.z)
      if (distance < bestDistance) {
        best = dock
        bestDistance = distance
      }
    }
    return best
  }

  /** Wasserflaeche: alles, wo der Beckenboden tief unter der Kaikante liegt. */
  private isWater(x: number, z: number): boolean {
    return this.collision.groundHeightAt(x, z, 6, 1.0, 'vehicle') < -1
  }

  private floorAt(x: number, z: number): number {
    const ground = this.collision.groundHeightAt(x, z, MAX_ALTITUDE + 2, 1.0, 'vehicle')
    return ground > -1 ? ground : WATER_LEVEL
  }

  private canOccupy(next: THREE.Vector3, airborne: boolean): boolean {
    // Am Boden bleibt das Skyfin auf dem Wasser - es rollt nicht durch die Stadt.
    if (!airborne && !this.isWater(next.x, next.z)) return false
    const box = new THREE.Box3(
      new THREE.Vector3(next.x - HALF.x, next.y, next.z - HALF.z),
      new THREE.Vector3(next.x + HALF.x, next.y + HALF.y * 2, next.z + HALF.z),
    )
    return this.collision.isFree(box, 'vehicle')
  }

  private syncTransform(): void {
    this.root.position.set(
      this.position.x,
      this.position.y + (this.isAirborne ? 0 : Math.sin(this.clock * 1.5) * 0.04),
      this.position.z,
    )
    this.root.rotation.set(this.pitch, this.heading, this.bank)
    this.root.updateMatrixWorld(true)
  }

  /**
   * Dynamischer Collider aus der gedrehten Grundflaeche - die Fluegel bleiben
   * bewusst aussen vor, sonst blockierten sie den Ausstiegsanker am Steg.
   */
  private updateCollider(): void {
    const c = Math.abs(Math.cos(this.heading))
    const s = Math.abs(Math.sin(this.heading))
    const hx = HALF.x * c + HALF.z * s
    const hz = HALF.x * s + HALF.z * c
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - hx, this.position.y, this.position.z - hz),
      new THREE.Vector3(this.position.x + hx, this.position.y + HALF.y * 2, this.position.z + hz),
    )
    this.collision.setDynamic(this.id, box, 'vehicle')
  }
}
