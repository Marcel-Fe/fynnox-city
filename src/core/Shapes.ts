import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mat } from './Palette'

export interface Placement {
  pos?: [number, number, number]
  rot?: [number, number, number]
  scale?: [number, number, number]
}

/**
 * Sammelt die Einzelteile einer beweglichen Gruppe und verschmilzt sie pro Farbe.
 * Innerhalb einer Gruppe bewegt sich nichts gegeneinander, deshalb kostet ein
 * detailliertes, rundes Modell hier keine zusaetzlichen Draw-Calls - im Gegenteil:
 * ein Buggy aus achtzig Rundkoerpern braucht weniger als einer aus zwanzig Kisten,
 * solange die Teile pro Material zusammenfallen.
 */
export class PartBatcher {
  private readonly batches = new Map<string, THREE.BufferGeometry[]>()

  add(source: THREE.BufferGeometry, color: string, place: Placement = {}): void {
    // ExtrudeGeometry liefert nicht-indizierte Geometrie, alle anderen Primitive
    // indizierte. mergeGeometries verweigert die Mischung und liefert null -
    // die betroffenen Teile fehlen dann stillschweigend im Modell. Deshalb wird
    // hier alles auf dieselbe Form gebracht, bevor es in den Batch geht.
    let geometry = source
    if (source.index) {
      geometry = source.toNonIndexed()
      source.dispose()
    }
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

  /** Dasselbe Teil links und rechts der Mittelachse. */
  pair(
    build: (side: number) => { geometry: THREE.BufferGeometry; color: string; place: Placement },
  ): void {
    for (const side of [-1, 1]) {
      const part = build(side)
      this.add(part.geometry, part.color, part.place)
    }
  }

  finish(parent: THREE.Object3D, options?: { castShadow?: boolean }): void {
    for (const [color, geometries] of this.batches) {
      const merged = mergeGeometries(geometries, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat(color))
      mesh.castShadow = options?.castShadow ?? true
      parent.add(mesh)
      for (const geometry of geometries) geometry.dispose()
    }
    this.batches.clear()
  }
}

/** Punkt auf der lokalen Hochachse eines gedrehten Teils. */
export function alongLocalY(
  base: [number, number, number],
  rot: [number, number, number],
  distance: number,
): [number, number, number] {
  const offset = new THREE.Vector3(0, distance, 0).applyEuler(
    new THREE.Euler(rot[0], rot[1], rot[2]),
  )
  return [base[0] + offset.x, base[1] + offset.y, base[2] + offset.z]
}

export const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h)
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
export const capsule = (r: number, l: number, seg = 10) => new THREE.CapsuleGeometry(r, l, 3, seg)
export const cylinder = (rt: number, rb: number, h: number, seg = 10) =>
  new THREE.CylinderGeometry(rt, rb, h, seg)
export const cone = (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg)
export const torus = (r: number, tube: number, seg = 8, ring = 14, arc?: number) =>
  new THREE.TorusGeometry(r, tube, seg, ring, arc)

/**
 * Kiste mit gebrochenen Kanten. Eine scharfe Kante ist das, was ein Modell
 * "eckig" aussehen laesst - schon eine kleine Fase faengt das Licht anders und
 * nimmt der Form das Klotzige, ohne die Silhouette zu veraendern.
 */
export function roundedBox(w: number, h: number, d: number, radius?: number): THREE.BufferGeometry {
  const r = Math.min(radius ?? 0.06, w / 2.5, h / 2.5, d / 2.5)
  const shape = new THREE.Shape()
  const hw = w / 2 - r
  const hh = h / 2 - r
  shape.moveTo(-hw, -h / 2)
  shape.lineTo(hw, -h / 2)
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh)
  shape.lineTo(w / 2, hh)
  shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2)
  shape.lineTo(-hw, h / 2)
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh)
  shape.lineTo(-w / 2, -hh)
  shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * r,
    bevelEnabled: true,
    bevelSize: r,
    bevelThickness: r,
    bevelSegments: 1,
    curveSegments: 2,
  })
  geometry.translate(0, 0, -(d - 2 * r) / 2)
  geometry.computeVertexNormals()
  return geometry
}
