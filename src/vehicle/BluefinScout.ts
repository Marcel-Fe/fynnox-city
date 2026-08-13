import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
import { PartBatcher, between, box, capsule, cylinder, sphere, torus } from '../core/Shapes'
import { buildSockets, type BoardableVehicle } from './BoardableVehicle'
import type { Mooring } from './BluefinWaterTaxi'

const SURFACE_Y = -0.4
/** Knapp ueber dem Beckenboden (-3 m) - der Scout setzt nie auf. */
const MAX_DEPTH_Y = -2.6
const SURFACE_MARGIN = 0.12
const MAX_SPEED = 6
const REVERSE_SPEED = 2.5
const DIVE_RATE = 1.1
const DOCK_RADIUS = 7
const DOCK_SPEED = 1.2
const HALF = new THREE.Vector3(1.7, 1.3, 4.2)

const HULL = COLORS.scoutHull
const HULL_DARK = COLORS.scoutHullDark
const BELLY = COLORS.scoutBelly
const TRIM = COLORS.scoutTrim
const GLOW = COLORS.scoutGlow
/** Mitte des Druckkoerpers auf der Hochachse. */
const AXIS_Y = 1.05

/**
 * Bluefin Scout Forschungs-U-Boot.
 * Dieselbe Einstiegskette wie beim Wassertaxi, nur mit Luke statt Rampe und
 * einer dritten Achse: der Tauchtiefe. Ueber Wasser ist der Druck ausgeglichen
 * und die Luke entriegelt - getaucht gibt es weder Ein- noch Ausstieg.
 * Keine Waffen, kein Schaden (weapons: false im Manifest).
 */
export class BluefinScout implements BoardableVehicle {
  readonly id = 'vehicle_bluefin_scout'
  readonly label = 'Bluefin Scout'
  readonly seatOffset = new THREE.Vector3(0, -0.45, 0)
  readonly verticalLabels = { up: 'Auftauchen', down: 'Tauchen' }
  readonly root = new THREE.Group()
  readonly sockets = new Map<string, THREE.Object3D>()
  readonly position = new THREE.Vector3()
  heading = 0
  speed = 0
  private steer = 0
  private vertical = 0
  private clock = 0
  private hatchOpen = 0
  private hatchTarget = 0
  /**
   * Verriegelung der Luke: unter Wasser laeuft sie zu, an der Oberflaeche
   * loest sie sich. Daraus beantwortet sich hatch_unlocked - der Zustand
   * haengt an der Lukenmechanik, nicht an einer zweiten Tiefenabfrage.
   */
  private hatchLock = 0
  private readonly hatch = new THREE.Group()
  private readonly ladder = new THREE.Group()
  private readonly thrusters: THREE.Group[] = []
  private readonly cameraArm = new THREE.Group()
  private dock: Mooring | null = null
  private dockBlend = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
    private readonly docks: Mooring[],
  ) {
    this.buildHull()
    this.buildCabin()
    this.buildDrive()
    this.buildFittings()

    for (const [name, object] of buildSockets(this.id, this.root, {
      dock_anchor: [-1.6, 0.55, 0],
      entry_pilot: [-3.0, 0.55, -0.6],
      exit_pilot_primary: [-3.4, 0.55, -0.6],
      seat_pilot: [0, 1.0, -1.2],
      seat_passenger_01: [0, 1.0, 0.2],
      camera_boarding: [-4.2, 2.6, 2.6],
      camera_drive: [0, 3.2, 9],
      hand_hatch_l: [-0.62, 2.3, 0.7],
      hand_hatch_r: [0.62, 2.3, 0.7],
      foot_ladder_01: [0, 1.75, 0.62],
      foot_ladder_02: [0, 1.05, 0.62],
      cabin_clear: [0, 1.1, -0.4],
    })) {
      this.sockets.set(name, object)
    }

    scene.add(this.root)
  }

  /**
   * Druckkoerper nach der Mehransicht: eifoermiger dunkelblauer Rumpf mit
   * sandfarbenem Bauch, orangen Buegeln und cyanfarbenen Leuchtstreifen.
   */
  private buildHull(): void {
    const b = new PartBatcher()
    b.add(capsule(1.0, 4.0, 14), HULL, {
      pos: [0, AXIS_Y, 0.1],
      rot: [Math.PI / 2, 0, 0],
      scale: [0.96, 1, 1.02],
    })
    // Der Bug ist bauchiger als das Heck - daher vorn eine zusaetzliche Kugel.
    b.add(sphere(1.0, 14, 10), HULL, {
      pos: [0, AXIS_Y, -1.9],
      scale: [0.96, 1.0, 1.15],
    })
    b.add(capsule(0.92, 3.8, 12), BELLY, {
      pos: [0, AXIS_Y - 0.55, 0.1],
      rot: [Math.PI / 2, 0, 0],
      scale: [1.06, 1, 0.66],
    })
    b.add(sphere(0.96, 12, 8), BELLY, {
      pos: [0, AXIS_Y - 0.52, -1.8],
      scale: [1.0, 0.66, 1.12],
    })
    // Plattenstoss zwischen Ruecken und Bauch.
    b.pair((side) => ({
      geometry: capsule(0.05, 3.6, 6),
      color: HULL_DARK,
      place: {
        pos: [side * 0.92, AXIS_Y - 0.26, 0.1],
        rot: [Math.PI / 2, 0, 0],
        scale: [0.5, 1, 1],
      },
    }))
    // Leuchtstreifen an den Flanken und unter dem Bug.
    b.pair((side) => ({
      geometry: box(0.06, 0.1, 0.9),
      color: GLOW,
      place: { pos: [side * 0.95, AXIS_Y + 0.15, -0.9] },
    }))
    b.pair((side) => ({
      geometry: sphere(0.11, 8, 6),
      color: GLOW,
      place: { pos: [side * 0.42, AXIS_Y - 0.82, -2.3], scale: [1, 0.7, 1] },
    }))
    // Orange Handlaeufe auf dem Ruecken - Signaturdetail der Draufsicht.
    for (const z of [-1.2, 1.4]) {
      b.pair((side) => ({
        geometry: torus(0.26, 0.045, 5, 8, Math.PI),
        color: TRIM,
        place: { pos: [side * 0.62, AXIS_Y + 0.86, z], rot: [0, Math.PI / 2, 0] },
      }))
    }
    // Pfotenemblem auf der Flanke.
    b.pair((side) => ({
      geometry: cylinder(0.34, 0.34, 0.05, 16),
      color: TRIM,
      place: { pos: [side * 0.94, AXIS_Y + 0.3, 0.6], rot: [0, 0, Math.PI / 2] },
    }))
    b.pair((side) => ({
      geometry: sphere(0.13, 8, 6),
      color: HULL_DARK,
      place: { pos: [side * 0.97, AXIS_Y + 0.24, 0.6], scale: [0.35, 0.9, 1.1] },
    }))
    b.finish(this.root)
  }

  /** Beobachtungskuppel, Lukenkragen und Innenraum. */
  private buildCabin(): void {
    const b = new PartBatcher()
    // Kuppelrahmen.
    b.add(torus(0.86, 0.07, 6, 18), HULL_DARK, {
      pos: [0, AXIS_Y + 0.25, -1.62],
      rot: [0.18, 0, 0],
      scale: [1, 0.92, 1],
    })
    // Lukenkragen mit orangem Ring.
    b.add(cylinder(0.56, 0.62, 0.34, 14), HULL, { pos: [0, AXIS_Y + 1.02, 0.7] })
    b.add(torus(0.56, 0.06, 6, 16), TRIM, {
      pos: [0, AXIS_Y + 1.19, 0.7],
      rot: [Math.PI / 2, 0, 0],
    })
    // Griffe neben der Luke (hand_hatch_l / hand_hatch_r).
    b.pair((side) => ({
      geometry: torus(0.14, 0.035, 5, 8, Math.PI),
      color: TRIM,
      place: { pos: [side * 0.62, AXIS_Y + 1.0, 0.7], rot: [0, Math.PI / 2, Math.PI] },
    }))
    // Periskop und Antenne.
    b.add(cylinder(0.06, 0.06, 0.7, 8), COLORS.metal, { pos: [0, AXIS_Y + 1.35, 1.35] })
    b.add(box(0.16, 0.12, 0.2), HULL_DARK, { pos: [0, AXIS_Y + 1.66, 1.28] })
    // Sitze und Pult - durch die Kuppel sichtbar.
    for (const [sx, sz] of [
      [-0.34, -1.2],
      [0.34, -1.2],
      [0, 0.2],
    ]) {
      b.add(box(0.46, 0.12, 0.5), BELLY, { pos: [sx, AXIS_Y - 0.05, sz] })
      b.add(box(0.46, 0.6, 0.12), BELLY, { pos: [sx, AXIS_Y + 0.26, sz + 0.26] })
    }
    b.add(box(1.1, 0.4, 0.2), HULL_DARK, { pos: [0, AXIS_Y + 0.1, -2.0] })
    b.add(box(0.6, 0.2, 0.06), GLOW, { pos: [0, AXIS_Y + 0.16, -2.11] })
    b.finish(this.root)

    const glass = new PartBatcher()
    glass.add(sphere(0.94, 14, 10), COLORS.glass, {
      pos: [0, AXIS_Y + 0.2, -1.9],
      scale: [0.94, 0.92, 1.1],
    })
    glass.finish(this.root, { opacity: 0.4 })
  }

  /** Antrieb: zwei Gondeln am Heck, Leitwerk, Ballasttanks. */
  private buildDrive(): void {
    const b = new PartBatcher()
    for (const side of [-1, 1]) {
      const sx = side * 1.15
      b.add(capsule(0.34, 0.5, 12), HULL, {
        pos: [sx, AXIS_Y, 2.2],
        rot: [Math.PI / 2, 0, 0],
      })
      b.add(torus(0.33, 0.06, 6, 14), TRIM, { pos: [sx, AXIS_Y, 2.6] })
      b.add(torus(0.3, 0.05, 6, 14), GLOW, { pos: [sx, AXIS_Y, 1.82] })
      // Ausleger zum Rumpf.
      const boom = between([sx, AXIS_Y, 2.2], [side * 0.6, AXIS_Y + 0.1, 1.9])
      b.add(cylinder(0.11, 0.11, boom.length, 8), HULL_DARK, boom.place)
    }
    // Leitwerk am Heck.
    b.add(box(2.6, 0.12, 0.8), HULL_DARK, { pos: [0, AXIS_Y - 0.35, 2.6] })
    b.add(box(0.12, 0.9, 0.8), HULL_DARK, { pos: [0, AXIS_Y + 0.65, 2.7] })
    b.add(sphere(0.5, 12, 8), HULL, { pos: [0, AXIS_Y, 2.85], scale: [0.9, 0.9, 0.9] })
    b.finish(this.root)

    for (const side of [-1, 1]) {
      const thruster = new THREE.Group()
      thruster.position.set(side * 1.15, AXIS_Y, 2.6)
      this.root.add(thruster)
      const t = new PartBatcher()
      t.add(cylinder(0.08, 0.08, 0.12, 8), COLORS.metal, { rot: [Math.PI / 2, 0, 0] })
      for (const angle of [0, 1.57, 3.14, 4.71]) {
        t.add(box(0.5, 0.12, 0.04), HULL_DARK, { rot: [0, 0, angle] })
      }
      t.finish(thruster, { castShadow: false })
      this.thrusters.push(thruster)
    }
  }

  /** Bewegliche Teile: Luke, Leiter, Manipulatorarm. */
  private buildFittings(): void {
    // top_hatch schwingt um ihr Scharnier an Steuerbord.
    this.hatch.position.set(0.5, 2.26, 0.7)
    this.root.add(this.hatch)
    const h = new PartBatcher()
    h.add(cylinder(0.54, 0.54, 0.1, 14), HULL, { pos: [-0.5, 0, 0] })
    h.add(torus(0.5, 0.05, 5, 14), TRIM, { pos: [-0.5, 0.05, 0], rot: [Math.PI / 2, 0, 0] })
    h.add(box(0.24, 0.06, 0.1), COLORS.metal, { pos: [-0.5, 0.1, 0] })
    h.finish(this.hatch)

    // internal_ladder faehrt mit der Luke aus.
    this.ladder.position.set(0, 1.3, 0.7)
    this.root.add(this.ladder)
    const l = new PartBatcher()
    for (const side of [-1, 1]) {
      l.add(cylinder(0.035, 0.035, 1.5, 6), COLORS.metal, { pos: [side * 0.2, 0, 0] })
    }
    for (const dy of [-0.5, -0.15, 0.2, 0.55]) {
      l.add(cylinder(0.03, 0.03, 0.4, 6), COLORS.metal, { pos: [0, dy, 0], rot: [0, 0, Math.PI / 2] })
    }
    l.finish(this.ladder, { castShadow: false })

    // camera_arm: gelenkiger Greif- und Kameraarm unter dem Bug.
    this.cameraArm.position.set(0, AXIS_Y - 0.7, -2.5)
    this.root.add(this.cameraArm)
    const a = new PartBatcher()
    a.add(sphere(0.14, 8, 6), HULL_DARK)
    const upper = between([0, 0, 0], [0, -0.35, -0.55])
    a.add(cylinder(0.07, 0.07, upper.length, 8), COLORS.metal, upper.place)
    a.add(sphere(0.11, 8, 6), HULL_DARK, { pos: [0, -0.35, -0.55] })
    const lower = between([0, -0.35, -0.55], [0, -0.2, -1.1])
    a.add(cylinder(0.06, 0.06, lower.length, 8), COLORS.metal, lower.place)
    a.add(cylinder(0.13, 0.13, 0.16, 10), HULL_DARK, { pos: [0, -0.2, -1.16], rot: [Math.PI / 2, 0, 0] })
    a.add(sphere(0.1, 8, 6), GLOW, { pos: [0, -0.2, -1.24] })
    a.finish(this.cameraArm, { castShadow: false })
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

  get isStationary(): boolean {
    return Math.abs(this.speed) < 0.3
  }

  get isSurfaced(): boolean {
    return this.position.y > SURFACE_Y - SURFACE_MARGIN
  }

  /** Tauchtiefe in Metern unter der Wasserlinie - 0 heisst aufgetaucht. */
  get depth(): number {
    return Math.max(0, SURFACE_Y - this.position.y)
  }

  get hatchLocked(): boolean {
    return this.hatchLock > 0.05
  }

  get dockedAt(): Mooring | null {
    return this.dock
  }

  get entryPartState(): 'open' | 'closed' | 'moving' {
    if (this.hatchOpen > 0.97) return 'open'
    if (this.hatchOpen < 0.03) return 'closed'
    return 'moving'
  }

  setEntryPartOpen(open: boolean): void {
    // Unter Wasser bleibt die Luke zu - auch wenn jemand danach fragt.
    this.hatchTarget = open && this.isSurfaced ? 1 : 0
  }

  setVerticalInput(value: number): void {
    this.vertical = THREE.MathUtils.clamp(value, -1, 1)
  }

  /** entry_conditions aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json. */
  checkEntryCondition(condition: string): boolean {
    switch (condition) {
      case 'vehicle_docked':
        return this.dock !== null
      case 'pressure_equalized':
        return this.isSurfaced
      case 'hatch_unlocked':
        return !this.hatchLocked
      default:
        throw new Error(`${this.id} kennt die Bedingung ${condition} nicht`)
    }
  }

  exitBlockedReason(): string | null {
    if (!this.isSurfaced) return 'Erst auftauchen - unter Wasser bleibt die Luke verriegelt.'
    if (this.hatchLocked) return 'Die Luke entriegelt gerade noch.'
    return null
  }

  place(position: THREE.Vector3, heading: number): void {
    this.position.copy(position)
    this.heading = heading
    this.speed = 0
    this.vertical = 0
    // Ein geladener Stand setzt den Scout nie auf Land ab, sondern zurueck
    // ans Tauchbecken - ein halb geladener Liegeplatz waere kein sauberer Zustand.
    if (!this.isNavigable(position.x, position.z) && this.docks.length > 0) {
      const home = this.nearestDock(true) ?? this.docks[0]
      this.position.copy(home.position)
      this.heading = home.heading
    }
    this.position.y = SURFACE_Y
    this.hatchLock = 0
    this.dock = this.nearestDock()
    this.dockBlend = this.dock ? 1 : 0
    this.syncTransform()
    this.updateCollider()
  }

  /** Fahrphysik: langsam, ohne Waffen, ohne Rammen, ohne Schaden. */
  drive(delta: number, throttle: number, steerInput: number, brake: boolean): void {
    if (brake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 5 * delta)
    } else if (throttle !== 0) {
      const limit = throttle > 0 ? MAX_SPEED : -REVERSE_SPEED
      this.speed += (limit - this.speed) * Math.min(1, delta * 0.9)
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.0 * delta)
    }

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 3, 0, 1)
    this.steer += (steerInput - this.steer) * Math.min(1, delta * 4)
    this.heading -= this.steer * speedFactor * delta * 1.0 * Math.sign(this.speed || 1)

    // Ballast statt Auftrieb: die Tiefe folgt unmittelbar der dritten Achse.
    if (this.vertical !== 0) {
      this.position.y = THREE.MathUtils.clamp(
        this.position.y + this.vertical * DIVE_RATE * delta,
        MAX_DEPTH_Y,
        SURFACE_Y,
      )
    }

    const nextX = this.position.x - Math.sin(this.heading) * this.speed * delta
    const nextZ = this.position.z - Math.cos(this.heading) * this.speed * delta
    if (this.isNavigable(nextX, nextZ)) {
      this.position.x = nextX
      this.position.z = nextZ
    } else {
      this.speed *= 0.2
    }

    this.updateDock(delta)
    this.syncTransform()
    this.updateCollider()
  }

  update(delta: number): void {
    this.clock += delta
    // Die Verriegelung folgt der Tiefe: getaucht zu, aufgetaucht wieder frei.
    this.hatchLock = THREE.MathUtils.clamp(
      this.hatchLock + (this.isSurfaced ? -delta * 1.6 : delta * 3),
      0,
      1,
    )
    if (this.hatchLocked) this.hatchTarget = 0
    this.hatchOpen += (this.hatchTarget - this.hatchOpen) * Math.min(1, delta * 4)
    this.hatch.rotation.z = this.hatchOpen * 1.6
    this.ladder.position.y = 1.3 - this.hatchOpen * 0.25
    this.ladder.visible = this.hatchOpen > 0.05
    for (const thruster of this.thrusters) {
      // Die Blaetter stehen jetzt quer zur Fahrtrichtung, also dreht sich die
      // Gondel um ihre Laengsachse statt um die Hochachse.
      thruster.rotation.z += delta * (1 + Math.abs(this.speed) * 2.5)
    }
    this.cameraArm.rotation.y = Math.sin(this.clock * 0.5) * 0.5
    this.syncTransform()
  }

  /** Ruhezustand: der Scout taucht von allein auf und legt am Becken an. */
  settle(delta: number): void {
    this.vertical = 0
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.4 * delta)
    if (this.position.y < SURFACE_Y) {
      this.position.y = Math.min(SURFACE_Y, this.position.y + DIVE_RATE * 0.7 * delta)
    }
    this.updateDock(delta)
    this.syncTransform()
    this.updateCollider()
  }

  private updateDock(delta: number): void {
    const slow = Math.abs(this.speed) < DOCK_SPEED && this.isSurfaced
    const candidate = slow ? this.nearestDock() : null
    if (candidate !== this.dock) {
      this.dock = candidate
      this.dockBlend = 0
    }
    if (!this.dock) return
    this.dockBlend = Math.min(1, this.dockBlend + delta * 2)
    const t = this.dockBlend * Math.min(1, delta * 6)
    this.position.x = THREE.MathUtils.lerp(this.position.x, this.dock.position.x, t)
    this.position.z = THREE.MathUtils.lerp(this.position.z, this.dock.position.z, t)
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

  /** Fahrwasser ist alles, wo der Beckenboden tief unter der Kaikante liegt. */
  private isNavigable(x: number, z: number): boolean {
    return this.collision.groundHeightAt(x, z, 6, 0.9, 'vehicle') < -1
  }

  private syncTransform(): void {
    this.root.position.set(
      this.position.x,
      this.position.y + (this.isSurfaced ? Math.sin(this.clock * 1.4) * 0.04 : 0),
      this.position.z,
    )
    this.root.rotation.set(0, this.heading, -this.steer * 0.06)
    this.root.updateMatrixWorld(true)
  }

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
