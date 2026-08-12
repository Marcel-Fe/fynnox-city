import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COLORS, mat } from '../core/Palette'
import type { AnimationStateId } from '../contracts/types'

const FUR = COLORS.fynnoxFur
const FUR_DARK = COLORS.fynnoxFurDark
const CREAM = COLORS.fynnoxBelly
const JACKET = COLORS.fynnoxJacket
const JACKET_DARK = COLORS.fynnoxJacketDark
const SHIRT = COLORS.fynnoxShirt
const SCARF = COLORS.fynnoxScarf
const PANTS = COLORS.fynnoxPants
const LEATHER = COLORS.fynnoxLeather
const BRASS = COLORS.fynnoxBrass
const KNIT = COLORS.fynnoxKnit
const EYE = COLORS.fynnoxEye
const DARK = COLORS.fynnoxDark
const GLASS = COLORS.fynnoxGlass

interface Placement {
  pos?: [number, number, number]
  rot?: [number, number, number]
  scale?: [number, number, number]
}

/**
 * Sammelt die Einzelteile eines Koerperteils und verschmilzt sie pro Farbe.
 * Innerhalb einer Gruppe bewegt sich nichts gegeneinander, deshalb kostet ein
 * detaillierteres Modell hier keine zusaetzlichen Draw-Calls - im Gegenteil.
 */
class PartBatcher {
  private readonly batches = new Map<string, THREE.BufferGeometry[]>()

  add(geometry: THREE.BufferGeometry, color: string, place: Placement = {}): void {
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    if (place.rot) quaternion.setFromEuler(new THREE.Euler(place.rot[0], place.rot[1], place.rot[2]))
    matrix.compose(
      new THREE.Vector3(...(place.pos ?? [0, 0, 0])),
      quaternion,
      new THREE.Vector3(...(place.scale ?? [1, 1, 1])),
    )
    geometry.applyMatrix4(matrix)
    const batch = this.batches.get(color)
    if (batch) batch.push(geometry)
    else this.batches.set(color, [geometry])
  }

  finish(parent: THREE.Object3D): void {
    for (const [color, geometries] of this.batches) {
      const merged = mergeGeometries(geometries, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat(color))
      mesh.castShadow = true
      parent.add(mesh)
      for (const geometry of geometries) geometry.dispose()
    }
    this.batches.clear()
  }
}

/**
 * Proportionen aus dem Turnaround abgelesen, auf 1,5 m Koerperhoehe gerechnet:
 * Beine 44 %, Rumpf 25 %, Kopf 23 %, Ohren darueber. Entscheidend fuer die
 * Lesbarkeit ist, dass der Kopf so breit ist wie die Schultern - nicht schmaler.
 */
const HIP_Y = 0.66
const SHOULDER_Y = 0.34
const SHOULDER_X = 0.2
const HEAD_Y = 0.56

const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const capsule = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 3, 10)
const cylinder = (rt: number, rb: number, h: number, seg = 10) =>
  new THREE.CylinderGeometry(rt, rb, h, seg)
const cone = (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg)
const torus = (r: number, tube: number, seg = 8, ring = 14) =>
  new THREE.TorusGeometry(r, tube, seg, ring)

/**
 * Punkt auf der lokalen Hochachse eines gedrehten Teils. Die Ohrspitze muss auf
 * der Ohrachse sitzen, nicht auf einer geschaetzten Weltposition - sonst loest
 * sie sich sichtbar vom Ohr ab.
 */
function alongLocalY(
  base: [number, number, number],
  rot: [number, number, number],
  distance: number,
): [number, number, number] {
  const offset = new THREE.Vector3(0, distance, 0).applyEuler(
    new THREE.Euler(rot[0], rot[1], rot[2]),
  )
  return [base[0] + offset.x, base[1] + offset.y, base[2] + offset.z]
}

/**
 * Fynnox nach dem Turnaround des Pakets (03_Bildreferenzen/03_Fynnox_Turnaround).
 * Gesicht, Fellfarben, Proportionen und das Urban-Adventure-Outfit sind gesperrte
 * Designvorgaben - hier wird nichts neu erfunden, nur auf Echtzeit-Geometrie
 * heruntergebrochen: rotoranges Fell mit cremefarbener Brust und Schweifspitze,
 * Fliegerbrille auf der Stirn, blaues Halstuch, dunkelblaue Lederjacke,
 * Cargohose, Boots und der PawLink am rechten Handgelenk.
 * Koerperhoehe 1,5 m, mit Ohren rund 1,55 m.
 *
 * Die Gelenkpivots sind unveraendert gegenueber dem Graybox-Vorgaenger, damit
 * die Animationszustaende weiter passen.
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
    this.hip.position.y = HIP_Y
    this.root.add(this.hip)
    this.hip.add(this.torso)
    this.head.position.set(0, HEAD_Y, 0)
    this.torso.add(this.head)
    this.armL.position.set(-SHOULDER_X, SHOULDER_Y, 0)
    this.armR.position.set(SHOULDER_X, SHOULDER_Y, 0)
    this.torso.add(this.armL, this.armR)
    this.legL.position.set(-0.105, 0, 0)
    this.legR.position.set(0.105, 0, 0)
    this.hip.add(this.legL, this.legR)
    this.tail.position.set(0, 0.1, -0.15)
    this.hip.add(this.tail)

    this.buildTorso()
    this.buildHead()
    this.buildArm(this.armL, -1)
    this.buildArm(this.armR, 1)
    this.buildLeg(this.legL)
    this.buildLeg(this.legR)
    this.buildTail()
  }

  /** Lederjacke offen ueber cremefarbenem Shirt, Guertel mit Tasche. */
  private buildTorso(): void {
    const b = new PartBatcher()
    // Brustkorb im Shirt.
    b.add(capsule(0.13, 0.17), SHIRT, { pos: [0, 0.21, 0.01], scale: [1, 1, 0.84] })
    // Jacke als Schale, vorn offen: zwei Haelften statt eines geschlossenen Rumpfs.
    for (const side of [-1, 1]) {
      b.add(capsule(0.142, 0.16), JACKET, {
        pos: [side * 0.048, 0.22, -0.01],
        scale: [0.78, 1, 0.88],
      })
      // Revers, das nach aussen faellt.
      b.add(box(0.06, 0.17, 0.028), JACKET_DARK, {
        pos: [side * 0.088, 0.33, 0.1],
        rot: [0.25, side * 0.5, 0],
      })
      // Reissverschlussband in Messing entlang der Jackenkante.
      b.add(box(0.012, 0.26, 0.012), BRASS, { pos: [side * 0.04, 0.24, 0.118] })
    }
    // Kragen.
    b.add(torus(0.108, 0.026, 6, 12), JACKET_DARK, { pos: [0, 0.34, 0], rot: [Math.PI / 2, 0, 0] })
    // Pfotenlogo auf dem Shirt.
    b.add(cylinder(0.03, 0.03, 0.012, 10), COLORS.navy, {
      pos: [0, 0.25, 0.125],
      rot: [Math.PI / 2, 0, 0],
    })
    b.add(cylinder(0.018, 0.018, 0.014, 8), COLORS.gold, {
      pos: [0, 0.25, 0.13],
      rot: [Math.PI / 2, 0, 0],
    })
    // Guertel mit Schnalle und Werkzeugtasche.
    b.add(cylinder(0.138, 0.138, 0.048, 12), LEATHER, { pos: [0, 0.06, 0] })
    b.add(box(0.058, 0.05, 0.03), BRASS, { pos: [0, 0.06, 0.132] })
    b.add(box(0.085, 0.1, 0.055), LEATHER, { pos: [0.11, 0.045, 0.09] })
    // Hals - kurz, der Kopf sitzt fast auf den Schultern.
    b.add(cylinder(0.065, 0.08, 0.1, 10), FUR, { pos: [0, 0.39, 0] })
    // Halstuch: sitzt sichtbar ueber dem Jackenkragen, mit herabhaengender Spitze.
    b.add(cylinder(0.098, 0.124, 0.1, 12), SCARF, { pos: [0, 0.405, 0.005] })
    b.add(cone(0.078, 0.13, 6), SCARF, { pos: [0, 0.35, 0.082], rot: [Math.PI, 0, 0] })
    b.finish(this.torso)
  }

  /** Kopf mit runder Schnauze, grossen blauen Augen und Fliegerbrille. */
  private buildHead(): void {
    const b = new PartBatcher()
    b.add(sphere(0.2, 12, 10), FUR, { scale: [1, 0.98, 1.02] })
    // Wangenruff schliesst an die Schnauze an und bleibt innerhalb der
    // Kopfsilhouette - sonst liest er wie ein Roter Panda statt wie ein Fuchs.
    for (const side of [-1, 1]) {
      b.add(sphere(0.062, 8, 6), CREAM, {
        pos: [side * 0.112, -0.093, 0.093],
        scale: [0.95, 0.9, 1],
      })
    }
    // Schnauze und Nase - schmal und weit vorn.
    b.add(sphere(0.085, 10, 8), CREAM, { pos: [0, -0.075, 0.175], scale: [1.05, 0.82, 1.3] })
    b.add(sphere(0.034, 8, 6), DARK, { pos: [0, -0.055, 0.288], scale: [1.2, 0.9, 1] })
    b.add(box(0.022, 0.038, 0.022), DARK, { pos: [0, -0.102, 0.278] })

    for (const side of [-1, 1]) {
      // Auge: Sklera, blaue Iris, Pupille, Glanzpunkt.
      b.add(sphere(0.063, 10, 8), CREAM, { pos: [side * 0.094, 0.04, 0.143] })
      b.add(sphere(0.043, 10, 8), EYE, { pos: [side * 0.103, 0.04, 0.186] })
      b.add(sphere(0.022, 8, 6), DARK, { pos: [side * 0.106, 0.038, 0.214] })
      b.add(sphere(0.012, 6, 5), '#FFFFFF', { pos: [side * 0.082, 0.066, 0.219] })
      // Braue.
      b.add(box(0.071, 0.019, 0.023), FUR_DARK, {
        pos: [side * 0.1, 0.112, 0.166],
        rot: [0, 0, side * -0.22],
      })
      // Ohr: gross und aufrecht, aussen Fell, innen creme, dunkle Spitze.
      // Die Spitze wird auf der Ohrachse berechnet, nicht geschaetzt.
      const earBase: [number, number, number] = [side * 0.115, 0.215, -0.01]
      const earRot: [number, number, number] = [-0.1, 0, -side * 0.16]
      b.add(cone(0.088, 0.3, 7), FUR, { pos: earBase, rot: earRot, scale: [1, 1, 0.5] })
      b.add(cone(0.054, 0.2, 6), CREAM, {
        pos: alongLocalY(earBase, earRot, -0.015),
        rot: earRot,
        scale: [1, 1, 0.42],
      })
      b.add(cone(0.04, 0.075, 6), FUR_DARK, {
        pos: alongLocalY(earBase, earRot, 0.113),
        rot: earRot,
        scale: [1, 1, 0.5],
      })
    }
    // Stirnbueschel zwischen den Ohren.
    b.add(cone(0.055, 0.11, 6), FUR, { pos: [0, 0.205, 0.04], rot: [-0.4, 0, 0] })

    // Fliegerbrille auf der Stirn: Band um den Kopf, zwei Messingfassungen.
    b.add(torus(0.198, 0.017, 6, 16), LEATHER, { pos: [0, 0.118, 0], rot: [1.42, 0, 0] })
    for (const side of [-1, 1]) {
      b.add(torus(0.058, 0.019, 6, 12), BRASS, {
        pos: [side * 0.083, 0.152, 0.126],
        rot: [0.5, side * 0.22, 0],
      })
      b.add(cylinder(0.049, 0.049, 0.016, 12), GLASS, {
        pos: [side * 0.083, 0.152, 0.13],
        rot: [Math.PI / 2 + 0.5, 0, side * 0.22],
      })
    }
    b.finish(this.head)
  }

  /** Jackenaermel, Strickbund, Fellunterarm, Lederhandschuh. */
  private buildArm(group: THREE.Group, side: number): void {
    const b = new PartBatcher()
    b.add(capsule(0.052, 0.14), JACKET, { pos: [0, -0.12, 0] })
    b.add(box(0.048, 0.045, 0.045), JACKET_DARK, { pos: [side * 0.035, -0.015, 0] })
    b.add(cylinder(0.048, 0.045, 0.05, 10), KNIT, { pos: [0, -0.218, 0] })
    b.add(capsule(0.039, 0.05), FUR, { pos: [0, -0.268, 0] })
    // Handschuh mit freien Fingerspitzen.
    b.add(sphere(0.057, 8, 6), LEATHER, { pos: [0, -0.332, 0], scale: [0.85, 1, 1] })
    for (const finger of [-1, 0, 1]) {
      b.add(capsule(0.013, 0.026), FUR, { pos: [finger * 0.023, -0.378, 0.011] })
    }
    // PawLink: gewaltfreies Signaturwerkzeug am rechten Handgelenk.
    if (side > 0) {
      b.add(box(0.065, 0.04, 0.065), COLORS.navy, { pos: [0, -0.285, 0] })
      b.add(box(0.044, 0.012, 0.044), COLORS.cyan, { pos: [0, -0.285, 0.032] })
    }
    b.finish(group)
  }

  /** Cargohose mit Taschen, Strickbund, Boots mit heller Sohle. */
  private buildLeg(group: THREE.Group): void {
    const b = new PartBatcher()
    b.add(capsule(0.074, 0.3), PANTS, { pos: [0, -0.24, 0] })
    b.add(box(0.05, 0.07, 0.048), PANTS, { pos: [0.066, -0.26, 0.028] })
    b.add(box(0.045, 0.014, 0.043), COLORS.navyMid, { pos: [0.068, -0.228, 0.031] })
    b.add(cylinder(0.068, 0.062, 0.055, 10), KNIT, { pos: [0, -0.5, 0] })
    b.add(cylinder(0.047, 0.047, 0.045, 8), FUR, { pos: [0, -0.542, 0] })
    // Boot: Schaft, Zunge, Sohle.
    b.add(box(0.128, 0.11, 0.14), JACKET, { pos: [0, -0.59, 0.0] })
    b.add(box(0.108, 0.085, 0.11), LEATHER, { pos: [0, -0.6, 0.085] })
    b.add(box(0.122, 0.07, 0.095), JACKET, { pos: [0, -0.615, 0.128] })
    b.add(box(0.142, 0.045, 0.255), CREAM, { pos: [0, -0.6375, 0.05] })
    b.add(box(0.038, 0.048, 0.012), CREAM, { pos: [0.052, -0.588, 0.072], rot: [0, 0, 0.4] })
    b.finish(group)
  }

  /** Buschiger Schweif mit cremefarbener Spitze - schwingt in jedem Zustand. */
  private buildTail(): void {
    const b = new PartBatcher()
    // Rute: dick am Ansatz, nach hinten unten schwingend, cremefarbene Spitze.
    b.add(sphere(0.115, 10, 8), FUR, { pos: [0, -0.02, -0.1], scale: [1, 1, 1.1] })
    b.add(sphere(0.107, 10, 8), FUR, { pos: [0, -0.085, -0.215], scale: [1, 1, 1.1] })
    b.add(sphere(0.09, 10, 8), FUR, { pos: [0, -0.175, -0.312], scale: [1, 1, 1.05] })
    b.add(sphere(0.072, 10, 8), CREAM, { pos: [0, -0.265, -0.385] })
    b.add(sphere(0.05, 8, 6), CREAM, { pos: [0, -0.338, -0.432] })
    b.finish(this.tail)
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
    this.armL.rotation.set(0, 0, 0)
    this.armR.rotation.set(0, 0, 0)
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
        this.hip.position.y = HIP_Y + Math.abs(Math.sin(this.clock * stride)) * 0.03
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
        this.hip.position.y = HIP_Y - 0.12
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
        this.hip.position.y = HIP_Y - 0.1
        break
      }
      case 'fox_wave': {
        this.armR.rotation.x = -2.2
        this.armR.rotation.z = Math.sin(this.clock * 8) * 0.3
        break
      }
      default: {
        this.hip.position.y = HIP_Y + Math.sin(this.clock * 1.8) * 0.012
        this.armL.rotation.x = Math.sin(this.clock * 1.8) * 0.05
        this.armR.rotation.x = -Math.sin(this.clock * 1.8) * 0.05
      }
    }

    // Schweif als Sekundaerbewegung - laeuft in jedem Zustand weiter.
    this.tail.rotation.y = Math.sin(this.clock * 2.2) * 0.28
    this.tail.rotation.x = -0.35 + Math.sin(this.clock * 3.1) * 0.12 - planarSpeed * 0.03
  }
}
