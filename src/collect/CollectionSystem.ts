import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import { safetyInvariants } from '../contracts/manifests'

export interface CollectibleState {
  id: string
  taken: boolean
}

/**
 * Sammelschleife aus SAMMEL_FUND_UND_BELOHNUNGSSYSTEM_v1_5.md:
 * finden - aufnehmen - sichtbar bestaetigen - inventarisieren - einloesen.
 * Invarianten: kein negativer Kontostand, kein Verlust, keine Lootbox.
 */
export class CollectionSystem {
  readonly group = new THREE.Group()
  private readonly pickups: { id: string; mesh: THREE.Mesh; taken: boolean }[] = []
  private wallet = 0
  private sparks = 0
  private clock = 0

  constructor(
    scene: THREE.Scene,
    positions: THREE.Vector3[],
    private readonly onCollected: (id: string, reward: number) => void,
  ) {
    const geometry = new THREE.OctahedronGeometry(0.28)
    positions.forEach((position, index) => {
      const mesh = new THREE.Mesh(geometry, mat(COLORS.cyan))
      mesh.position.copy(position)
      mesh.castShadow = true
      this.group.add(mesh)
      // ID nach v1.5-Manifest: collectible city_spark, laufend nummeriert.
      this.pickups.push({ id: `city_spark_${String(index + 1).padStart(2, '0')}`, mesh, taken: false })
    })
    scene.add(this.group)
  }

  get tatzTaler(): number {
    return this.wallet
  }

  get collectedSparks(): number {
    return this.sparks
  }

  get totalSparks(): number {
    return this.pickups.length
  }

  get states(): CollectibleState[] {
    return this.pickups.map((p) => ({ id: p.id, taken: p.taken }))
  }

  restore(states: CollectibleState[], wallet: number): void {
    for (const state of states) {
      const pickup = this.pickups.find((p) => p.id === state.id)
      if (!pickup) continue
      pickup.taken = state.taken
      pickup.mesh.visible = !state.taken
    }
    this.sparks = this.pickups.filter((p) => p.taken).length
    this.wallet = Math.max(0, wallet)
  }

  /** Belohnung aus Auftraegen - fester Betrag, keine Zufallsausschuettung. */
  reward(amount: number): void {
    this.wallet += Math.max(0, amount)
  }

  /** Einloesen an einer Station. Gibt false zurueck, statt ins Minus zu gehen. */
  spend(amount: number): boolean {
    if (!safetyInvariants.wallet_never_negative) throw new Error('Wallet-Invariante fehlt')
    if (amount > this.wallet) return false
    this.wallet -= amount
    return true
  }

  update(delta: number, playerPosition: THREE.Vector3, onPickupAnimation: () => void): void {
    this.clock += delta
    for (const pickup of this.pickups) {
      if (pickup.taken) continue
      pickup.mesh.rotation.y += delta * 1.6
      pickup.mesh.position.y += Math.sin(this.clock * 2 + pickup.mesh.position.x) * delta * 0.12
      if (pickup.mesh.position.distanceTo(playerPosition) < 1.3) {
        pickup.taken = true
        pickup.mesh.visible = false
        this.sparks += 1
        // Fester Betrag statt Zufall: keine Lootbox-Mechanik.
        const reward = 5
        this.wallet += reward
        onPickupAnimation()
        this.onCollected(pickup.id, reward)
      }
    }
  }
}
