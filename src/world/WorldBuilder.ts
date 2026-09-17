import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mat, surfaceKey, surfaceLayerOf, vertexColorMat } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'

export interface BoxOptions {
  /** Mittelpunkt in X/Z, Unterkante in Y - so wie die Pivots im Paket definiert sind. */
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  color: string
  collide?: boolean
  tag?: string
  rotY?: number
}

export interface Placement {
  pos?: [number, number, number]
  rot?: [number, number, number]
  scale?: [number, number, number]
}

/**
 * Detailstufe, in die gebaut wird.
 *
 * - `all`: wie bis 17.09.2026 - ein Mesh je Farbe ueber die ganze Welt, immer
 *   sichtbar. Das handgebaute Hafenviertel bleibt genau so.
 * - `near`: Details der grossen Stadt, in 96-m-Kacheln geschnitten und nur in
 *   der Naehe der Kamera sichtbar.
 * - `far`: Umrisse der grossen Stadt, immer sichtbar und ohne Schattenwurf.
 *   Sie liegen eine Handbreit INNERHALB der Nahgeometrie; beide duerfen also
 *   gleichzeitig stehen, und beim Umschalten springt nichts.
 */
export type Detail = 'all' | 'near' | 'far'

/** Kantenlaenge einer Nahkachel. Acht Strassentiles zu je 12 m. */
export const NEAR_CHUNK = 96
/** Fernkacheln sind groesser: sie werden nie ausgeblendet, nur weggeschnitten. */
export const FAR_CHUNK = 288
/**
 * Horizont ausserhalb der Stadt: noch groebere Kacheln. Jeder Berg lag sonst in
 * einer eigenen Kachel und kostete eigene Draw-Calls - fuer Objekte, die ohnehin
 * immer im Bild stehen, bringt das Schneiden nichts.
 */
const HORIZON_CHUNK = 1500

function farChunkSize(x: number, z: number): number {
  return Math.abs(x) > 600 || z < -650 || z > 120 ? HORIZON_CHUNK : FAR_CHUNK
}

/** Ein Modell, das vielfach platziert wird - Fenster, Baum, Laterne. */
export interface InstanceModel {
  id: string
  parts: { geometry: THREE.BufferGeometry; color: string }[]
  castShadow?: boolean
}

/** Eine Nahkachel und alles, was beim Naeherkommen eingeblendet wird. */
export interface NearChunk {
  minX: number
  minZ: number
  objects: THREE.Object3D[]
}

interface VertexBatch {
  detail: Exclude<Detail, 'all'>
  surface: string
  sample: string
  chunk: string
  parts: THREE.BufferGeometry[]
}

interface InstanceBatch {
  detail: Exclude<Detail, 'all'>
  chunk: string
  model: InstanceModel
  matrices: THREE.Matrix4[]
}

const scratchBox = new THREE.Box3()
const scratchCenter = new THREE.Vector3()

/**
 * Sammelt statische Geometrie und verschmilzt sie.
 *
 * Ohne das Batching haette der Hafenblock mehrere hundert Draw-Calls - auf
 * Mobilgeraeten der schnellste Weg in die Ruckelzone. Fuer die grosse Stadt
 * reicht Batching je Farbe nicht mehr: ein einziges Mesh ueber einen Kilometer
 * kann Three nie aus dem Blickfeld schneiden. Deshalb wird dort je Kachel und
 * Oberflaechenart verschmolzen, die Farbe liegt im Vertex.
 */
export class WorldBuilder {
  private readonly batches = new Map<string, { color: string; parts: THREE.BufferGeometry[] }>()
  private readonly vertexBatches = new Map<string, VertexBatch>()
  private readonly instanceBatches = new Map<string, InstanceBatch>()
  private detail: Detail = 'all'
  /** Nahkacheln nach dem letzten `finish()`, fuer `ChunkLod`. */
  readonly nearChunks: NearChunk[] = []

  constructor(
    private readonly scene: THREE.Scene,
    private readonly collision: CollisionWorld,
  ) {}

  /** Alles, was in `build` gebaut wird, landet in der angegebenen Detailstufe. */
  withDetail<T>(detail: Detail, build: () => T): T {
    const previous = this.detail
    this.detail = detail
    try {
      return build()
    } finally {
      this.detail = previous
    }
  }

  /**
   * Beliebige Geometrie in den Batch legen - Zylinder, Kugel, Kegel, Torus.
   *
   * `box()` reicht fuer Waende, aber nicht fuer den Leuchtturmschaft oder eine
   * Baumkrone: ein runder Koerper aus Quadern liest als Quader, egal wie viele.
   * Der Batch-Schluessel traegt zusaetzlich zur Farbe, ob die Geometrie
   * indiziert ist - mergeGeometries verweigert die Mischung und liefert
   * stillschweigend null, die betroffenen Teile fehlten dann einfach.
   */
  shape(
    source: THREE.BufferGeometry,
    color: string,
    place: Placement = {},
    options: { collide?: boolean; tag?: string } = {},
  ): THREE.Box3 {
    source.applyMatrix4(composeMatrix(place))
    this.push(source, color)

    const bounds = new THREE.Box3().setFromBufferAttribute(
      source.getAttribute('position') as THREE.BufferAttribute,
    )
    if (options.collide) this.collision.addStatic(bounds.clone(), options.tag ?? 'world')
    return bounds
  }

  /**
   * Ein Modell vielfach platzieren. Kostet je Stueck eine Matrix statt einer
   * Kopie der Geometrie - bei zehntausend Fenstern der Unterschied zwischen
   * einigen Megabyte und einigen hundert.
   */
  instance(model: InstanceModel, place: Placement): void {
    const detail = this.detail === 'all' ? 'near' : this.detail
    const matrix = composeMatrix(place)
    const position = new THREE.Vector3().setFromMatrixPosition(matrix)
    const size = detail === 'far' ? farChunkSize(position.x, position.z) : NEAR_CHUNK
    const chunk = `${size}:${chunkKey(position.x, position.z, size)}`
    const key = `${detail}|${chunk}|${model.id}`
    const batch = this.instanceBatches.get(key)
    if (batch) batch.matrices.push(matrix)
    else this.instanceBatches.set(key, { detail, chunk, model, matrices: [matrix] })
  }

  private push(geometry: THREE.BufferGeometry, color: string): void {
    if (this.detail === 'all') {
      const key = `${color}|${geometry.index ? 'i' : 'n'}`
      const batch = this.batches.get(key)
      if (batch) batch.parts.push(geometry)
      else this.batches.set(key, { color, parts: [geometry] })
      return
    }
    geometry.computeBoundingBox()
    ;(geometry.boundingBox ?? scratchBox).getCenter(scratchCenter)
    paint(geometry, color, surfaceLayerOf(color))
    const size = this.detail === 'far' ? farChunkSize(scratchCenter.x, scratchCenter.z) : NEAR_CHUNK
    const chunk = `${size}:${chunkKey(scratchCenter.x, scratchCenter.z, size)}`
    const surface = surfaceKey(color)
    const key = `${this.detail}|${chunk}|${surface}|${geometry.index ? 'i' : 'n'}`
    const batch = this.vertexBatches.get(key)
    if (batch) batch.parts.push(geometry)
    else this.vertexBatches.set(key, { detail: this.detail, surface, sample: color, chunk, parts: [geometry] })
  }

  box(options: BoxOptions): THREE.Box3 {
    const { x, y, z, w, h, d, color, collide = true, tag = 'world', rotY = 0 } = options
    const geometry = new THREE.BoxGeometry(w, h, d)
    const matrix = new THREE.Matrix4()
    if (rotY !== 0) matrix.makeRotationY(rotY)
    matrix.setPosition(x, y + h / 2, z)
    geometry.applyMatrix4(matrix)

    this.push(geometry, color)

    const bounds = new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute('position') as THREE.BufferAttribute,
    )
    if (collide) this.collision.addStatic(bounds.clone(), tag)
    return bounds
  }

  /** Treppe nach Paketmass: Stufenhoehe 0,16 m, Auftritt 0,30 m. */
  stairs(options: {
    x: number
    y: number
    z: number
    width: number
    steps: number
    color: string
    /** Richtung, in die die Treppe ansteigt. */
    dir: 'north' | 'south' | 'east' | 'west'
    /**
     * Offene Stufen statt geschlossenem Keil.
     *
     * Standard ist der Keil: jede Stufe reicht vom Fusspunkt bis zu ihrer
     * Trittflaeche, wie bei einer gegossenen Betontreppe. Eine Stahltreppe
     * sieht so falsch aus - sie wird im Bild zu einer massiven Schraege ohne
     * Struktur. Mit `open` bleibt jede Stufe eine Platte von 0,16 m, die auf
     * den Wangen aus `stairDressing()` liegt. Die Oberkanten sind in beiden
     * Faellen dieselben, das Begehen aendert sich also nicht.
     */
    open?: boolean
  }): void {
    const rise = 0.16
    const run = 0.3
    for (let i = 0; i < options.steps; i++) {
      const h = options.open ? rise : rise * (i + 1)
      const y = options.open ? options.y + rise * i : options.y
      const offset = run * i + run / 2
      const common = { y, h, color: options.color }
      if (options.dir === 'north' || options.dir === 'south') {
        const sign = options.dir === 'north' ? -1 : 1
        this.box({
          ...common,
          x: options.x,
          z: options.z + sign * offset,
          w: options.width,
          d: run,
        })
      } else {
        const sign = options.dir === 'east' ? 1 : -1
        this.box({
          ...common,
          x: options.x + sign * offset,
          z: options.z,
          w: run,
          d: options.width,
        })
      }
    }
  }

  /** Gelaender/Bruestung: 1,1 m hoch (Paketmass), optisch durchlaessig. */
  railing(options: {
    x: number
    z: number
    y: number
    length: number
    axis: 'x' | 'z'
    color: string
    collide?: boolean
    /** 'nocam' haelt die Verfolgerkamera davon ab, sich daran heranzuziehen. */
    tag?: string
  }): void {
    const { x, z, y, length, axis, color, collide = true, tag = 'world' } = options
    const thickness = 0.08
    const w = axis === 'x' ? length : thickness
    const d = axis === 'x' ? thickness : length
    this.box({ x, y: y + 1.02, z, w, h: 0.08, d, color, collide: false })
    this.box({ x, y: y + 0.55, z, w, h: 0.06, d, color, collide: false })
    const posts = Math.max(2, Math.round(length / 1.5))
    for (let i = 0; i <= posts; i++) {
      const t = (i / posts - 0.5) * length
      this.box({
        x: axis === 'x' ? x + t : x,
        y,
        z: axis === 'z' ? z + t : z,
        w: 0.08,
        h: 1.1,
        d: 0.08,
        color,
        collide: false,
      })
    }
    if (collide) {
      // Ein einziger unsichtbarer Blocker statt Kollision je Pfosten.
      const bounds = new THREE.Box3(
        new THREE.Vector3(
          axis === 'x' ? x - length / 2 : x - 0.1,
          y,
          axis === 'z' ? z - length / 2 : z - 0.1,
        ),
        new THREE.Vector3(
          axis === 'x' ? x + length / 2 : x + 0.1,
          y + 1.1,
          axis === 'z' ? z + length / 2 : z + 0.1,
        ),
      )
      this.collisionAdd(bounds, tag)
    }
  }

  collisionAdd(box: THREE.Box3, tag = 'world'): void {
    this.collision.addStatic(box, tag)
  }

  finish(): void {
    for (const { color, parts: geometries } of this.batches.values()) {
      const merged = mergeGeometries(geometries, false)
      if (!merged) {
        throw new Error(`Batch ${color} liess sich nicht verschmelzen`)
      }
      // Auch das Hafenviertel traegt Texturen. Sein Mesh hat genau eine Farbe,
      // der Layer ist also ueberall derselbe - dieselbe Vertexspur wie in der
      // grossen Stadt, damit beide Teile einen Shader teilen.
      merged.setAttribute(
        'fynnoxLayer',
        new THREE.BufferAttribute(new Float32Array(merged.getAttribute('position').count).fill(surfaceLayerOf(color)), 1),
      )
      const mesh = new THREE.Mesh(merged, mat(color))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      this.scene.add(mesh)
      for (const geometry of geometries) geometry.dispose()
    }
    this.batches.clear()

    const chunks = new Map<string, NearChunk>()
    const register = (chunk: string, object: THREE.Object3D) => {
      let entry = chunks.get(chunk)
      if (!entry) {
        const [cx, cz] = chunk.split(':')[1].split(',').map(Number)
        entry = { minX: cx * NEAR_CHUNK, minZ: cz * NEAR_CHUNK, objects: [] }
        chunks.set(chunk, entry)
      }
      entry.objects.push(object)
    }

    for (const batch of this.vertexBatches.values()) {
      const merged = mergeGeometries(batch.parts, false)
      if (!merged) throw new Error(`Kachel ${batch.chunk} (${batch.surface}) liess sich nicht verschmelzen`)
      const mesh = new THREE.Mesh(merged, vertexColorMat(batch.sample))
      mesh.name = `${batch.detail}|${batch.surface}`
      mesh.castShadow = batch.detail === 'near'
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      this.scene.add(mesh)
      if (batch.detail === 'near') register(batch.chunk, mesh)
      for (const geometry of batch.parts) geometry.dispose()
    }
    this.vertexBatches.clear()

    /**
     * Instanzen je Kachel, Oberflaechenart und Schattenwurf zu EINEM BatchedMesh.
     *
     * Mit einem InstancedMesh je Modell kostete jede Nahkachel rund 55
     * Draw-Calls - Fenster, drei Fenstervarianten, Markisen, Baeume, Laternen,
     * jeweils mal Oberflaechenart. Ein BatchedMesh zeichnet verschiedene
     * Geometrien in einem Aufruf und schneidet dabei jede Instanz einzeln aus
     * dem Blickfeld, nicht nur die ganze Kachel.
     */
    const groups = new Map<
      string,
      { detail: Exclude<Detail, 'all'>; chunk: string; cast: boolean; material: THREE.Material; entries: { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[] }[] }
    >()
    for (const batch of this.instanceBatches.values()) {
      for (const [surface, part] of modelParts(batch.model)) {
        const cast = batch.detail === 'near' && batch.model.castShadow !== false
        const key = `${batch.detail}|${batch.chunk}|${surface}|${cast}`
        let group = groups.get(key)
        if (!group) {
          group = { detail: batch.detail, chunk: batch.chunk, cast, material: part.material, entries: [] }
          groups.set(key, group)
        }
        group.entries.push({ geometry: part.geometry, matrices: batch.matrices })
      }
    }
    for (const [key, group] of groups) {
      let instances = 0
      let vertices = 0
      for (const entry of group.entries) {
        instances += entry.matrices.length
        vertices += entry.geometry.getAttribute('position').count
      }
      const mesh = new THREE.BatchedMesh(instances, vertices, 0, group.material)
      for (const entry of group.entries) {
        const id = mesh.addGeometry(entry.geometry)
        for (const matrix of entry.matrices) mesh.setMatrixAt(mesh.addInstance(id), matrix)
      }
      // Sortieren kostet je Bild eine Schleife ueber alle Instanzen und bringt
      // bei undurchsichtiger Geometrie in dieser Groesse kaum etwas.
      mesh.sortObjects = false
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
      mesh.castShadow = group.cast
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      mesh.name = `batch|${key}`
      this.scene.add(mesh)
      if (group.detail === 'near') register(group.chunk, mesh)
    }
    this.instanceBatches.clear()

    this.nearChunks.push(...chunks.values())
    this.collision.markDirty()
  }
}

function composeMatrix(place: Placement): THREE.Matrix4 {
  const quaternion = new THREE.Quaternion()
  if (place.rot) quaternion.setFromEuler(new THREE.Euler(place.rot[0], place.rot[1], place.rot[2]))
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(place.pos ?? [0, 0, 0])),
    quaternion,
    new THREE.Vector3(...(place.scale ?? [1, 1, 1])),
  )
}

function chunkKey(x: number, z: number, size: number): string {
  return `${Math.floor(x / size)},${Math.floor(z / size)}`
}

/**
 * Schreibt Farbe und Texturlayer als Vertexattribute - die Farbe linear, so
 * wie Three sie rechnet. Beide gehoeren an jede Geometrie eines Buendels:
 * `mergeGeometries` verweigert Teile mit abweichenden Attributen.
 */
function paint(geometry: THREE.BufferGeometry, color: string, layer = 0): void {
  const c = new THREE.Color(color)
  const count = geometry.getAttribute('position').count
  const data = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    data[i * 3] = c.r
    data[i * 3 + 1] = c.g
    data[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3))
  geometry.setAttribute('fynnoxLayer', new THREE.BufferAttribute(new Float32Array(count).fill(layer), 1))
}

const modelCache = new Map<string, Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }>>()

/**
 * Ein Instanzmodell, verschmolzen je Oberflaechenart.
 *
 * Einmal je Modell gerechnet und von allen Kacheln geteilt - die Geometrie
 * existiert genau einmal, egal wie oft das Modell steht.
 */
function modelParts(model: InstanceModel) {
  let parts = modelCache.get(model.id)
  if (parts) return parts
  const groups = new Map<string, { sample: string; list: THREE.BufferGeometry[] }>()
  for (const part of model.parts) {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()
    geometry.deleteAttribute('uv')
    paint(geometry, part.color)
    const key = surfaceKey(part.color)
    const group = groups.get(key)
    if (group) group.list.push(geometry)
    else groups.set(key, { sample: part.color, list: [geometry] })
  }
  parts = new Map()
  for (const [key, group] of groups) {
    const merged = mergeGeometries(group.list, false)
    if (!merged) throw new Error(`Modell ${model.id} liess sich nicht verschmelzen`)
    parts.set(key, { geometry: merged, material: vertexColorMat(group.sample) })
  }
  modelCache.set(model.id, parts)
  return parts
}
