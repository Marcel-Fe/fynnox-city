import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'

interface Valve {
  id: string
  mesh: THREE.Mesh
  wheel: THREE.Mesh
  /** Reihenfolge, die der PawLink-Scan sichtbar macht. */
  order: number
  active: boolean
  signal: THREE.Mesh
}

/**
 * Licht- und Scannerraetsel im Transitwerk.
 * Loesung durch Beobachtung und Reihenfolge - kein Kampf, kein Zeitdruck.
 * Ohne PawLink-Scan ist die Reihenfolge nicht sichtbar; das macht den
 * Scanner zur echten Faehigkeit statt zur Dekoration.
 */
export class ScannerPuzzle {
  readonly group = new THREE.Group()
  private readonly valves: Valve[] = []
  private readonly beam: THREE.Mesh
  private solved = false
  private progress = 0
  private clock = 0
  private scannerVisible = false

  constructor(
    scene: THREE.Scene,
    collision: CollisionWorld,
    valvePositions: THREE.Vector3[],
    beamTarget: THREE.Vector3,
    private readonly onSolved: () => void,
    private readonly onFeedback: (message: string) => void,
  ) {
    valvePositions.forEach((position, index) => {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.5), mat(COLORS.metal))
      housing.position.copy(position)
      housing.castShadow = true
      this.group.add(housing)
      collision.addStatic(new THREE.Box3().setFromObject(housing), 'puzzle')

      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16), mat(COLORS.coral))
      wheel.position.copy(position).add(new THREE.Vector3(0, 0.25, 0.32))
      this.group.add(wheel)

      // Signalring: nur im Scannermodus sichtbar.
      const signal = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.46, 20),
        new THREE.MeshBasicMaterial({
          color: index === 0 ? COLORS.cyan : COLORS.gold,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        }),
      )
      signal.position.copy(position).add(new THREE.Vector3(0, 0.25, 0.36))
      signal.visible = false
      this.group.add(signal)

      this.valves.push({ id: `valve_${index + 1}`, mesh: housing, wheel, order: index, active: false, signal })
    })

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 6, 8),
      new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.0 }),
    )
    this.beam.position.copy(beamTarget)
    this.beam.rotation.z = Math.PI / 2
    this.group.add(this.beam)

    scene.add(this.group)
  }

  get isSolved(): boolean {
    return this.solved
  }

  get sequenceProgress(): number {
    return this.progress
  }

  restore(solved: boolean): void {
    if (!solved) return
    this.solved = true
    this.progress = this.valves.length
    for (const valve of this.valves) {
      valve.active = true
      valve.wheel.material = mat(COLORS.cyan)
    }
    ;(this.beam.material as THREE.MeshBasicMaterial).opacity = 0.75
  }

  setScannerVisible(visible: boolean): void {
    this.scannerVisible = visible
    for (const valve of this.valves) valve.signal.visible = visible && !this.solved
  }

  /** Naechstes Ventil in Reichweite - Grundlage des Kontext-Prompts. */
  valveInRange(position: THREE.Vector3): string | null {
    if (this.solved) return null
    for (const valve of this.valves) {
      if (valve.mesh.position.distanceTo(position) < 2.0) return valve.id
    }
    return null
  }

  interact(valveId: string): void {
    if (this.solved) return
    const valve = this.valves.find((v) => v.id === valveId)
    if (!valve) return

    if (!this.scannerVisible && this.progress === 0) {
      this.onFeedback('PawLink-Scan zeigt, welches Ventil zuerst muss.')
    }

    if (valve.order === this.progress) {
      valve.active = true
      valve.wheel.material = mat(COLORS.cyan)
      this.progress += 1
      if (this.progress === this.valves.length) {
        this.solved = true
        this.setScannerVisible(false)
        this.onFeedback('Der vierte Weg oeffnet sich.')
        this.onSolved()
      } else {
        this.onFeedback(`Ventil ${this.progress} von ${this.valves.length} steht richtig.`)
      }
      return
    }

    // Falsche Reihenfolge kostet nur Zeit, nie Fortschritt oder Waehrung.
    this.progress = 0
    for (const other of this.valves) {
      other.active = false
      other.wheel.material = mat(COLORS.coral)
    }
    this.onFeedback('Falsche Reihenfolge - Ventile stehen wieder auf Anfang.')
  }

  update(delta: number): void {
    this.clock += delta
    for (const valve of this.valves) {
      if (valve.active) valve.wheel.rotation.z += delta * 2
      valve.signal.scale.setScalar(1 + Math.sin(this.clock * 3 + valve.order) * 0.08)
    }
    const material = this.beam.material as THREE.MeshBasicMaterial
    const target = this.solved ? 0.55 + Math.sin(this.clock * 2) * 0.2 : 0
    material.opacity += (target - material.opacity) * Math.min(1, delta * 4)
  }
}
