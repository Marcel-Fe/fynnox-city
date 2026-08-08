import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
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

const BODY_COLORS = ['#C96F4B', '#7F8FA6', '#B4894F', '#6FA98B', '#D2A15C', '#8C6FA9']

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
    const color = BODY_COLORS[index % BODY_COLORS.length]
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.26), mat(color))
    torso.position.y = 1.0
    torso.castShadow = true
    root.add(torso)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.28), mat(COLORS.fynnoxBelly))
    head.position.y = 1.42
    root.add(head)

    const legs: THREE.Group[] = []
    for (const dx of [-0.11, 0.11]) {
      const leg = new THREE.Group()
      leg.position.set(dx, 0.75, 0)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.75, 0.15), mat(COLORS.navyMid))
      mesh.position.y = -0.375
      leg.add(mesh)
      root.add(leg)
      legs.push(leg)
    }
    const arms: THREE.Group[] = []
    for (const dx of [-0.26, 0.26]) {
      const arm = new THREE.Group()
      arm.position.set(dx, 1.2, 0)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.44, 0.11), mat(color))
      mesh.position.y = -0.22
      arm.add(mesh)
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
        npc.legs[0].rotation.x = -1.5
        npc.legs[1].rotation.x = -1.5
        npc.root.position.y = (npc.seat?.y ?? 0) + 0.05
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
