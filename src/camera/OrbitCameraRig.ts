import * as THREE from 'three'
import type { CollisionWorld } from '../core/CollisionWorld'
import { cameraProfile } from '../contracts/manifests'
import type { CameraProfile } from '../contracts/types'

export interface CameraTarget {
  /** Punkt, um den die Kamera kreist (Kopfhoehe, nicht Fussposition). */
  position: THREE.Vector3
  distance: number
  minPitch: number
  maxPitch: number
  height: number
}

/** Rest der Rollbewegung, den die Kamera bei roll_compensation noch mitnimmt. */
const RESIDUAL_ROLL = 0.15
/** Zeitkonstante der Horizontdaempfung (cam_vehicle_water) in 1/s. */
const HORIZON_DAMPING = 1.6

const ON_FOOT: CameraTarget = {
  position: new THREE.Vector3(),
  distance: 5.2,
  minPitch: -0.55,
  maxPitch: 1.15,
  height: 1.25,
}

/**
 * Frei drehbare Third-Person-Kamera mit Kollisionsausweichen.
 * Kameraprofile und Blendzeiten stammen aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json;
 * "reduced_motion_supported" schaltet die Blend auf 0 s.
 */
export class OrbitCameraRig {
  readonly camera: THREE.PerspectiveCamera
  /** Startblick die Hauptstrasse entlang - vor dem Rolltor bleibt Platz. */
  yaw = -Math.PI / 2
  pitch = 0.25
  private readonly focus = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  private readonly smoothed = new THREE.Vector3()
  private distance = ON_FOOT.distance
  private targetDistance = ON_FOOT.distance
  private profileId = 'cam_on_foot'
  private profile: CameraProfile | null = null
  /** Rollwinkel des gesteuerten Fahrzeugs, Quelle der roll_compensation. */
  private vehicleRoll = 0
  private roll = 0
  private dampedFocusY = 0
  private focusSeeded = false
  private readonly viewDirection = new THREE.Vector3()
  private blendRemaining = 0
  private blendTotal = 0
  private readonly blendFrom = new THREE.Vector3()
  private initialised = false
  reducedMotion = false
  sensitivity = 1

  constructor(private readonly collision: CollisionWorld) {
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400)
  }

  get activeProfile(): string {
    return this.profileId
  }

  /** Tatsaechlicher Rollwinkel der Kamera - Nachweis der roll_compensation. */
  get cameraRoll(): number {
    return this.roll
  }

  get horizonDamped(): boolean {
    return this.profile?.horizon_damping === true
  }

  get rollCompensated(): boolean {
    return this.profile?.roll_compensation === true
  }

  /**
   * Rollwinkel des gesteuerten Fahrzeugs. Ohne Fahrzeug ist er 0, dann
   * verhaelt sich die Kamera exakt wie vorher.
   */
  setVehicleRoll(roll: number): void {
    this.vehicleRoll = roll
  }

  /**
   * Wechselt das Kameraprofil. Die Blendzeit wird aus dem Manifest gelesen
   * (Mitte des erlaubten Bereichs), damit Boarding-Kameras vertragskonform blenden.
   */
  blendTo(profileId: string, fallbackSeconds = 0.4): void {
    if (this.profileId === profileId) return
    this.profileId = profileId
    // cam_on_foot steht nicht im Fahrzeugmanifest - dort gibt es kein Profil.
    this.profile = profileId === 'cam_on_foot' ? null : cameraProfile(profileId)
    // Die Horizontdaempfung startet beim aktuellen Blickpunkt, sonst zieht die
    // Kamera beim Profilwechsel einmal quer durch das Bild.
    this.focusSeeded = false
    let seconds = fallbackSeconds
    const range = this.profile?.blend_seconds_range
    if (range) seconds = (range[0] + range[1]) / 2
    if (this.reducedMotion) seconds = 0
    this.blendTotal = seconds
    this.blendRemaining = seconds
    this.blendFrom.copy(this.camera.position)
  }

  setDistance(distance: number): void {
    this.targetDistance = distance
  }

  addLook(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.0045 * this.sensitivity
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + deltaY * 0.003 * this.sensitivity,
      ON_FOOT.minPitch,
      ON_FOOT.maxPitch,
    )
  }

  /** Richtung, in die die Kamera schaut - Basis der Bewegungsrichtung. */
  getPlanarBasis(forward: THREE.Vector3, right: THREE.Vector3): void {
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize()
    right.set(forward.z, 0, -forward.x).normalize()
  }

  update(delta: number, target: THREE.Vector3, height = ON_FOOT.height): void {
    const focusY = target.y + height
    if (!this.focusSeeded) {
      this.dampedFocusY = focusY
      this.focusSeeded = true
    }
    // horizon_damping (cam_vehicle_water): Wellengang und Tauchfahrt sollen den
    // Blickpunkt nicht mitnicken lassen - der Horizont bleibt ruhig.
    if (this.horizonDamped && !this.reducedMotion) {
      this.dampedFocusY += (focusY - this.dampedFocusY) * Math.min(1, delta * HORIZON_DAMPING)
    } else {
      this.dampedFocusY = focusY
    }
    this.focus.set(target.x, this.dampedFocusY, target.z)
    this.distance += (this.targetDistance - this.distance) * Math.min(1, delta * 6)

    const cosPitch = Math.cos(this.pitch)
    this.desired.set(
      this.focus.x + Math.sin(this.yaw) * cosPitch * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance + 0.4,
      this.focus.z + Math.cos(this.yaw) * cosPitch * this.distance,
    )

    // Kollisionsausweichen: der Blick auf Fynnox darf nie in einer Wand enden.
    const direction = this.desired.clone().sub(this.focus)
    const length = direction.length()
    direction.divideScalar(length)
    const hit = this.collision.rayHitDistance(this.focus, direction, length)
    if (hit < length) this.desired.copy(this.focus).addScaledVector(direction, Math.max(1.1, hit - 0.25))

    if (!this.initialised) {
      this.smoothed.copy(this.desired)
      this.initialised = true
    } else {
      const lerp = this.reducedMotion ? 1 : Math.min(1, delta * 12)
      this.smoothed.lerp(this.desired, lerp)
    }

    if (this.blendRemaining > 0 && this.blendTotal > 0) {
      this.blendRemaining = Math.max(0, this.blendRemaining - delta)
      const t = 1 - this.blendRemaining / this.blendTotal
      const eased = t * t * (3 - 2 * t)
      this.camera.position.lerpVectors(this.blendFrom, this.smoothed, eased)
    } else {
      this.camera.position.copy(this.smoothed)
    }

    // roll_compensation (cam_vehicle_air): die Kamera nimmt die Rollbewegung des
    // Flugzeugs nur als Rest mit, statt den Horizont mitzukippen. Ohne die
    // Eigenschaft folgt sie ihr ganz; ohne Fahrzeug bleibt der Winkel 0 und die
    // Kamera verhaelt sich wie bisher.
    const targetRoll = this.rollCompensated ? this.vehicleRoll * RESIDUAL_ROLL : this.vehicleRoll
    this.roll += (targetRoll - this.roll) * (this.reducedMotion ? 1 : Math.min(1, delta * 5))
    if (Math.abs(this.roll) < 0.0005) {
      this.roll = 0
      this.camera.up.set(0, 1, 0)
    } else {
      this.viewDirection.copy(this.focus).sub(this.camera.position).normalize()
      this.camera.up.set(0, 1, 0).applyAxisAngle(this.viewDirection, this.roll)
    }
    this.camera.lookAt(this.focus)
  }

  resize(width: number, height: number): void {
    const aspect = width / height
    this.camera.aspect = aspect
    // Im Hochformat wuerde ein festes vertikales Sichtfeld den horizontalen
    // Ausschnitt auf rund 29 Grad zusammenziehen - die Stadt waere nicht mehr
    // lesbar. Deshalb wird das vertikale Feld aus einem Zielwert fuer das
    // horizontale abgeleitet und begrenzt.
    const targetHorizontal = THREE.MathUtils.degToRad(74)
    const vertical = 2 * Math.atan(Math.tan(targetHorizontal / 2) / Math.max(0.3, aspect))
    this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vertical), 52, 82)
    this.camera.updateProjectionMatrix()
  }
}
