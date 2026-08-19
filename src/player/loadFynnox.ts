import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { characterMaterial } from '../core/Palette'
import { FynnoxModel } from './FynnoxModel'
import { FynnoxGlbModel, type RigData } from './FynnoxGlbModel'
import type { PlayerFigure } from './FynnoxPose'

/**
 * Koerperhoehe der Figur in Metern.
 *
 * Sie folgt dem Spieler-Collider: `HALF.y` ist 0,75, die Box also 1,5 m hoch.
 * Das Modell wird auf dieses Mass gebracht, nicht umgekehrt - an `HALF`,
 * `PLAYER_HALF` und den Sitzversaetzen haengen Boarding-Kette, Safe-Exit-Sweep
 * und Fahrphysik.
 */
const BODY_HEIGHT = 1.5

const MODEL_URL = 'models/fynnox.glb'
const RIG_URL = 'models/fynnox_rig.bin'

export interface FigureLoad {
  figure: PlayerFigure
  source: 'glb' | 'procedural'
  /** Grund des Rueckfalls, sonst null. Steht im QA-Zustand. */
  problem: string | null
}

/**
 * Laedt die modellierte Fynnox-Figur und faellt bei jedem Fehler auf die
 * prozedurale zurueck.
 *
 * Der Rueckfall ist keine Bequemlichkeit: das Spiel baut die Welt synchron auf
 * und startet sofort die Bildschleife. Ein fehlendes oder kaputtes Asset waere
 * ohne ihn ein Start ohne Spielfigur - und im schlimmsten Fall ein schwarzes
 * Bild. Deshalb bleibt die prozedurale Figur im Bundle stehen.
 */
export async function loadFynnoxFigure(): Promise<FigureLoad> {
  try {
    const base = import.meta.env.BASE_URL
    const [gltf, rigBuffer] = await Promise.all([
      new GLTFLoader().loadAsync(base + MODEL_URL),
      fetch(base + RIG_URL).then((response) => {
        if (!response.ok) throw new Error(`${RIG_URL}: HTTP ${response.status}`)
        return response.arrayBuffer()
      }),
    ])

    const mesh = findMesh(gltf.scene)
    if (!mesh) throw new Error(`${MODEL_URL} enthaelt kein Mesh.`)
    gltf.scene.updateMatrixWorld(true)

    const geometry = mesh.geometry
    // Erst den Knotenversatz der Datei einbacken, dann den Spielraum: danach
    // steht die Geometrie ohne jede weitere Korrektur richtig im Spiel.
    geometry.applyMatrix4(mesh.matrixWorld)
    geometry.applyMatrix4(toGameSpace(geometry))

    const source = mesh.material as THREE.MeshStandardMaterial
    const material = characterMaterial(source)
    // Die Metall-Rauheits-Karte wird nicht uebernommen (siehe `characterMaterial`).
    // Ungenutzt bliebe sie trotzdem als entpacktes Bild im Speicher stehen -
    // 1024 x 1024 sind rund 4 MB, die auf einem Tablet niemandem nuetzen.
    source.metalnessMap?.dispose()
    source.dispose()

    return {
      figure: new FynnoxGlbModel(geometry, material, readRig(rigBuffer), BODY_HEIGHT),
      source: 'glb',
      problem: null,
    }
  } catch (error) {
    const problem = error instanceof Error ? error.message : String(error)
    console.warn('Fynnox-Modell nicht geladen, prozedurale Figur springt ein:', problem)
    return { figure: new FynnoxModel(), source: 'procedural', problem }
  }
}

function findMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null
  root.traverse((object) => {
    if (!found && (object as THREE.Mesh).isMesh) found = object as THREE.Mesh
  })
  return found
}

/**
 * Groesse, Hoehenversatz und Achsdrehung in einem Schritt.
 *
 * Das Tripo-Modell ist rund 1 m hoch, sein Ursprung liegt in der Figurenmitte,
 * und es blickt nach +X - eine dritte Achsenkonvention neben der Figurenachse
 * +Z und der Fahrzeugachse -Z. Alle drei Korrekturen gehoeren an genau diese
 * Stelle: verstreut auf die Aufrufstellen waeren sie derselbe Fehler, den
 * `lessons.md` schon einmal beschreibt.
 */
function toGameSpace(geometry: THREE.BufferGeometry): THREE.Matrix4 {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) throw new Error('Modell ohne Ausdehnung.')
  const scale = BODY_HEIGHT / (box.max.y - box.min.y)
  return new THREE.Matrix4()
    .makeTranslation(0, -box.min.y * scale, 0)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))
}

/** Kopf und zwei Byte-Bloecke aus `fynnox_rig.bin`. */
function readRig(buffer: ArrayBuffer): RigData {
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()
  if (decoder.decode(bytes.subarray(0, 8)) !== 'FYNXRIG1') {
    throw new Error(`${RIG_URL}: unbekanntes Format.`)
  }
  const headerLength = new DataView(buffer).getUint32(8, true)
  const header = JSON.parse(decoder.decode(bytes.subarray(12, 12 + headerLength))) as {
    vertexCount: number
    groups: string[]
    bones: Record<string, [number, number, number]>
  }
  const start = 12 + headerLength
  const stride = header.vertexCount * 4
  if (bytes.length < start + stride * 2) throw new Error(`${RIG_URL}: Datei zu kurz.`)
  return {
    vertexCount: header.vertexCount,
    groups: header.groups,
    bones: header.bones,
    skinIndex: bytes.slice(start, start + stride),
    skinWeight: bytes.slice(start + stride, start + stride * 2),
  }
}
