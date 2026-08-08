import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
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
  private readonly ladder: THREE.Mesh
  private readonly thrusters: THREE.Mesh[] = []
  private readonly cameraArm = new THREE.Group()
  private dock: Mooring | null = null
  private dockBlend = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
    private readonly docks: Mooring[],
  ) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 7.0), mat(COLORS.cyan))
    hull.position.set(0, 0.9, 0)
    hull.castShadow = true
    this.root.add(hull)
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.0), mat(COLORS.navyMid))
    bow.position.set(0, 0.9, -3.8)
    this.root.add(bow)
    const stern = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.8), mat(COLORS.navyMid))
    stern.position.set(0, 0.9, 3.7)
    this.root.add(stern)
    // Beobachtungskuppel: Fynnox bleibt am Steuer sichtbar.
    const dome = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 2.2), mat(COLORS.glass))
    dome.position.set(0, 1.75, -1.4)
    this.root.add(dome)
    // Seitliche Tauchtanks.
    for (const sx of [-1.15, 1.15]) {
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 4.4), mat(COLORS.gold))
      tank.position.set(sx, 0.55, 0.2)
      this.root.add(tank)
    }

    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.6), mat(COLORS.coral))
    tower.position.set(0, 1.9, 0.7)
    this.root.add(tower)
    // top_hatch schwingt um ihr Scharnier an Steuerbord.
    this.hatch.position.set(0.5, 2.26, 0.7)
    this.root.add(this.hatch)
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), mat(COLORS.metal))
    lid.position.set(-0.5, 0, 0)
    this.hatch.add(lid)
    for (const sx of [-0.62, 0.62]) {
      const grab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), mat(COLORS.metal))
      grab.position.set(sx, 2.05, 0.7)
      this.root.add(grab)
    }
    // internal_ladder faehrt mit der Luke aus.
    this.ladder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.08), mat(COLORS.metal))
    this.ladder.position.set(0, 1.3, 0.7)
    this.root.add(this.ladder)

    for (const sx of [-0.85, 0.85]) {
      const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12), mat(COLORS.metal))
      thruster.rotation.x = Math.PI / 2
      thruster.position.set(sx, 0.9, 4.15)
      this.root.add(thruster)
      this.thrusters.push(thruster)
    }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.9), mat(COLORS.navyMid))
    fin.position.set(0, 0.7, 3.4)
    this.root.add(fin)
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.9), mat(COLORS.navyMid))
    rudder.position.set(0, 1.6, 3.4)
    this.root.add(rudder)

    // camera_arm: schwenkt langsam, damit das Boot als Forschungsgeraet lesbar ist.
    this.cameraArm.position.set(0, 1.75, -3.4)
    this.root.add(this.cameraArm)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), mat(COLORS.metal))
    arm.position.set(0, 0, -0.45)
    this.cameraArm.add(arm)
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), mat(COLORS.cyan))
    lens.position.set(0, 0, -0.95)
    this.cameraArm.add(lens)

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
      thruster.rotation.y += delta * (1 + Math.abs(this.speed) * 2.5)
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
