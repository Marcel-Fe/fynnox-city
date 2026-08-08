import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import { inputContext } from '../state/InputContext'

export interface DialogueLine {
  speaker: string
  text: string
  /** face_state aus dem v1.4-Manifest - spaeter fuer echte Visemes. */
  face: 'face_neutral' | 'face_smile' | 'expr_thinking' | 'expr_excited' | 'expr_surprised'
}

/**
 * Gespraechspartner als Graybox-Proxy.
 * Mira ist im Paket eine rote Panda-Mechanikerin; hier steht nur ein
 * proportionsrichtiger Platzhalter mit ihren Farben.
 */
export class DialoguePartner {
  readonly root = new THREE.Group()
  private readonly head: THREE.Mesh
  private readonly armL: THREE.Group
  private readonly armR: THREE.Group
  private clock = 0
  private talking = false

  constructor(
    scene: THREE.Scene,
    readonly id: string,
    readonly name: string,
    position: THREE.Vector3,
    heading: number,
    bodyColor: string,
  ) {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.28), mat(bodyColor))
    torso.position.y = 1.0
    torso.castShadow = true
    this.root.add(torso)
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.3), mat(COLORS.navy))
    belt.position.y = 0.78
    this.root.add(belt)

    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.3), mat('#C4553C'))
    this.head.position.y = 1.42
    this.root.add(this.head)
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.14), mat(COLORS.cream))
    snout.position.set(0, 1.38, 0.2)
    this.root.add(snout)
    for (const dx of [-0.11, 0.11]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), mat('#C4553C'))
      ear.position.set(dx, 1.62, -0.02)
      this.root.add(ear)
    }

    for (const dx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.16), mat(COLORS.navyMid))
      leg.position.set(dx, 0.375, 0)
      this.root.add(leg)
    }
    this.armL = new THREE.Group()
    this.armR = new THREE.Group()
    this.armL.position.set(-0.28, 1.2, 0)
    this.armR.position.set(0.28, 1.2, 0)
    for (const arm of [this.armL, this.armR]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.12), mat(bodyColor))
      mesh.position.y = -0.22
      arm.add(mesh)
      this.root.add(arm)
    }
    // Werkzeuggurt der Mechanikerin.
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.1), mat(COLORS.gold))
    tool.position.set(0.24, 0.8, 0.12)
    this.root.add(tool)

    this.root.position.copy(position)
    this.root.rotation.y = heading
    scene.add(this.root)
  }

  setTalking(talking: boolean): void {
    this.talking = talking
  }

  update(delta: number, lookAt: THREE.Vector3): void {
    this.clock += delta
    // Atmen und leichtes Gewicht-Verlagern - auch ausserhalb des Gespraechs.
    this.root.position.y += Math.sin(this.clock * 1.6) * delta * 0.02
    this.armL.rotation.x = Math.sin(this.clock * 1.4) * 0.06
    this.armR.rotation.x = -Math.sin(this.clock * 1.4) * 0.06
    if (this.talking) {
      this.head.rotation.x = Math.sin(this.clock * 9) * 0.05
      this.armR.rotation.x = -0.5 + Math.sin(this.clock * 5) * 0.35
      const dx = lookAt.x - this.root.position.x
      const dz = lookAt.z - this.root.position.z
      this.root.rotation.y = Math.atan2(dx, dz)
    } else {
      this.head.rotation.x = 0
    }
  }
}

/**
 * Dialogablauf.
 * "Dialogue pauses player control, not the visible world simulation"
 * (Developer Handoff): der Kontext wechselt auf ctx_dialogue, die Steuerung
 * ruht - Wasser, NPCs, Verkehr und Fahrzeuge laufen weiter.
 */
export class DialogueSystem {
  private lines: DialogueLine[] = []
  private index = 0
  private partner: DialoguePartner | null = null
  private onFinished: (() => void) | null = null

  constructor(
    private readonly onLine: (line: DialogueLine, position: number, total: number) => void,
    private readonly onClose: () => void,
  ) {}

  get isActive(): boolean {
    return this.lines.length > 0
  }

  get speaker(): string | null {
    return this.partner?.name ?? null
  }

  start(partner: DialoguePartner, lines: DialogueLine[], onFinished?: () => void): void {
    if (this.isActive || lines.length === 0) return
    this.partner = partner
    this.lines = lines
    this.index = 0
    this.onFinished = onFinished ?? null
    partner.setTalking(true)
    inputContext.switchTo('ctx_dialogue')
    this.emit()
  }

  advance(): void {
    if (!this.isActive) return
    this.index += 1
    if (this.index >= this.lines.length) {
      this.finish()
      return
    }
    this.emit()
  }

  /** Bricht das Gespraech ab, ohne den Abschluss auszuloesen. */
  cancel(): void {
    if (!this.isActive) return
    this.partner?.setTalking(false)
    this.lines = []
    this.partner = null
    this.onFinished = null
    inputContext.switchTo('ctx_on_foot')
    this.onClose()
  }

  private finish(): void {
    const done = this.onFinished
    this.partner?.setTalking(false)
    this.lines = []
    this.partner = null
    this.onFinished = null
    inputContext.switchTo('ctx_on_foot')
    this.onClose()
    done?.()
  }

  private emit(): void {
    this.onLine(this.lines[this.index], this.index + 1, this.lines.length)
  }
}
