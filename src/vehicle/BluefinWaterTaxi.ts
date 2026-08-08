import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
import { buildSockets, type BoardableVehicle } from './BoardableVehicle'

export interface Mooring {
  id: string
  /** Liegeposition des Rumpfs, nicht der Anleger selbst. */
  position: THREE.Vector3
  heading: number
  label: string
}

const WATER_LEVEL = -0.4
const MAX_SPEED = 7
const REVERSE_SPEED = 2.5
const MOORING_RADIUS = 7
const MOORING_SPEED = 1.2

/**
 * Bluefin Wassertaxi.
 * Der Einstieg laeuft ueber dieselbe Kette wie beim City Spark, aber mit den
 * Bedingungen aus dem Manifest: vehicle_docked, ramp_deployed und
 * boarding_lane_clear. Ohne Anleger gibt es keinen Ausstieg - Fynnox landet
 * niemals im Wasser.
 */
export class BluefinWaterTaxi implements BoardableVehicle {
  readonly id = 'vehicle_bluefin_water_taxi'
  readonly label = 'Bluefin Wassertaxi'
  readonly seatOffset = new THREE.Vector3(0, -0.4, 0)
  readonly root = new THREE.Group()
  readonly sockets = new Map<string, THREE.Object3D>()
  readonly position = new THREE.Vector3()
  heading = 0
  speed = 0
  private steer = 0
  private clock = 0
  private gateOpen = 0
  private gateTarget = 0
  private rampOut = 0
  private readonly gate = new THREE.Group()
  private readonly ramp: THREE.Mesh
  private readonly rudder: THREE.Mesh
  private readonly propeller: THREE.Mesh
  private mooring: Mooring | null = null
  private mooringBlend = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
    private readonly moorings: Mooring[],
  ) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 7), mat(COLORS.cream))
    hull.position.y = 0.1
    hull.castShadow = true
    this.root.add(hull)
    const keel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 6.2), mat(COLORS.water))
    keel.position.y = -0.35
    this.root.add(keel)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 6.6), mat(COLORS.wood))
    deck.position.y = 0.55
    this.root.add(deck)

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 2.6), mat(COLORS.cyan))
    cabin.position.set(0, 1.2, -1.4)
    cabin.castShadow = true
    this.root.add(cabin)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 4.6), mat(COLORS.coral))
    roof.position.set(0, 1.95, 0.2)
    this.root.add(roof)
    for (const [px, pz] of [
      [-1.1, 1.6],
      [1.1, 1.6],
    ]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), mat(COLORS.metal))
      post.position.set(px, 1.25, pz)
      this.root.add(post)
    }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.5), mat(COLORS.gold))
    bench.position.set(0, 0.81, 1.4)
    this.root.add(bench)

    // hand_rail: Reling an Steuerbord, Backbord bleibt fuer den Einstieg frei.
    for (let i = -2; i <= 2; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), mat(COLORS.metal))
      post.position.set(1.2, 1.06, i * 1.3)
      this.root.add(post)
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 6.2), mat(COLORS.metal))
    rail.position.set(1.2, 1.5, 0)
    this.root.add(rail)

    // boarding_gate an Backbord.
    this.gate.position.set(-1.2, 0.61, 0.9)
    this.root.add(this.gate)
    const gatePanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.6), mat(COLORS.coral))
    gatePanel.position.set(0, 0.45, -0.8)
    this.gate.add(gatePanel)

    // boarding_ramp: faehrt erst am Anleger aus.
    this.ramp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.4), mat(COLORS.wood))
    this.ramp.position.set(-1.3, 0.6, 0.9)
    this.ramp.rotation.z = Math.PI / 2
    this.root.add(this.ramp)

    this.rudder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.6), mat(COLORS.metal))
    this.rudder.position.set(0, -0.3, 3.4)
    this.root.add(this.rudder)
    this.propeller = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), mat(COLORS.metal))
    this.propeller.position.set(0, -0.45, 3.1)
    this.root.add(this.propeller)

    for (const [name, object] of buildSockets(this.id, this.root, {
      dock_anchor: [-1.7, 0.15, 0.9],
      entry_passenger: [-1.9, 0.15, 0.9],
      exit_passenger_primary: [-2.1, 0.15, 0.9],
      passenger_safe_zone: [0, 0.61, 0.6],
      seat_passenger_01: [0, 1.01, 1.4],
      camera_boarding: [-4.2, 2.6, 3.2],
      camera_drive: [0, 3.2, 8],
      hand_gate: [-1.25, 1.15, 0.2],
      hand_rail: [1.2, 1.5, 0.6],
      foot_ramp: [-1.9, 0.65, 0.9],
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

  get entryPartState(): 'open' | 'closed' | 'moving' {
    if (this.gateOpen > 0.97) return 'open'
    if (this.gateOpen < 0.03) return 'closed'
    return 'moving'
  }

  get dockedAt(): Mooring | null {
    return this.mooring
  }

  setEntryPartOpen(open: boolean): void {
    this.gateTarget = open ? 1 : 0
  }

  /** entry_conditions aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json. */
  checkEntryCondition(condition: string): boolean {
    switch (condition) {
      case 'vehicle_docked':
        return this.mooring !== null
      case 'ramp_deployed':
        return this.rampOut > 0.9
      case 'boarding_lane_clear': {
        // Geprueft wird der Stehplatz ueber dem Anleger, nicht der Anleger selbst.
        const anchor = this.socketWorld('entry_passenger')
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

  place(position: THREE.Vector3, heading: number): void {
    this.position.copy(position)
    this.position.y = WATER_LEVEL
    this.heading = heading
    this.speed = 0
    this.mooring = this.nearestMooring()
    this.mooringBlend = this.mooring ? 1 : 0
    this.rampOut = this.mooring ? 1 : 0
    this.syncTransform()
  }

  drive(delta: number, throttle: number, steerInput: number, brake: boolean): void {
    if (brake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * delta)
    } else if (throttle !== 0) {
      const limit = throttle > 0 ? MAX_SPEED : -REVERSE_SPEED
      this.speed += (limit - this.speed) * Math.min(1, delta * 0.9)
    } else {
      // Wasserwiderstand statt Bremse: das Boot laeuft aus.
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.1 * delta)
    }

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 3, 0, 1)
    this.steer += (steerInput - this.steer) * Math.min(1, delta * 4)
    this.heading -= this.steer * speedFactor * delta * 1.1 * Math.sign(this.speed || 1)

    const next = this.position.clone()
    next.x -= Math.sin(this.heading) * this.speed * delta
    next.z -= Math.cos(this.heading) * this.speed * delta
    if (this.isNavigable(next.x, next.z)) {
      this.position.x = next.x
      this.position.z = next.z
    } else {
      this.speed *= 0.2
    }

    this.updateMooring(delta)
    this.syncTransform()
  }

  update(delta: number): void {
    this.clock += delta
    this.gateOpen += (this.gateTarget - this.gateOpen) * Math.min(1, delta * 4)
    this.gate.rotation.y = this.gateOpen * 1.5
    this.ramp.position.x = -1.3 - this.rampOut * 0.75
    this.ramp.visible = this.rampOut > 0.05
    this.rudder.rotation.y = this.steer * 0.5
    this.propeller.rotation.z += delta * (2 + Math.abs(this.speed) * 3)
    this.syncTransform()
  }

  settle(delta: number): void {
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.4 * delta)
    this.updateMooring(delta)
    this.syncTransform()
  }

  /** Automatisches Anlegen: langsam genug und nah genug an einem Anleger. */
  private updateMooring(delta: number): void {
    const candidate = Math.abs(this.speed) < MOORING_SPEED ? this.nearestMooring() : null
    if (candidate !== this.mooring) {
      this.mooring = candidate
      this.mooringBlend = 0
    }
    if (this.mooring) {
      this.mooringBlend = Math.min(1, this.mooringBlend + delta * 2)
      const t = this.mooringBlend * Math.min(1, delta * 6)
      this.position.lerp(this.mooring.position, t)
      let diff = this.mooring.heading - this.heading
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.heading += diff * t
      this.speed *= 0.85
      this.rampOut = Math.min(1, this.rampOut + delta * 2.5)
    } else {
      this.rampOut = Math.max(0, this.rampOut - delta * 2.5)
    }
  }

  private nearestMooring(): Mooring | null {
    let best: Mooring | null = null
    let bestDistance = MOORING_RADIUS
    for (const mooring of this.moorings) {
      const distance = Math.hypot(
        mooring.position.x - this.position.x,
        mooring.position.z - this.position.z,
      )
      if (distance < bestDistance) {
        best = mooring
        bestDistance = distance
      }
    }
    return best
  }

  /** Wasser ist alles, was unterhalb der Kaikante liegt. */
  private isNavigable(x: number, z: number): boolean {
    const ground = this.collision.groundHeightAt(x, z, 6, 0.8, 'vehicle')
    return ground < -1
  }

  private syncTransform(): void {
    this.position.y = WATER_LEVEL
    this.root.position.set(
      this.position.x,
      WATER_LEVEL + Math.sin(this.clock * 1.6) * 0.05,
      this.position.z,
    )
    this.root.rotation.set(
      Math.sin(this.clock * 1.1) * 0.014,
      this.heading,
      Math.sin(this.clock * 0.9) * 0.02 - this.steer * 0.05,
    )
    this.root.updateMatrixWorld(true)
  }
}
