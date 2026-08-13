import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import { CollisionWorld, moveAndSlide } from '../core/CollisionWorld'
import { PartBatcher, capsule, cylinder, roundedBox, sphere, torus } from '../core/Shapes'
import { buildSockets, type BoardableVehicle } from './BoardableVehicle'

const HALF = new THREE.Vector3(0.85, 0.85, 1.6)
const MAX_SPEED = 12
const REVERSE_SPEED = 4
const ACCEL = 9
const BRAKE = 16
const DRAG = 1.6
const WHEEL_RADIUS = 0.42

const BODY = COLORS.sparkBody
const BODY_DARK = COLORS.sparkBodyDark
const TRIM = COLORS.sparkTrim
const TYRE = COLORS.tyre

/**
 * City Spark Elektrobuggy nach 03_Bildreferenzen/09_Fahrzeuge/01_City_Spark:
 * gerundete Teal-Karosserie mit orangem Zierstreifen, Ballonreifen mit orangen
 * Felgen, Kotfluegelboegen ueber den Raedern, offenes Cockpit mit Ueberrollbuegel.
 *
 * Die Karosserie besteht aus Rundkoerpern statt Kisten und wird pro Farbe
 * verschmolzen - dadurch ist das deutlich detailliertere Modell nicht teurer
 * als die Graybox davor. Sockets und Masse bleiben unveraendert, damit die
 * Boarding-Kette und die Fahrphysik gleich bleiben.
 */
export class CitySpark implements BoardableVehicle {
  readonly id = 'vehicle_city_spark'
  readonly label = 'City Spark'
  readonly seatOffset = new THREE.Vector3(0, -0.45, 0)
  readonly root = new THREE.Group()
  readonly sockets = new Map<string, THREE.Object3D>()
  readonly position = new THREE.Vector3()
  heading = 0
  speed = 0
  private steer = 0
  private readonly door = new THREE.Group()
  private readonly wheels: THREE.Group[] = []
  private readonly steeringWheel = new THREE.Group()
  private doorOpen = 0
  private doorTarget = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
  ) {
    this.buildBody()
    this.buildWheels()
    this.buildDoor()

    for (const [name, object] of buildSockets(this.id, this.root, {
      entry_driver: [-1.5, 0, 0.2],
      exit_driver_primary: [-1.7, 0, 0.2],
      exit_driver_alt: [1.7, 0, 0.2],
      seat_driver: [-0.42, 1.07, 0.25],
      look_driver: [-0.42, 1.55, -1.0],
      camera_boarding: [-3.4, 2.2, 1.8],
      camera_drive: [0, 2.4, 4.6],
      hand_door: [-0.95, 1.05, -0.1],
      hand_wheel_l: [-0.6, 1.2, -0.45],
      hand_wheel_r: [-0.24, 1.2, -0.45],
      foot_pedal_l: [-0.55, 0.9, -0.75],
      foot_pedal_r: [-0.3, 0.9, -0.75],
    })) {
      this.sockets.set(name, object)
    }

    scene.add(this.root)
  }

  private buildBody(): void {
    const b = new PartBatcher()

    // Wanne: eine liegende Kapsel statt eines Quaders - das ist die Grundform,
    // die den Buggy rund macht.
    b.add(capsule(0.58, 1.75, 12), BODY, {
      pos: [0, 0.72, 0.05],
      rot: [Math.PI / 2, 0, 0],
      scale: [1.32, 1, 0.92],
    })
    // Bug und Heck laufen weich aus.
    b.add(sphere(0.5, 12, 10), BODY, { pos: [0, 0.72, -1.42], scale: [1.3, 0.86, 1.05] })
    b.add(sphere(0.48, 12, 10), BODY, { pos: [0, 0.76, 1.4], scale: [1.28, 0.9, 1.0] })
    // Motorhaube leicht angehoben.
    b.add(sphere(0.42, 10, 8), BODY, { pos: [0, 0.95, -1.05], scale: [1.5, 0.55, 1.5] })

    // Oranger Zierstreifen laeuft ueber die Flanke - Signaturmerkmal der Referenz.
    b.pair((side) => ({
      geometry: capsule(0.09, 2.0, 8),
      color: TRIM,
      place: { pos: [side * 0.79, 0.66, 0.02], rot: [Math.PI / 2, 0, 0], scale: [0.45, 1, 1] },
    }))
    b.pair((side) => ({
      geometry: sphere(0.11, 8, 6),
      color: TRIM,
      place: { pos: [side * 0.6, 0.78, -1.42], scale: [0.5, 0.9, 1.2] },
    }))

    // Cockpitwanne: dunkle Vertiefung, damit die Oeffnung als Innenraum liest.
    b.add(roundedBox(1.16, 0.34, 1.5, 0.14), BODY_DARK, { pos: [0, 1.07, 0.2] })
    b.add(roundedBox(1.05, 0.1, 1.35, 0.05), COLORS.navy, { pos: [0, 0.95, 0.2] })
    // Armaturentraeger.
    b.add(roundedBox(1.05, 0.26, 0.3, 0.1), BODY_DARK, { pos: [0, 1.12, -0.62] })
    b.add(roundedBox(0.4, 0.13, 0.06, 0.04), COLORS.cyan, { pos: [-0.42, 1.2, -0.76] })

    // Sitze: gerundete Schalen in Dunkelblau (Referenz Frontansicht).
    for (const sx of [-0.42, 0.42]) {
      b.add(capsule(0.24, 0.16, 8), COLORS.navy, {
        pos: [sx, 1.06, 0.28],
        rot: [Math.PI / 2, 0, 0],
        scale: [1, 0.5, 1],
      })
      b.add(capsule(0.23, 0.34, 8), COLORS.navy, {
        pos: [sx, 1.36, 0.55],
        rot: [0.22, 0, 0],
        scale: [1, 1, 0.42],
      })
      b.add(capsule(0.16, 0.1, 6), COLORS.navy, { pos: [sx, 1.66, 0.62], scale: [1, 1, 0.5] })
    }

    // Windschutzscheibe: flach und gerundet ueber dem Armaturentraeger.
    b.add(roundedBox(1.12, 0.3, 0.06, 0.05), COLORS.navy, {
      pos: [0, 1.32, -0.72],
      rot: [-0.55, 0, 0],
    })

    // Ueberrollbuegel: dunkles Rohr mit orangem Polster oben (Referenz).
    b.pair((side) => ({
      geometry: cylinder(0.05, 0.05, 0.78, 8),
      color: COLORS.navy,
      place: { pos: [side * 0.6, 1.4, 0.72] },
    }))
    b.add(torus(0.6, 0.05, 6, 14, Math.PI), COLORS.navy, { pos: [0, 1.79, 0.72] })
    b.add(capsule(0.075, 0.62, 8), TRIM, {
      pos: [0, 1.86, 0.72],
      rot: [0, 0, Math.PI / 2],
    })
    b.add(cylinder(0.042, 0.042, 1.2, 8), COLORS.navy, {
      pos: [0, 1.72, 1.05],
      rot: [0, 0, Math.PI / 2],
    })

    // Heckdeck mit Ruecklichtband.
    b.add(roundedBox(1.3, 0.22, 0.5, 0.1), BODY, { pos: [0, 1.12, 1.28] })
    b.add(roundedBox(1.0, 0.09, 0.08, 0.04), COLORS.coral, { pos: [0, 1.18, 1.53] })

    // Pfotenemblem im leuchtenden Ring mitten auf der Nase - das Signaturbild
    // der Frontansicht, nicht ein Aufkleber an der Flanke.
    b.add(torus(0.3, 0.055, 6, 18), TRIM, { pos: [0, 0.82, -1.66] })
    b.add(cylinder(0.28, 0.28, 0.05, 18), COLORS.gold, {
      pos: [0, 0.82, -1.66],
      rot: [Math.PI / 2, 0, 0],
    })
    b.add(sphere(0.11, 8, 6), COLORS.cream, { pos: [0, 0.8, -1.7], scale: [1.15, 0.95, 0.4] })
    for (const [dx, dy] of [
      [-0.13, 0.13],
      [-0.045, 0.17],
      [0.045, 0.17],
      [0.13, 0.13],
    ]) {
      b.add(sphere(0.045, 6, 5), COLORS.cream, { pos: [dx, 0.82 + dy, -1.7], scale: [1, 1, 0.4] })
    }

    // Scheinwerfer seitlich der Nase.
    b.pair((side) => ({
      geometry: sphere(0.1, 10, 8),
      color: COLORS.gold,
      place: { pos: [side * 0.56, 0.96, -1.55], scale: [1, 1, 0.6] },
    }))
    // Blinker aussen auf den Kotfluegeln.
    b.pair((side) => ({
      geometry: roundedBox(0.18, 0.07, 0.12, 0.03),
      color: COLORS.gold,
      place: { pos: [side * 0.86, 1.02, -1.1] },
    }))

    // Rammschutz und Unterfahrschutz vorn.
    b.add(capsule(0.075, 1.35, 8), COLORS.navy, {
      pos: [0, 0.4, -1.78],
      rot: [0, 0, Math.PI / 2],
    })
    b.pair((side) => ({
      geometry: cylinder(0.05, 0.05, 0.34, 8),
      color: COLORS.navy,
      place: { pos: [side * 0.5, 0.55, -1.7], rot: [Math.PI / 2, 0, 0] },
    }))
    b.add(roundedBox(1.0, 0.1, 0.16, 0.04), TRIM, { pos: [0, 0.55, -1.62] })

    // Federbeine, in der Frontansicht deutlich sichtbar.
    b.pair((side) => ({
      geometry: cylinder(0.05, 0.05, 0.44, 8),
      color: TRIM,
      place: { pos: [side * 0.62, 0.62, -1.05], rot: [0, 0, 0.18 * side] },
    }))

    // Trittbrett.
    b.pair((side) => ({
      geometry: roundedBox(0.16, 0.08, 1.1, 0.04),
      color: BODY_DARK,
      place: { pos: [side * 0.8, 0.42, 0.15] },
    }))

    b.finish(this.root)

    // Lenkrad dreht mit, also eigene Gruppe.
    const w = new PartBatcher()
    w.add(torus(0.17, 0.032, 6, 14), COLORS.navy)
    w.add(cylinder(0.05, 0.05, 0.05, 8), COLORS.navy, { rot: [Math.PI / 2, 0, 0] })
    for (const angle of [0, 2.1, 4.2]) {
      w.add(roundedBox(0.03, 0.16, 0.03, 0.012), COLORS.navy, {
        pos: [Math.sin(angle) * 0.08, Math.cos(angle) * 0.08, 0],
        rot: [0, 0, -angle],
      })
    }
    w.finish(this.steeringWheel)
    this.steeringWheel.position.set(-0.42, 1.2, -0.5)
    this.steeringWheel.rotation.x = -0.75
    this.root.add(this.steeringWheel)
  }

  /** Ballonreifen mit oranger Felge, dazu ein fester Kotfluegelbogen. */
  private buildWheels(): void {
    for (const [wx, wz] of [
      [-0.78, -1.05],
      [0.78, -1.05],
      [-0.78, 1.05],
      [0.78, 1.05],
    ]) {
      const wheel = new THREE.Group()
      const b = new PartBatcher()
      // Reifen als Torus: rundes Profil statt Zylinderkante.
      b.add(torus(WHEEL_RADIUS - 0.13, 0.13, 8, 18), TYRE, { rot: [0, Math.PI / 2, 0] })
      b.add(cylinder(WHEEL_RADIUS - 0.1, WHEEL_RADIUS - 0.1, 0.24, 16), TYRE, {
        rot: [0, 0, Math.PI / 2],
      })
      // Profilstollen.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        b.add(roundedBox(0.28, 0.07, 0.1, 0.02), TYRE, {
          pos: [0, Math.sin(a) * (WHEEL_RADIUS - 0.03), Math.cos(a) * (WHEEL_RADIUS - 0.03)],
          rot: [-a, 0, 0],
        })
      }
      // Felge und Speichen in Orange.
      b.add(cylinder(0.23, 0.23, 0.26, 14), TRIM, { rot: [0, 0, Math.PI / 2] })
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        b.add(roundedBox(0.28, 0.16, 0.05, 0.02), TRIM, {
          pos: [0, Math.sin(a) * 0.12, Math.cos(a) * 0.12],
          rot: [-a, 0, 0],
        })
      }
      b.add(cylinder(0.09, 0.09, 0.3, 10), BODY_DARK, { rot: [0, 0, Math.PI / 2] })
      b.finish(wheel)
      wheel.position.set(wx, WHEEL_RADIUS, wz)
      this.root.add(wheel)
      this.wheels.push(wheel)

      // Kotfluegel gehoert zur Karosserie, dreht also nicht mit.
      const fender = new PartBatcher()
      fender.add(torus(WHEEL_RADIUS + 0.11, 0.09, 6, 12, Math.PI), BODY, {
        pos: [wx, WHEEL_RADIUS, wz],
        rot: [0, Math.PI / 2, 0],
      })
      fender.add(torus(WHEEL_RADIUS + 0.11, 0.05, 5, 12, Math.PI), TRIM, {
        pos: [wx + Math.sign(wx) * 0.11, WHEEL_RADIUS, wz],
        rot: [0, Math.PI / 2, 0],
      })
      fender.finish(this.root)
    }
  }

  private buildDoor(): void {
    // door_driver als eigene Gruppe, damit sie um ihr Scharnier schwingt.
    this.door.position.set(-0.8, 0.62, -0.6)
    this.root.add(this.door)
    const b = new PartBatcher()
    b.add(capsule(0.2, 0.7, 8), BODY, {
      pos: [0, 0.16, 0.6],
      rot: [Math.PI / 2, 0, 0],
      scale: [0.35, 1, 0.9],
    })
    b.add(capsule(0.06, 0.75, 6), TRIM, {
      pos: [-0.06, 0.1, 0.6],
      rot: [Math.PI / 2, 0, 0],
      scale: [0.4, 1, 1],
    })
    b.add(roundedBox(0.05, 0.05, 0.2, 0.02), COLORS.metal, { pos: [-0.08, 0.32, 0.95] })
    b.finish(this.door)
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

  /** Der Buggy kennt nur entry_requires_stationary, keine Zusatzbedingungen. */
  checkEntryCondition(condition: string): boolean {
    throw new Error(`${this.id} kennt die Bedingung ${condition} nicht`)
  }

  place(position: THREE.Vector3, heading: number): void {
    this.position.copy(position)
    this.heading = heading
    this.speed = 0
    this.syncTransform()
    this.updateCollider()
  }

  setEntryPartOpen(open: boolean): void {
    this.doorTarget = open ? 1 : 0
  }

  get entryPartState(): 'open' | 'closed' | 'moving' {
    if (this.doorOpen > 0.97) return 'open'
    if (this.doorOpen < 0.03) return 'closed'
    return 'moving'
  }

  get isStationary(): boolean {
    return Math.abs(this.speed) < 0.15
  }

  /** Fahrphysik: Arcade, kein Rammen, kein Schaden (Sicherheitsinvariante). */
  drive(delta: number, throttle: number, steerInput: number, braking: boolean): void {
    if (braking) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * delta)
    } else if (throttle !== 0) {
      const limit = throttle > 0 ? MAX_SPEED : -REVERSE_SPEED
      this.speed += (limit - this.speed) * Math.min(1, delta * (ACCEL / Math.max(1, Math.abs(limit))) * 2)
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), DRAG * delta)
    }

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 5, 0, 1)
    this.steer += (steerInput - this.steer) * Math.min(1, delta * 8)
    this.heading -= this.steer * speedFactor * delta * 2.1 * Math.sign(this.speed || 1)

    const motion = new THREE.Vector3(
      -Math.sin(this.heading) * this.speed * delta,
      -6 * delta,
      -Math.cos(this.heading) * this.speed * delta,
    )
    const before = this.position.clone()
    const result = moveAndSlide(this.collision, this.position, HALF, motion, 0.28, 'vehicle')
    if (result.hitWall) {
      // Aufprall bremst, verursacht aber keinen Schaden und kein Rammen.
      const travelled = this.position.distanceTo(before)
      if (travelled < Math.abs(this.speed) * delta * 0.5) this.speed *= 0.35
    }

    const rotation = (this.speed * delta) / WHEEL_RADIUS
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].rotation.x += rotation
      // Vorderraeder lenken sichtbar mit.
      if (i < 2) this.wheels[i].rotation.y = this.steer * 0.5
    }
    this.steeringWheel.rotation.z = this.steer * 0.9
    this.syncTransform()
    this.updateCollider()
  }

  update(delta: number): void {
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, delta * 5)
    this.door.rotation.y = -this.doorOpen * 1.2
  }

  /** Idle-Physik, damit ein geparktes Fahrzeug nicht in der Luft steht. */
  settle(delta: number): void {
    const motion = new THREE.Vector3(0, -6 * delta, 0)
    moveAndSlide(this.collision, this.position, HALF, motion, 0.28, 'vehicle')
    this.syncTransform()
    this.updateCollider()
  }

  private syncTransform(): void {
    this.root.position.copy(this.position)
    this.root.rotation.y = this.heading
    this.root.updateMatrixWorld(true)
  }

  private updateCollider(): void {
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - 1.1, this.position.y, this.position.z - 1.1),
      new THREE.Vector3(this.position.x + 1.1, this.position.y + 1.5, this.position.z + 1.1),
    )
    this.collision.setDynamic(this.id, box, 'vehicle')
  }
}
