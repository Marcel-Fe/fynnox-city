import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import type { AnimationStateId } from '../contracts/types'

const FUR = COLORS.fynnoxFur
const BELLY = COLORS.fynnoxBelly
const OUTFIT = COLORS.fynnoxOutfit

function part(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: string,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

/**
 * Graybox-Proxy fuer Fynnox. Gesicht, Fellfarben, Proportionen und das
 * Urban-Adventure-Outfit sind laut Paket gesperrte Designvorgaben - hier
 * wird nichts neu erfunden, nur vereinfacht dargestellt:
 * orangeroter Fuchs, cremefarbene Brust, teal Outfit, PawLink am Handgelenk.
 * Gesamthoehe 1,5 m (Tuer 2,2 m, Kletterkante 0,8-1,4 m bleiben stimmig).
 */
export class FynnoxModel {
  readonly root = new THREE.Group()
  private readonly hip = new THREE.Group()
  private readonly torso = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly armL = new THREE.Group()
  private readonly armR = new THREE.Group()
  private readonly legL = new THREE.Group()
  private readonly legR = new THREE.Group()
  private readonly tail = new THREE.Group()
  private state: AnimationStateId = 'fox_idle'
  private clock = 0
  private blend = 0

  constructor() {
    this.hip.position.y = 0.72
    this.root.add(this.hip)

    this.hip.add(this.torso)
    part(this.torso, 0.44, 0.5, 0.3, OUTFIT, 0, 0.25)
    part(this.torso, 0.3, 0.3, 0.06, BELLY, 0, 0.26, 0.16)
    // Guertel mit PawLink-Halterung.
    part(this.torso, 0.46, 0.08, 0.32, COLORS.navy, 0, 0.03)
    part(this.torso, 0.1, 0.06, 0.06, COLORS.cyan, 0.15, 0.03, 0.17)
    // Rucksackrolle (Urban-Adventure-Outfit).
    part(this.torso, 0.3, 0.22, 0.14, COLORS.gold, 0, 0.34, -0.2)

    this.head.position.set(0, 0.55, 0)
    this.torso.add(this.head)
    part(this.head, 0.34, 0.3, 0.32, FUR)
    part(this.head, 0.2, 0.14, 0.16, BELLY, 0, -0.04, 0.22) // Schnauze
    part(this.head, 0.06, 0.05, 0.05, COLORS.navy, 0, -0.02, 0.3) // Nase
    part(this.head, 0.05, 0.05, 0.03, COLORS.navy, -0.09, 0.05, 0.17)
    part(this.head, 0.05, 0.05, 0.03, COLORS.navy, 0.09, 0.05, 0.17)
    const earL = part(this.head, 0.12, 0.18, 0.05, FUR, -0.11, 0.2, -0.02)
    const earR = part(this.head, 0.12, 0.18, 0.05, FUR, 0.11, 0.2, -0.02)
    earL.rotation.z = 0.25
    earR.rotation.z = -0.25

    this.armL.position.set(-0.27, 0.42, 0)
    this.armR.position.set(0.27, 0.42, 0)
    this.torso.add(this.armL, this.armR)
    part(this.armL, 0.12, 0.36, 0.12, OUTFIT, 0, -0.18)
    part(this.armR, 0.12, 0.36, 0.12, OUTFIT, 0, -0.18)
    part(this.armL, 0.13, 0.1, 0.13, FUR, 0, -0.4)
    part(this.armR, 0.13, 0.1, 0.13, FUR, 0, -0.4)
    // PawLink am rechten Handgelenk: Signaturwerkzeug, gewaltfrei.
    part(this.armR, 0.15, 0.07, 0.15, COLORS.cyan, 0, -0.33)

    this.legL.position.set(-0.13, 0, 0)
    this.legR.position.set(0.13, 0, 0)
    this.hip.add(this.legL, this.legR)
    part(this.legL, 0.16, 0.55, 0.16, COLORS.navyMid, 0, -0.28)
    part(this.legR, 0.16, 0.55, 0.16, COLORS.navyMid, 0, -0.28)
    part(this.legL, 0.18, 0.12, 0.28, COLORS.coral, 0, -0.62, 0.05)
    part(this.legR, 0.18, 0.12, 0.28, COLORS.coral, 0, -0.62, 0.05)

    this.tail.position.set(0, 0.1, -0.16)
    this.hip.add(this.tail)
    part(this.tail, 0.18, 0.18, 0.26, FUR, 0, -0.02, -0.12)
    part(this.tail, 0.16, 0.16, 0.24, FUR, 0, -0.06, -0.34)
    part(this.tail, 0.14, 0.14, 0.18, BELLY, 0, -0.12, -0.52)
  }

  setState(state: AnimationStateId): void {
    if (this.state === state) return
    this.state = state
    this.blend = 0
  }

  get currentState(): AnimationStateId {
    return this.state
  }

  update(delta: number, planarSpeed: number): void {
    this.clock += delta
    this.blend = Math.min(1, this.blend + delta * 6)

    const stride = this.state === 'fox_sprint' ? 12 : 8
    const swing = Math.sin(this.clock * stride) * Math.min(1, planarSpeed / 3)

    // Grundhaltung.
    this.torso.rotation.x = 0
    this.torso.position.y = 0
    this.armL.rotation.x = 0
    this.armR.rotation.x = 0
    this.legL.rotation.x = 0
    this.legR.rotation.x = 0
    this.head.rotation.x = 0

    switch (this.state) {
      case 'fox_walk':
      case 'fox_run_start':
      case 'fox_sprint': {
        this.legL.rotation.x = swing
        this.legR.rotation.x = -swing
        this.armL.rotation.x = -swing * 0.8
        this.armR.rotation.x = swing * 0.8
        this.torso.rotation.x = Math.min(0.18, planarSpeed * 0.035)
        this.hip.position.y = 0.72 + Math.abs(Math.sin(this.clock * stride)) * 0.03
        break
      }
      case 'fox_jump_start':
      case 'fox_jump_air': {
        this.legL.rotation.x = -0.7
        this.legR.rotation.x = -0.3
        this.armL.rotation.x = -1.6
        this.armR.rotation.x = -1.4
        break
      }
      case 'fox_land_soft': {
        this.hip.position.y = 0.6
        this.legL.rotation.x = 0.35
        this.legR.rotation.x = 0.35
        break
      }
      case 'fox_ledge_grab':
      case 'fox_climb_up': {
        this.armL.rotation.x = -2.4
        this.armR.rotation.x = -2.4
        this.legL.rotation.x = 0.5
        this.legR.rotation.x = 0.2
        break
      }
      case 'fox_scan': {
        this.armR.rotation.x = -1.5
        this.armL.rotation.x = -0.4
        this.head.rotation.x = -0.15
        break
      }
      case 'fox_pickup':
      case 'fox_press_button':
      case 'fox_open_door': {
        this.armR.rotation.x = -1.1
        this.torso.rotation.x = 0.25
        break
      }
      case 'fox_drive_vehicle':
      case 'fox_enter_vehicle': {
        this.legL.rotation.x = -1.4
        this.legR.rotation.x = -1.4
        this.armL.rotation.x = -1.1
        this.armR.rotation.x = -1.1
        this.hip.position.y = 0.62
        break
      }
      case 'fox_wave': {
        this.armR.rotation.x = -2.2
        this.armR.rotation.z = Math.sin(this.clock * 8) * 0.3
        break
      }
      default: {
        this.hip.position.y = 0.72 + Math.sin(this.clock * 1.8) * 0.012
        this.armL.rotation.x = Math.sin(this.clock * 1.8) * 0.05
        this.armR.rotation.x = -Math.sin(this.clock * 1.8) * 0.05
      }
    }

    // Schweif als Sekundaerbewegung - laeuft in jedem Zustand weiter.
    this.tail.rotation.y = Math.sin(this.clock * 2.2) * 0.28
    this.tail.rotation.x = -0.35 + Math.sin(this.clock * 3.1) * 0.12 - planarSpeed * 0.03
  }
}
