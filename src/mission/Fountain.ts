import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'

/**
 * Hafenbrunnen: sichtbare Auswirkung der Vertical-Slice-Mission.
 * Der Zustand wird gespeichert, damit die Veraenderung nach dem Neuladen
 * wiedergefunden wird (Abnahmekriterium des Pakets).
 */
export class Fountain {
  private readonly jets: THREE.Mesh[] = []
  private readonly light: THREE.PointLight
  private active = false
  private clock = 0

  constructor(scene: THREE.Scene, collision: CollisionWorld, origin: THREE.Vector3) {
    const group = new THREE.Group()
    group.position.copy(origin)

    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 20), mat(COLORS.concrete))
    basin.position.y = 0.3
    basin.receiveShadow = true
    group.add(basin)
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.12, 20), mat(COLORS.cyan))
    water.position.y = 0.56
    group.add(water)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 12), mat(COLORS.cream))
    column.position.y = 1.2
    group.add(column)

    for (let i = 0; i < 6; i++) {
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.02, 1.6, 6),
        new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0 }),
      )
      const angle = (i / 6) * Math.PI * 2
      jet.position.set(Math.cos(angle) * 0.6, 2.2, Math.sin(angle) * 0.6)
      jet.rotation.z = Math.cos(angle) * 0.35
      jet.rotation.x = -Math.sin(angle) * 0.35
      group.add(jet)
      this.jets.push(jet)
    }

    this.light = new THREE.PointLight('#9FE8F5', 0, 12, 2)
    this.light.position.set(0, 2.2, 0)
    group.add(this.light)

    scene.add(group)
    collision.addStatic(
      new THREE.Box3(
        new THREE.Vector3(origin.x - 3.4, 0, origin.z - 3.4),
        new THREE.Vector3(origin.x + 3.4, 0.6, origin.z + 3.4),
      ),
      'fountain',
    )
  }

  get isActive(): boolean {
    return this.active
  }

  setActive(active: boolean): void {
    this.active = active
  }

  update(delta: number): void {
    this.clock += delta
    const target = this.active ? 0.8 : 0
    for (const jet of this.jets) {
      const material = jet.material as THREE.MeshBasicMaterial
      material.opacity += (target - material.opacity) * Math.min(1, delta * 3)
      jet.scale.y = 1 + (this.active ? Math.sin(this.clock * 4 + jet.position.x) * 0.12 : 0)
    }
    this.light.intensity += ((this.active ? 1.4 : 0) - this.light.intensity) * Math.min(1, delta * 3)
  }
}
