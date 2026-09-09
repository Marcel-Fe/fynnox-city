import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import { PartBatcher, alongLocalY, box, capsule, cone, cylinder, sphere } from '../core/Shapes'
import type { AmbientStateId } from '../contracts/types'

interface NPC {
  root: THREE.Group
  legs: THREE.Group[]
  arms: THREE.Group[]
  state: AmbientStateId
  route: THREE.Vector3[]
  routeIndex: number
  seat: THREE.Vector3 | null
  phase: number
  speed: number
  /** Zaehler fuer das Animations-Culling im Mittelbereich. */
  tick: number
  needsProject: boolean
}

const NEAR_RING = 26
const MID_RING = 62

/**
 * Hoehe des Hueftgelenks ueber dem Wurzelpunkt der Figur.
 *
 * Die Wurzel liegt auf Fusshoehe - im Stehen ist sie damit die Bodenhoehe. Im
 * Sitzen ist sie das gerade nicht: dort liegt die Sitzflaeche unter der HUEFTE,
 * nicht unter den Fuessen. Wer die Wurzel auf die Sitzhoehe setzt, hebt die
 * ganze Figur um diese Huefthoehe an; bei 0,75 m sitzt sie dann auf der Lehne.
 */
const HIP_Y = 0.75
/** Oberschenkel liegt auf, nicht in der Sitzflaeche. */
const THIGH_RADIUS = 0.062

/**
 * Aussehen einer Ambient-Figur. Alle laufen durch dieselbe Bauroutine; was sie
 * unterscheidet, sind Farben und drei Formmerkmale. Mira, Boro und Tavi stammen
 * aus 03_Bildreferenzen/12_Charakter_Turnarounds und sind benannte Figuren des
 * Pakets - ihre Farben sind abgelesen, nicht erfunden.
 */
interface NPCLook {
  fur: string
  cream: string
  jacket: string
  accent: string
  pants: string
  shoe: string
  /** Ohrform: spitz wie beim Fuchs, rund wie beim Baeren, klein wie beim Otter. */
  ear: 'pointed' | 'round' | 'small'
  /** Schweif: buschig geringelt, schlank, oder keiner. */
  tail: 'bushy' | 'slim' | 'none'
  /** Koerperfuelle. Boro ist deutlich breiter als Tavi. */
  bulk: number
  /** Umhaengetasche wie in Tavis Turnaround. */
  bag?: boolean
  /**
   * Kopfbedeckung und Schal - nur fuer die namenlosen Stadtbewohner.
   *
   * Mira, Boro und Tavi stammen aus 12_Charakter_Turnarounds und tragen dort
   * keine; wer ihnen eine aufsetzt, erfindet an einer gesperrten Designvorgabe
   * herum. Bei den uebrigen Figuren ist genau das der Zweck: eine Silhouette,
   * die sich aus zwanzig Metern von der daneben unterscheidet.
   */
  hat?: 'cap' | 'beanie'
  scarf?: string
}

const LOOKS: NPCLook[] = [
  // Mira - Rotpanda-Mechanikerin: salbeigruene Jacke, gelbes Shirt, Ringelschweif.
  {
    fur: COLORS.miraFur,
    cream: COLORS.miraCream,
    jacket: COLORS.miraJacket,
    accent: COLORS.miraShirt,
    pants: COLORS.miraPants,
    shoe: COLORS.miraCream,
    ear: 'pointed',
    tail: 'bushy',
    bulk: 0.95,
  },
  // Boro - Baer: dunkelblaue Jeansjacke, gruenes Shirt, khakifarbene Hose.
  {
    fur: COLORS.boroFur,
    cream: COLORS.boroFurDark,
    jacket: COLORS.boroJacket,
    accent: COLORS.boroShirt,
    pants: COLORS.boroPants,
    shoe: COLORS.boroJacket,
    ear: 'round',
    tail: 'none',
    bulk: 1.28,
  },
  // Tavi - Otter: blaue Lederjacke, weisses Shirt, orange Bauchtasche.
  {
    fur: COLORS.taviFur,
    cream: COLORS.taviCream,
    jacket: COLORS.taviJacket,
    accent: COLORS.taviBag,
    pants: COLORS.taviPants,
    shoe: COLORS.taviJacket,
    ear: 'small',
    tail: 'slim',
    bulk: 0.9,
    bag: true,
  },
  // Weitere Stadtbewohner: dieselbe Figur, andere Farbstellung.
  {
    fur: '#B4894F',
    cream: '#F2E2C6',
    jacket: '#6FA98B',
    accent: '#E8C05A',
    pants: '#3C4249',
    shoe: '#3C4249',
    ear: 'round',
    tail: 'slim',
    bulk: 1.05,
    hat: 'cap',
  },
  {
    fur: '#8C7F92',
    cream: '#EFE6DC',
    jacket: '#C9634E',
    accent: '#F0DCC0',
    pants: '#43485A',
    shoe: '#43485A',
    ear: 'pointed',
    tail: 'bushy',
    bulk: 0.92,
    scarf: '#D9705C',
  },
  {
    fur: '#C98F5A',
    cream: '#F6E7CD',
    jacket: '#3D7A93',
    accent: '#E8842E',
    pants: '#4A4238',
    shoe: '#4A4238',
    ear: 'small',
    tail: 'slim',
    bulk: 1.12,
    hat: 'beanie',
  },
]

/**
 * Activity Points nach LEBENDIGE_WELT_DIALOGE_UND_MOBILE_OPTIMIERUNG.md.
 * Drei Simulationsringe: Nahbereich voll animiert, Mittelbereich mit
 * reduzierter Frequenz, Fernbereich eingefroren.
 * Wichtig: dieses System laeuft auch waehrend Dialog und Boarding weiter -
 * die Stadt friert laut Paket nie zum Standbild ein.
 */
export class AmbientNPCSystem {
  private readonly npcs: NPC[] = []
  private clock = 0

  constructor(
    scene: THREE.Scene,
    routes: THREE.Vector3[][],
    seats: THREE.Vector3[],
    projectSeats: THREE.Vector3[],
  ) {
    routes.forEach((route, index) => {
      this.npcs.push(this.create(scene, 'npc_walk', route, null, index, false))
      this.npcs.push(this.create(scene, 'npc_carry_parcel', route, null, index + 3, false))
    })
    seats.forEach((seat, index) => {
      this.npcs.push(this.create(scene, 'npc_sit_bench', [], seat, index, false))
    })
    projectSeats.forEach((seat, index) => {
      this.npcs.push(this.create(scene, 'npc_chat_pair', [], seat, index, true))
    })
    // Feste Arbeitspunkte auf dem Platz.
    this.npcs.push(this.create(scene, 'npc_sweep', [], new THREE.Vector3(2, 0.15, 8), 0, false))
    this.npcs.push(
      this.create(scene, 'npc_wait_transit', [], new THREE.Vector3(-9, 0.15, -16), 1, false),
    )
    this.npcs.push(
      this.create(scene, 'npc_water_planter', [], new THREE.Vector3(-6, 0.15, 6.4), 2, false),
    )
  }

  private create(
    scene: THREE.Scene,
    state: AmbientStateId,
    route: THREE.Vector3[],
    seat: THREE.Vector3 | null,
    index: number,
    needsProject: boolean,
  ): NPC {
    const root = new THREE.Group()
    const look = LOOKS[index % LOOKS.length]
    this.buildBody(root, look)

    const legs: THREE.Group[] = []
    for (const dx of [-0.11, 0.11]) {
      const leg = new THREE.Group()
      leg.position.set(dx, HIP_Y, 0)
      this.buildLeg(leg, look)
      root.add(leg)
      legs.push(leg)
    }
    const arms: THREE.Group[] = []
    for (const side of [-1, 1]) {
      const arm = new THREE.Group()
      arm.position.set(side * 0.24 * look.bulk, 1.2, 0)
      this.buildArm(arm, look, side)
      root.add(arm)
      arms.push(arm)
    }

    if (seat) root.position.copy(seat)
    else if (route.length > 0) root.position.copy(route[0])

    scene.add(root)
    return {
      root,
      legs,
      arms,
      state,
      route,
      routeIndex: 0,
      seat,
      phase: index * 1.7,
      speed: state === 'npc_carry_parcel' ? 1.1 : 1.5,
      tick: 0,
      needsProject,
    }
  }

  /**
   * Rumpf, Kopf und Schweif in einem Durchlauf.
   *
   * Bewusst einfacher als FynnoxModel: dort tragen achtzig Teile eine Figur,
   * die formatfuellend im Bild steht. Hier stehen bis zu siebzehn Figuren
   * gleichzeitig in der Szene, und jede Farbe kostet einen eigenen Draw-Call.
   * Deshalb fuenf Farben im Rumpfbatch, Handschuh in Jackenfarbe und ein
   * Schweif ohne eigene Gruppe.
   */
  private buildBody(root: THREE.Group, look: NPCLook): void {
    const b = new PartBatcher()
    const bulk = look.bulk
    // Rumpf in der Jacke, cremefarbenes Shirt im offenen Ausschnitt.
    b.add(capsule(0.18 * bulk, 0.3), look.jacket, { pos: [0, 1.06, 0], scale: [1, 1, 0.82] })
    b.add(capsule(0.13 * bulk, 0.22), look.accent, { pos: [0, 1.11, 0.05], scale: [1, 1, 0.7] })
    b.add(cylinder(0.17 * bulk, 0.17 * bulk, 0.07, 10), look.pants, { pos: [0, 0.83, 0] })
    /**
     * Guertel auf der Naht zwischen Jacke und Hose.
     *
     * Ohne ihn geht der Rumpf in einem Zug in die Beine ueber - im Bild eine
     * Roehre mit Farbwechsel. Eine einzige waagerechte Kante an der Taille
     * gliedert die Figur so, wie es an der Fassade das Gesimsband tut.
     */
    b.add(cylinder(0.178 * bulk, 0.178 * bulk, 0.055, 12), look.shoe, { pos: [0, 0.9, 0] })
    b.add(box(0.07, 0.055, 0.03), look.accent, { pos: [0, 0.9, 0.15 * bulk] })
    // Kragen und Hals.
    b.add(cylinder(0.09, 0.12, 0.09, 10), look.jacket, { pos: [0, 1.29, 0] })
    b.add(cylinder(0.07, 0.08, 0.09, 8), look.fur, { pos: [0, 1.34, 0] })
    if (look.scarf) {
      b.add(cylinder(0.105, 0.115, 0.1, 10), look.scarf, { pos: [0, 1.3, 0] })
      // Zipfel, nach vorn haengend.
      b.add(box(0.07, 0.2, 0.035), look.scarf, { pos: [0.05, 1.19, 0.1], rot: [0.12, 0, 0.1] })
    }

    // Kopf: Schaedel, Schnauze, Nase, Augen.
    const headY = 1.47
    b.add(sphere(0.155, 12, 10), look.fur, { pos: [0, headY, 0], scale: [1, 0.98, 1.02] })
    b.add(sphere(0.075, 10, 8), look.cream, {
      pos: [0, headY - 0.05, 0.12],
      scale: [1, 0.82, 1.25],
    })
    b.add(sphere(0.028, 8, 6), COLORS.fynnoxDark, { pos: [0, headY - 0.03, 0.2] })
    for (const side of [-1, 1]) {
      b.add(sphere(0.032, 8, 6), COLORS.fynnoxDark, {
        pos: [side * 0.068, headY + 0.035, 0.125],
      })
      // Ohr nach Tierart. Die Spitze sitzt auf der Ohrachse, nicht daneben.
      const base: [number, number, number] = [side * 0.095, headY + 0.13, -0.01]
      const rot: [number, number, number] = [-0.1, 0, -side * 0.2]
      if (look.ear === 'pointed') {
        b.add(cone(0.062, 0.2, 7), look.fur, { pos: base, rot, scale: [1, 1, 0.5] })
        b.add(cone(0.036, 0.12, 6), look.cream, {
          pos: alongLocalY(base, rot, -0.012),
          rot,
          scale: [1, 1, 0.42],
        })
      } else if (look.ear === 'round') {
        b.add(sphere(0.062, 8, 6), look.fur, { pos: [side * 0.115, headY + 0.13, -0.01], scale: [1, 1, 0.55] })
        b.add(sphere(0.036, 6, 5), look.cream, { pos: [side * 0.125, headY + 0.13, 0.01], scale: [1, 1, 0.4] })
      } else {
        b.add(sphere(0.042, 8, 6), look.fur, { pos: [side * 0.108, headY + 0.1, -0.02], scale: [1, 1, 0.5] })
      }
    }

    if (look.hat === 'cap') {
      b.add(cylinder(0.152, 0.15, 0.07, 12), look.accent, { pos: [0, headY + 0.13, 0] })
      b.add(sphere(0.15, 10, 8), look.accent, { pos: [0, headY + 0.15, 0], scale: [1, 0.5, 1] })
      // Schirm nach vorn.
      b.add(box(0.2, 0.025, 0.11), look.accent, { pos: [0, headY + 0.13, 0.15], rot: [-0.15, 0, 0] })
    } else if (look.hat === 'beanie') {
      b.add(sphere(0.165, 10, 8), look.accent, { pos: [0, headY + 0.06, 0], scale: [1, 0.85, 1] })
      b.add(cylinder(0.168, 0.168, 0.055, 12), look.pants, { pos: [0, headY + 0.09, 0] })
      b.add(sphere(0.04, 6, 5), look.pants, { pos: [0, headY + 0.22, 0] })
    }

    // Schweif - keine eigene Gruppe, er schwingt bei Ambient-Figuren nicht.
    if (look.tail === 'bushy') {
      b.add(sphere(0.085, 8, 6), look.fur, { pos: [0, 0.82, -0.19], scale: [1, 1, 1.15] })
      b.add(sphere(0.075, 8, 6), look.cream, { pos: [0, 0.7, -0.3], scale: [1, 1, 1.1] })
      b.add(sphere(0.058, 8, 6), look.fur, { pos: [0, 0.56, -0.37] })
      b.add(sphere(0.042, 6, 5), look.cream, { pos: [0, 0.45, -0.41] })
    } else if (look.tail === 'slim') {
      b.add(capsule(0.055, 0.16, 8), look.fur, { pos: [0, 0.78, -0.2], rot: [0.8, 0, 0] })
      b.add(capsule(0.038, 0.16, 8), look.fur, { pos: [0, 0.6, -0.32], rot: [1.1, 0, 0] })
      b.add(sphere(0.03, 6, 5), look.cream, { pos: [0, 0.5, -0.38] })
    }
    b.finish(root)
  }

  /** Hosenbein mit Schuh. Gleiche Farbe heisst ein Draw-Call statt zwei. */
  private buildLeg(group: THREE.Group, look: NPCLook): void {
    const b = new PartBatcher()
    b.add(capsule(0.062, 0.5), look.pants, { pos: [0, -0.31, 0] })
    b.add(box(0.115, 0.085, 0.2), look.shoe, { pos: [0, -0.7, 0.03] })
    // Sohle: die einzige Kante, an der ein Schuh als Schuh liest.
    b.add(box(0.125, 0.03, 0.21), look.cream, { pos: [0, -0.745, 0.035] })
    b.finish(group, { castShadow: false })
  }

  /** Aermel und Hand in einer Farbe - auf Ambient-Groesse liest das als Handschuh. */
  private buildArm(group: THREE.Group, look: NPCLook, side: number): void {
    const b = new PartBatcher()
    b.add(capsule(0.052, 0.32), look.jacket, { pos: [0, -0.2, 0] })
    // Aufschlag am Handgelenk - trennt Hand von Aermel, die dieselbe Farbe haben.
    b.add(cylinder(0.058, 0.058, 0.045, 8), look.accent, { pos: [0, -0.35, 0] })
    b.add(sphere(0.058, 8, 6), look.jacket, { pos: [0, -0.4, 0], scale: [0.85, 1, 1] })
    // Bauchtasche nur rechts, wie im Turnaround von Tavi.
    if (side > 0 && look.bag) {
      b.add(sphere(0.075, 8, 6), look.accent, { pos: [-0.16, -0.12, 0.14], scale: [1.3, 0.8, 0.6] })
    }
    b.finish(group, { castShadow: false })
  }

  /** NPCs auf der Hafenterrasse erscheinen erst, wenn das Projekt belebt ist. */
  setProjectActivity(active: boolean): void {
    for (const npc of this.npcs) {
      if (npc.needsProject) npc.root.visible = active
    }
  }

  update(delta: number, focus: THREE.Vector3): void {
    this.clock += delta
    for (const npc of this.npcs) {
      if (npc.needsProject && !npc.root.visible) continue
      const distance = npc.root.position.distanceTo(focus)
      if (distance > MID_RING) continue
      if (distance > NEAR_RING) {
        // Mittelbereich: nur jeden dritten Frame rechnen.
        npc.tick = (npc.tick + 1) % 3
        if (npc.tick !== 0) continue
        this.step(npc, delta * 3)
      } else {
        this.step(npc, delta)
      }
    }
  }

  private step(npc: NPC, delta: number): void {
    npc.phase += delta
    switch (npc.state) {
      case 'npc_walk':
      case 'npc_carry_parcel': {
        if (npc.route.length < 2) break
        const target = npc.route[npc.routeIndex]
        const direction = target.clone().sub(npc.root.position)
        direction.y = 0
        const distance = direction.length()
        if (distance < 0.4) {
          npc.routeIndex = (npc.routeIndex + 1) % npc.route.length
          break
        }
        direction.normalize()
        npc.root.position.addScaledVector(direction, npc.speed * delta)
        npc.root.position.y = target.y
        npc.root.rotation.y = Math.atan2(direction.x, direction.z)
        const swing = Math.sin(npc.phase * 7) * 0.5
        npc.legs[0].rotation.x = swing
        npc.legs[1].rotation.x = -swing
        if (npc.state === 'npc_carry_parcel') {
          npc.arms[0].rotation.x = -1.3
          npc.arms[1].rotation.x = -1.3
        } else {
          npc.arms[0].rotation.x = -swing * 0.7
          npc.arms[1].rotation.x = swing * 0.7
        }
        break
      }
      case 'npc_sit_bench': {
        // Das Bein ist ein starres Teil ohne Knie. Waagerecht nach vorn gedreht
        // sieht das aus wie ein umgekippter Stuhl. Die Gerade von der Huefte zum
        // Fuss einer sitzenden Figur laeuft 0,4 m nach vorn und 0,45 m nach
        // unten - also 43 Grad aus der Senkrechten. Genau die trifft dieses eine
        // Teil, und die Fuesse landen dabei auf dem Gehweg statt in der Luft.
        npc.legs[0].rotation.x = -0.75
        npc.legs[1].rotation.x = -0.75
        // Der Anker beschreibt die Sitzflaeche, und darauf gehoert die Huefte.
        npc.root.position.y = (npc.seat?.y ?? 0) + THIGH_RADIUS - HIP_Y
        npc.arms[0].rotation.x = Math.sin(npc.phase * 1.3) * 0.1
        break
      }
      case 'npc_chat_pair': {
        npc.root.rotation.y = Math.sin(npc.phase * 0.6) * 0.4
        npc.arms[1].rotation.x = -0.6 + Math.sin(npc.phase * 3) * 0.4
        break
      }
      case 'npc_sweep': {
        npc.arms[0].rotation.x = -0.9 + Math.sin(npc.phase * 4) * 0.35
        npc.arms[1].rotation.x = -0.7 + Math.sin(npc.phase * 4 + 0.6) * 0.35
        npc.root.rotation.y = Math.sin(npc.phase * 0.8) * 0.5
        break
      }
      case 'npc_water_planter': {
        npc.arms[1].rotation.x = -1.2
        npc.root.rotation.y = Math.PI + Math.sin(npc.phase * 0.5) * 0.2
        break
      }
      default: {
        npc.arms[0].rotation.x = Math.sin(npc.phase * 1.1) * 0.15
        npc.root.rotation.y += Math.sin(npc.phase * 0.4) * delta * 0.4
      }
    }
  }
}
