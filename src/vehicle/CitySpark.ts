import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import { CollisionWorld, moveAndSlide } from '../core/CollisionWorld'
import { buildSockets, type BoardableVehicle } from './BoardableVehicle'

const HALF = new THREE.Vector3(0.85, 0.85, 1.6)
const MAX_SPEED = 12
const REVERSE_SPEED = 4
const ACCEL = 9
const BRAKE = 16
const DRAG = 1.6

/**
 * City Spark Elektrobuggy.
 * Sockets und bewegliche Teile kommen aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json;
 * fehlt ein geforderter Socket, faellt das beim Start auf, nicht im Spiel.
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
  private readonly wheels: THREE.Mesh[] = []
  private readonly steeringWheel: THREE.Mesh
  private doorOpen = 0
  private doorTarget = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
  ) {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.0), mat(COLORS.sparkBody))
    chassis.position.y = 0.62
    chassis.castShadow = true
    this.root.add(chassis)

    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.6), mat(COLORS.navyMid))
    floor.position.set(0, 0.86, 0.15)
    this.root.add(floor)

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.5), mat(COLORS.coral))
    seat.position.set(-0.42, 0.95, 0.25)
    this.root.add(seat)
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.12), mat(COLORS.coral))
    seatBack.position.set(-0.42, 1.25, 0.5)
    this.root.add(seatBack)

    const roll = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.12), mat(COLORS.metal))
    roll.position.set(0, 1.85, 0.4)
    this.root.add(roll)
    for (const sx of [-0.7, 0.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), mat(COLORS.metal))
      post.position.set(sx, 1.35, 0.4)
      this.root.add(post)
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.4), mat(COLORS.cyan))
    canopy.position.set(0, 1.92, -0.1)
    this.root.add(canopy)

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.5), mat(COLORS.cream))
    nose.position.set(0, 0.75, -1.4)
    this.root.add(nose)

    this.steeringWheel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), mat(COLORS.navy))
    this.steeringWheel.position.set(-0.42, 1.18, -0.42)
    this.steeringWheel.rotation.x = -0.7
    this.root.add(this.steeringWheel)

    // door_driver als eigene Gruppe, damit sie um ihr Scharnier schwingt.
    this.door.position.set(-0.8, 0.55, -0.55)
    this.root.add(this.door)
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.1), mat(COLORS.sparkBody))
    doorPanel.position.set(0, 0.2, 0.55)
    this.door.add(doorPanel)

    for (const [wx, wz] of [
      [-0.85, -1.05],
      [0.85, -1.05],
      [-0.85, 1.05],
      [0.85, 1.05],
    ]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 14), mat(COLORS.navy))
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(wx, 0.38, wz)
      wheel.castShadow = true
      this.root.add(wheel)
      this.wheels.push(wheel)
    }

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

    const rotation = (this.speed * delta) / 0.38
    for (const wheel of this.wheels) wheel.rotation.x += rotation
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
