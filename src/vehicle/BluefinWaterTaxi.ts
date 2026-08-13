import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
import { PartBatcher, box, capsule, cylinder, sphere, torus } from '../core/Shapes'
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

/** Grundriss des Rumpfs: der Wasserbus ist im Aufriss eine liegende Ellipse. */
const BEAM = 1.3
const LENGTH = 3.45

const HULL = COLORS.taxiHull
const KEEL = COLORS.taxiKeel
const KEEL_DARK = COLORS.taxiKeelDark
const TRIM = COLORS.taxiTrim
const FRAME = COLORS.taxiFrame

/**
 * Ellipsenfoermige Scheibe im Grundriss - der Baustein, aus dem Rumpf, Bordwand,
 * Fensterband und Dach bestehen. Ein Zylinder mit ungleichen Achsenskalen liest
 * als Bootsquerschnitt, wo eine Kiste als Kiste liest.
 */
function ellipse(halfWidth: number, halfLength: number, height: number, taper = 1): THREE.BufferGeometry {
  const geometry = cylinder(1, taper, height, 24)
  geometry.scale(halfWidth, 1, halfLength)
  return geometry
}

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
  private readonly ramp = new THREE.Group()
  private readonly rudder = new THREE.Group()
  private readonly propeller = new THREE.Group()
  private mooring: Mooring | null = null
  private mooringBlend = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
    private readonly moorings: Mooring[],
  ) {
    this.buildHull()
    this.buildCabin()
    this.buildInterior()
    this.buildFittings()

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

  /**
   * Rumpf nach der Mehransicht: tealer Unterrumpf bis zur orangen Scheuerleiste,
   * darueber die cremefarbene Bordwand. Die Wasserlinie liegt bei y = 0.
   */
  private buildHull(): void {
    const b = new PartBatcher()
    b.add(ellipse(BEAM, LENGTH, 0.95, 0.64), KEEL, { pos: [0, -0.075, 0] })
    // Kielrundung, damit der Rumpf nicht auf einer Kante im Wasser steht.
    b.add(sphere(1, 14, 8), KEEL_DARK, { pos: [0, -0.5, 0], scale: [BEAM * 0.64, 0.3, LENGTH * 0.64] })
    // Scheuerleiste: der Absatz, an dem sich Teal und Creme treffen.
    b.add(ellipse(BEAM * 1.03, LENGTH * 1.02, 0.11), TRIM, { pos: [0, 0.4, 0] })
    b.add(ellipse(BEAM, LENGTH, 0.82), HULL, { pos: [0, 0.86, 0] })
    // Handlaufkante der Bordwand.
    b.add(ellipse(BEAM * 1.015, LENGTH * 1.01, 0.07), TRIM, { pos: [0, 1.24, 0] })

    // Reifenfender an beiden Flanken - das Signaturdetail der Seitenansicht.
    for (const side of [-1, 1]) {
      for (const z of [-2.2, -0.2, 2.3]) {
        b.add(torus(0.23, 0.085, 6, 12), COLORS.tyre, {
          pos: [side * BEAM * 1.02, 0.24, z],
          rot: [0, Math.PI / 2, 0],
        })
        b.add(box(0.05, 0.34, 0.05), FRAME, { pos: [side * BEAM * 1.01, 0.44, z] })
      }
    }

    // Pfotenemblem im Ring auf dem Bug - Frontansicht des Pakets.
    b.add(torus(0.33, 0.055, 6, 18), TRIM, { pos: [0, 0.82, -LENGTH - 0.02] })
    b.add(cylinder(0.31, 0.31, 0.06, 18), HULL, {
      pos: [0, 0.82, -LENGTH - 0.04],
      rot: [Math.PI / 2, 0, 0],
    })
    b.add(sphere(0.12, 8, 6), COLORS.cyan, {
      pos: [0, 0.78, -LENGTH - 0.09],
      scale: [1.1, 0.95, 0.4],
    })
    for (const [dx, dy] of [
      [-0.13, 0.13],
      [-0.045, 0.17],
      [0.045, 0.17],
      [0.13, 0.13],
    ]) {
      b.add(sphere(0.048, 6, 5), COLORS.cyan, {
        pos: [dx, 0.82 + dy, -LENGTH - 0.09],
        scale: [1, 1, 0.4],
      })
    }

    // Klampen vorn und achtern.
    for (const z of [-LENGTH + 0.35, LENGTH - 0.35]) {
      b.add(box(0.4, 0.1, 0.14), TRIM, { pos: [0, 1.3, z] })
    }
    b.finish(this.root)
  }

  /**
   * Aufbau: umlaufendes Fensterband in dunklen Rahmen, darueber das flache Dach
   * mit oranger Kante, Solarfeld und Gepaeckpod.
   */
  private buildCabin(): void {
    const b = new PartBatcher()
    // Fensterrahmen unten und oben, dazwischen die Pfosten.
    b.add(ellipse(BEAM * 0.985, LENGTH * 0.99, 0.08), FRAME, { pos: [0, 1.29, 0] })
    b.add(ellipse(BEAM * 0.985, LENGTH * 0.99, 0.08), FRAME, { pos: [0, 1.87, 0] })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      b.add(box(0.1, 0.6, 0.14), FRAME, {
        pos: [Math.sin(a) * BEAM * 0.97, 1.58, Math.cos(a) * LENGTH * 0.98],
        rot: [0, a, 0],
      })
    }
    // Dach: oranger Rand, cremefarbene Deckplatte.
    b.add(ellipse(BEAM * 1.035, LENGTH * 1.02, 0.17), TRIM, { pos: [0, 1.98, 0] })
    b.add(ellipse(BEAM * 0.95, LENGTH * 0.97, 0.12), HULL, { pos: [0, 2.08, 0] })
    b.add(ellipse(BEAM * 0.95, LENGTH * 0.97, 0.1), HULL, { pos: [0, 1.87, 0] })
    // Gepaeckpod und Solarfeld auf dem Dach.
    b.add(capsule(0.4, 1.5, 10), HULL, {
      pos: [0, 2.16, 1.2],
      rot: [Math.PI / 2, 0, 0],
      scale: [1, 1, 0.5],
    })
    b.add(box(1.32, 0.06, 1.9), HULL, { pos: [0, 2.15, -1.2] })
    b.add(box(1.14, 0.05, 1.72), COLORS.solarPanel, { pos: [0, 2.19, -1.2] })
    // Suchscheinwerfer und Antennen.
    b.add(cylinder(0.14, 0.14, 0.12, 10), FRAME, {
      pos: [0.5, 2.26, -2.1],
      rot: [Math.PI / 2, 0, 0],
    })
    b.add(sphere(0.12, 8, 6), COLORS.gold, { pos: [0.5, 2.26, -2.17], scale: [1, 1, 0.6] })
    for (const side of [-1, 1]) {
      b.add(cylinder(0.025, 0.025, 0.55, 6), TRIM, { pos: [side * 0.95, 2.42, 2.6] })
    }
    b.finish(this.root)

    // Verglasung transparent: die Sitzreihen sollen von aussen lesbar bleiben.
    const glass = new PartBatcher()
    glass.add(ellipse(BEAM * 0.96, LENGTH * 0.975, 0.58), COLORS.glass, { pos: [0, 1.58, 0] })
    glass.finish(this.root, { opacity: 0.45 })
  }

  /** Deck, Sitzreihen, Steuerstand und Handlauf - sichtbar durch die Scheiben. */
  private buildInterior(): void {
    const b = new PartBatcher()
    b.add(ellipse(BEAM * 0.9, LENGTH * 0.93, 0.07), COLORS.wood, { pos: [0, 0.58, 0] })
    // Sitzbaenke quer, wie in der Draufsicht.
    for (const z of [-1.5, -0.1, 1.4]) {
      b.add(box(2.05, 0.14, 0.52), COLORS.navy, { pos: [0, 0.8, z] })
      b.add(box(2.05, 0.42, 0.12), COLORS.navy, { pos: [0, 1.02, z - 0.26] })
      b.add(box(0.06, 0.16, 0.5), COLORS.navyMid, { pos: [0, 0.88, z] })
    }
    // Steuerstand am Bug.
    b.add(box(1.15, 0.5, 0.34), FRAME, { pos: [0, 0.86, -2.5] })
    b.add(box(0.5, 0.12, 0.24), COLORS.cyan, { pos: [-0.35, 1.13, -2.55] })
    b.add(torus(0.16, 0.03, 6, 12), COLORS.navy, { pos: [-0.35, 1.28, -2.35], rot: [1.2, 0, 0] })
    // hand_rail: Haltestange an Steuerbord.
    b.add(cylinder(0.045, 0.045, 4.6, 8), COLORS.metal, {
      pos: [1.12, 1.5, 0.2],
      rot: [Math.PI / 2, 0, 0],
    })
    for (const z of [-1.9, 0.2, 2.3]) {
      b.add(box(0.16, 0.05, 0.05), COLORS.metal, { pos: [1.2, 1.5, z] })
    }
    b.finish(this.root, { castShadow: false })
  }

  /** Bewegliche Teile: Einstiegsklappe, Rampe, Ruder, Schraube. */
  private buildFittings(): void {
    // boarding_gate an Backbord: teale Klappe im orangen Rahmen.
    this.gate.position.set(-1.2, 0.61, 0.9)
    this.root.add(this.gate)
    const g = new PartBatcher()
    g.add(box(0.08, 1.2, 1.5), KEEL, { pos: [0, 0.6, -0.8] })
    g.add(box(0.1, 0.1, 1.5), TRIM, { pos: [0, 1.18, -0.8] })
    g.add(box(0.1, 1.2, 0.1), TRIM, { pos: [0, 0.6, -1.5] })
    g.add(sphere(0.07, 6, 5), TRIM, { pos: [-0.06, 0.85, -0.2] })
    g.finish(this.gate)

    // boarding_ramp: faehrt erst am Anleger aus.
    this.ramp.position.set(-1.3, 0.6, 0.9)
    this.root.add(this.ramp)
    const r = new PartBatcher()
    r.add(box(1.5, 0.09, 1.3), COLORS.wood)
    for (const dz of [-0.5, 0, 0.5]) {
      r.add(box(1.5, 0.04, 0.1), TRIM, { pos: [0, 0.06, dz] })
    }
    r.finish(this.ramp, { castShadow: false })

    // Ruder und Schraube unter der Wasserlinie am Heck.
    this.rudder.position.set(0, -0.3, 3.3)
    this.root.add(this.rudder)
    const rd = new PartBatcher()
    rd.add(box(0.1, 0.7, 0.6), COLORS.metal, { pos: [0, 0, 0.1] })
    rd.finish(this.rudder, { castShadow: false })

    this.propeller.position.set(0, -0.45, 3.0)
    this.root.add(this.propeller)
    const p = new PartBatcher()
    p.add(cylinder(0.1, 0.1, 0.18, 8), COLORS.metal, { rot: [Math.PI / 2, 0, 0] })
    for (const angle of [0, 2.1, 4.2]) {
      p.add(box(0.62, 0.14, 0.05), COLORS.metal, { rot: [0, 0, angle] })
    }
    p.finish(this.propeller, { castShadow: false })
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
