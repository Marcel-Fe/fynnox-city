import * as THREE from 'three'
import type { AnimationStateId } from '../contracts/types'
import { applyPose, type FigureParts, type PlayerFigure } from './FynnoxPose'

/**
 * Elternkette der Spielgruppen. Sie ist dieselbe wie in `FynnoxModel` - nur
 * dass hier Knochen statt Gruppen darin haengen. Damit gilt jede Pose aus
 * `applyPose` unveraendert fuer beide Figuren.
 */
const PARENT: Record<string, string | null> = {
  hip: null,
  torso: 'hip',
  head: 'torso',
  armL: 'torso',
  armR: 'torso',
  legL: 'hip',
  legR: 'hip',
}

/** Was `tools/bake-rig.mjs` in `public/models/fynnox_rig.bin` legt. */
export interface RigData {
  vertexCount: number
  /** Reihenfolge der Knochen - sie ist zugleich der Index in `skinIndex`. */
  groups: string[]
  /** Ruhelage je Knochen im Einheitsraum: Fuesse auf 0, Hoehe 1, Blick +Z. */
  bones: Record<string, [number, number, number]>
  skinIndex: Uint8Array
  skinWeight: Uint8Array
}

/**
 * Die geladene Fynnox-Figur.
 *
 * Das GLB bringt keinen einzigen Animationsclip mit und auch kein Skelett. Beides
 * entsteht hier: die Knochen stehen an den Gelenkpositionen des Adventure-Rigs
 * derselben Figur, die Hautgewichte kommen aus der gebackenen Datei. Bewegt wird
 * dann mit denselben handgeschriebenen Posen wie die prozedurale Figur - die 18
 * Zustaende des Vertrags bleiben also unangetastet.
 *
 * Die Geometrie kommt bereits im Spielraum an (1,5 m hoch, Fuesse auf y = 0,
 * Blick nach +Z). Die Umrechnung passiert einmal im Ladepfad, nicht hier und
 * erst recht nicht an den Aufrufstellen.
 */
export class FynnoxGlbModel implements PlayerFigure, FigureParts {
  readonly root = new THREE.Group()
  readonly hip: THREE.Bone
  readonly torso: THREE.Bone
  readonly head: THREE.Bone
  readonly armL: THREE.Bone
  readonly armR: THREE.Bone
  readonly legL: THREE.Bone
  readonly legR: THREE.Bone
  private readonly mesh: THREE.SkinnedMesh
  private readonly hipRestY: number
  private state: AnimationStateId = 'fox_idle'
  private clock = 0

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    rig: RigData,
    bodyHeight: number,
  ) {
    if (geometry.attributes.position.count !== rig.vertexCount) {
      throw new Error(
        `Rigdatei passt nicht zum Modell: ${rig.vertexCount} statt ` +
          `${geometry.attributes.position.count} Punkte.`,
      )
    }
    geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(rig.skinIndex, 4))
    geometry.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(rig.skinWeight, 4, true))

    const bones = new Map<string, THREE.Bone>()
    for (const name of rig.groups) {
      if (!(name in PARENT)) throw new Error(`Unbekannte Knochengruppe: ${name}`)
      const bone = new THREE.Bone()
      bone.name = name
      bones.set(name, bone)
    }
    const need = (name: string): THREE.Bone => {
      const bone = bones.get(name)
      if (!bone) throw new Error(`Knochen fehlt in der Rigdatei: ${name}`)
      return bone
    }
    // Der Bake liefert Weltlagen; ein Knochen braucht die Lage relativ zu seinem
    // Elternteil. Beides zu verwechseln setzt Arme und Beine doppelt versetzt an.
    const world = (name: string): THREE.Vector3 =>
      new THREE.Vector3().fromArray(rig.bones[name]).multiplyScalar(bodyHeight)
    for (const name of rig.groups) {
      const bone = need(name)
      const parent = PARENT[name]
      bone.position.copy(world(name))
      if (parent) {
        bone.position.sub(world(parent))
        need(parent).add(bone)
      } else {
        this.root.add(bone)
      }
    }

    this.hip = need('hip')
    this.torso = need('torso')
    this.head = need('head')
    this.armL = need('armL')
    this.armR = need('armR')
    this.legL = need('legL')
    this.legR = need('legR')
    this.hipRestY = this.hip.position.y

    this.mesh = new THREE.SkinnedMesh(geometry, material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    // Die Huellkugel der Bindepose beschreibt die bewegte Figur nicht mehr
    // genau; bei einer einzelnen Heldenfigur ist der Test billiger gespart als
    // falsch. Ein Ausblenden mitten im Bild waere der teurere Fehler.
    this.mesh.frustumCulled = false
    this.root.add(this.mesh)

    // Erst nach dem vollstaendigen Aufbau binden: `Skeleton` nimmt die
    // Weltmatrizen des Augenblicks als Ruhepose.
    this.root.updateMatrixWorld(true)
    this.mesh.bind(new THREE.Skeleton(rig.groups.map(need)))
  }

  setState(state: AnimationStateId): void {
    if (this.state === state) return
    this.state = state
  }

  get currentState(): AnimationStateId {
    return this.state
  }

  update(delta: number, planarSpeed: number): void {
    this.clock += delta
    applyPose(this, this.state, this.clock, planarSpeed, this.hipRestY)
  }
}
