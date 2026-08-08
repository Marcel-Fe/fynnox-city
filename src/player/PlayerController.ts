import * as THREE from 'three'
import { CollisionWorld, moveAndSlide } from '../core/CollisionWorld'
import { FynnoxModel } from './FynnoxModel'
import type { OrbitCameraRig } from '../camera/OrbitCameraRig'
import type { InputManager } from '../input/InputManager'

const WALK_SPEED = 2.6
const SPRINT_SPEED = 5.4
const GRAVITY = 20
const JUMP_VELOCITY = 7.0
const HALF = new THREE.Vector3(0.3, 0.75, 0.3)
const MANTLE_MIN = 0.45
const MANTLE_MAX = 1.4
const MANTLE_SECONDS = 0.42
const FALLBACK_SPAWN = new THREE.Vector3(-26, 0.4, -16)

export class PlayerController {
  readonly model = new FynnoxModel()
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  heading = 0
  grounded = false
  /** Steuerung pausiert (Dialog, Menue, Boarding) - die Welt laeuft weiter. */
  controlEnabled = true
  visible = true
  /** Meldung an das HUD, wenn Fynnox aus dem Wasser geholt wurde. */
  onRescued: (() => void) | null = null

  /** Letzter trockener Stand - Grundlage der Rettung aus dem Hafenbecken. */
  private readonly lastSafeGround = new THREE.Vector3()
  private mantle: { from: THREE.Vector3; to: THREE.Vector3; time: number } | null = null
  private airTime = 0
  private landTimer = 0
  private actionTimer = 0
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()
  private readonly probe = new THREE.Box3()

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
  ) {
    scene.add(this.model.root)
  }

  teleport(position: THREE.Vector3, heading = this.heading): void {
    this.position.copy(position)
    this.velocity.set(0, 0, 0)
    this.heading = heading
    this.mantle = null
    if (position.y > -0.5) this.lastSafeGround.copy(position)
  }

  get isMantling(): boolean {
    return this.mantle !== null
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.model.root.visible = visible
  }

  /** Kurze Aktionspose (Aufheben, Schalter, Scannen) ohne Steuerungsverlust. */
  playAction(state: 'fox_pickup' | 'fox_press_button' | 'fox_scan' | 'fox_wave', seconds = 0.6): void {
    this.model.setState(state)
    this.actionTimer = seconds
  }

  update(delta: number, input: InputManager, rig: OrbitCameraRig): void {
    if (this.mantle) {
      this.updateMantle(delta)
      this.applyTransform(delta)
      return
    }

    const speedLimit = input.isHeld('sprint') ? SPRINT_SPEED : WALK_SPEED
    this.wish.set(0, 0, 0)

    if (this.controlEnabled) {
      rig.getPlanarBasis(this.forward, this.right)
      this.wish
        .copy(this.forward)
        .multiplyScalar(input.move.y)
        .addScaledVector(this.right, input.move.x)
      if (this.wish.lengthSq() > 1) this.wish.normalize()
    }

    const targetVelocity = this.wish.clone().multiplyScalar(speedLimit)
    const accel = this.grounded ? 14 : 5
    this.velocity.x += (targetVelocity.x - this.velocity.x) * Math.min(1, delta * accel)
    this.velocity.z += (targetVelocity.z - this.velocity.z) * Math.min(1, delta * accel)

    if (this.controlEnabled && input.consume('jump')) {
      if (this.grounded) {
        this.velocity.y = JUMP_VELOCITY
        this.grounded = false
        this.model.setState('fox_jump_start')
      } else if (this.tryMantle()) {
        return
      }
    }

    this.velocity.y -= GRAVITY * delta

    const motion = new THREE.Vector3(
      this.velocity.x * delta,
      this.velocity.y * delta,
      this.velocity.z * delta,
    )
    const result = moveAndSlide(this.collision, this.position, HALF, motion)

    if (result.grounded) {
      if (!this.grounded && this.airTime > 0.35) this.landTimer = 0.25
      this.grounded = true
      this.velocity.y = 0
      this.airTime = 0
      if (this.position.y > -0.5) this.lastSafeGround.copy(this.position)
    } else {
      this.grounded = false
      this.airTime += delta
    }

    // Automatisches Aufziehen an niedrigen Kanten, wenn man dagegen laeuft.
    if (this.controlEnabled && result.hitWall && this.wish.lengthSq() > 0.1) this.tryMantle()

    // Ins Hafenbecken zu rutschen kostet nur Zeit: Fynnox steht wieder am
    // letzten trockenen Punkt, nichts geht verloren.
    if (this.position.y < -1.2) {
      const rescue = this.lastSafeGround.lengthSq() > 0 ? this.lastSafeGround : FALLBACK_SPAWN
      this.teleport(rescue.clone(), this.heading)
      this.onRescued?.()
    }

    this.applyTransform(delta)
    this.selectAnimation(delta)
  }

  private applyTransform(delta: number): void {
    const planar = Math.hypot(this.velocity.x, this.velocity.z)
    if (planar > 0.4 && this.controlEnabled) {
      const desired = Math.atan2(this.velocity.x, this.velocity.z)
      let diff = desired - this.heading
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.heading += diff * Math.min(1, delta * 12)
    }
    this.model.root.position.copy(this.position)
    this.model.root.rotation.y = this.heading
  }

  private selectAnimation(delta: number): void {
    if (this.actionTimer > 0) {
      this.actionTimer -= delta
      this.model.update(delta, 0)
      return
    }
    const planar = Math.hypot(this.velocity.x, this.velocity.z)
    if (!this.grounded) {
      this.model.setState(this.velocity.y > 0.5 ? 'fox_jump_start' : 'fox_jump_air')
    } else if (this.landTimer > 0) {
      this.landTimer -= delta
      this.model.setState('fox_land_soft')
    } else if (planar > SPRINT_SPEED * 0.7) {
      this.model.setState('fox_sprint')
    } else if (planar > 0.35) {
      this.model.setState('fox_walk')
    } else {
      this.model.setState('fox_idle')
    }
    this.model.update(delta, planar)
  }

  /**
   * Kletterkante nach Paketmass: 0,8-1,4 m ueber der Standflaeche.
   * Der Sprung deckt bis 1,2 m ab, das Aufziehen den Rest.
   */
  private tryMantle(): boolean {
    const dir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading))
    const ahead = this.position.clone().addScaledVector(dir, 0.55)
    this.probe.min.set(ahead.x - 0.32, this.position.y + 0.05, ahead.z - 0.32)
    this.probe.max.set(ahead.x + 0.32, this.position.y + MANTLE_MAX, ahead.z + 0.32)
    const hits = this.collision.query(this.probe)
    if (hits.length === 0) return false

    const top = Math.max(...hits.map((h) => h.box.max.y))
    const rise = top - this.position.y
    if (rise < MANTLE_MIN || rise > MANTLE_MAX) return false

    const landing = this.position.clone().addScaledVector(dir, 0.75)
    landing.y = top + 0.02
    const free = new THREE.Box3(
      new THREE.Vector3(landing.x - HALF.x, landing.y + 0.02, landing.z - HALF.z),
      new THREE.Vector3(landing.x + HALF.x, landing.y + HALF.y * 2, landing.z + HALF.z),
    )
    if (!this.collision.isFree(free)) return false

    this.mantle = { from: this.position.clone(), to: landing, time: 0 }
    this.velocity.set(0, 0, 0)
    this.model.setState('fox_ledge_grab')
    return true
  }

  private updateMantle(delta: number): void {
    const mantle = this.mantle
    if (!mantle) return
    mantle.time += delta
    const t = Math.min(1, mantle.time / MANTLE_SECONDS)
    if (t > 0.35) this.model.setState('fox_climb_up')
    // Erst hoch, dann nach vorne - liest sich wie ein echtes Aufziehen.
    this.position.x = THREE.MathUtils.lerp(mantle.from.x, mantle.to.x, THREE.MathUtils.smoothstep(t, 0.35, 1))
    this.position.z = THREE.MathUtils.lerp(mantle.from.z, mantle.to.z, THREE.MathUtils.smoothstep(t, 0.35, 1))
    this.position.y = THREE.MathUtils.lerp(mantle.from.y, mantle.to.y, THREE.MathUtils.smoothstep(t, 0, 0.7))
    this.model.update(delta, 0)
    if (t >= 1) {
      this.mantle = null
      this.grounded = true
    }
  }
}
