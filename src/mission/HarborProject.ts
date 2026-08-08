import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import type { Collider, CollisionWorld } from '../core/CollisionWorld'
import { worldProject } from '../contracts/manifests'

interface StateBundle {
  id: string
  group: THREE.Group
  colliders: Collider[]
  lights: THREE.PointLight[]
  /** Aktivitaetspunkte, die erst ab diesem Zustand belebt werden. */
  activity: boolean
}

/**
 * Stadtprojekt "project_harbor_terrace" aus PROGRAMMIER_ASSET_MANIFEST_v1_5.json.
 * Ein Zustandswechsel schaltet Mesh, Collider, Licht und NPC-Aktivitaet in
 * einer Transaktion - nie nur die Optik.
 */
export class HarborProject {
  readonly id = 'project_harbor_terrace'
  private readonly bundles: StateBundle[] = []
  private index = 0

  constructor(
    scene: THREE.Scene,
    private readonly collision: CollisionWorld,
    origin: THREE.Vector3,
  ) {
    const project = worldProject(this.id)
    for (const stateId of project.states) {
      const group = new THREE.Group()
      const colliders: Collider[] = []
      const lights: THREE.PointLight[] = []
      this.buildState(stateId, group, colliders, lights, origin)
      group.visible = false
      scene.add(group)
      this.bundles.push({
        id: stateId,
        group,
        colliders,
        lights,
        activity: stateId === 'state_3_complete',
      })
    }
    this.apply(0)
  }

  get stateId(): string {
    return this.bundles[this.index].id
  }

  get stage(): number {
    return this.index
  }

  get stageCount(): number {
    return this.bundles.length
  }

  get isComplete(): boolean {
    return this.index === this.bundles.length - 1
  }

  /** True, wenn die Terrasse belebt ist - NPCs setzen sich erst dann hin. */
  get activityEnabled(): boolean {
    return this.bundles[this.index].activity
  }

  advance(): boolean {
    if (this.isComplete) return false
    this.apply(this.index + 1)
    return true
  }

  setStage(stage: number): void {
    this.apply(THREE.MathUtils.clamp(stage, 0, this.bundles.length - 1))
  }

  private apply(index: number): void {
    this.index = index
    this.bundles.forEach((bundle, i) => {
      const active = i === index
      bundle.group.visible = active
      for (const collider of bundle.colliders) collider.enabled = active
      for (const light of bundle.lights) light.visible = active
    })
    this.collision.markDirty()
  }

  private buildState(
    stateId: string,
    group: THREE.Group,
    colliders: Collider[],
    lights: THREE.PointLight[],
    origin: THREE.Vector3,
  ): void {
    const add = (
      w: number,
      h: number,
      d: number,
      color: string,
      x: number,
      y: number,
      z: number,
      collide = true,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
      mesh.position.set(origin.x + x, y + h / 2, origin.z + z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
      if (collide) {
        const box = new THREE.Box3().setFromObject(mesh)
        colliders.push(this.collision.addStatic(box, 'project'))
      }
    }

    if (stateId === 'state_0_before') {
      // Gesperrter Bereich: Bauzaun, Schutt, kein Licht.
      for (let i = -4; i <= 4; i++) {
        add(0.12, 1.6, 2.0, COLORS.metal, i * 1.2, 0.15, -2.4, i % 2 === 0)
      }
      add(3.0, 0.7, 2.0, COLORS.concrete, -3, 0.15, 1, true)
      add(2.2, 0.5, 1.6, COLORS.asphalt, 3, 0.15, 0.6, true)
      add(1.0, 1.2, 1.0, COLORS.coral, 5.5, 0.15, -1, true)
      return
    }

    if (stateId === 'state_1_cleanup') {
      // Aufgeraeumt, aber noch offene Flaeche.
      add(18, 0.05, 5.4, COLORS.concrete, 0, 0.15, 0, false)
      for (const x of [-7, 7]) add(0.6, 1.2, 0.6, COLORS.gold, x, 0.15, -2, true)
      return
    }

    if (stateId === 'state_2_build') {
      // Geruest und halbfertiges Deck.
      add(18, 0.05, 5.4, COLORS.concrete, 0, 0.15, 0, false)
      add(9, 0.2, 5.0, COLORS.wood, -4, 0.2, 0, true)
      for (const x of [-8, -4, 0, 4]) {
        add(0.14, 3.2, 0.14, COLORS.metal, x, 0.35, -2.2, false)
        add(0.14, 3.2, 0.14, COLORS.metal, x, 0.35, 2.2, false)
      }
      add(9, 0.1, 4.6, COLORS.metal, -4, 3.5, 0, false)
      return
    }

    // state_3_complete: nutzbare Hafenterrasse mit Licht, Sitzplaetzen und Gruen.
    add(18, 0.22, 5.4, COLORS.wood, 0, 0.15, 0, true)
    for (const x of [-6, -2, 2, 6]) {
      add(1.8, 0.45, 0.6, COLORS.gold, x, 0.37, 1.4, true)
      add(1.8, 0.5, 0.12, COLORS.gold, x, 0.82, 1.7, false)
      add(1.4, 0.6, 1.4, COLORS.concrete, x + 1.9, 0.37, -1.6, true)
      add(1.2, 1.3, 1.2, COLORS.foliage, x + 1.9, 0.97, -1.6, false)
    }
    for (const x of [-7, 0, 7]) {
      add(0.16, 3.0, 0.16, COLORS.metal, x, 0.37, -2.3, false)
      add(0.5, 0.24, 0.5, COLORS.gold, x, 3.37, -2.3, false)
      const light = new THREE.PointLight('#FFD9A0', 1.6, 14, 2)
      light.position.set(origin.x + x, 3.4, origin.z - 2.3)
      group.add(light)
      lights.push(light)
    }
  }
}
