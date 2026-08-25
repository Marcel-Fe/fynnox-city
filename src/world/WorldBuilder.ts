import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mat } from '../core/Palette'
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

/**
 * Sammelt statische Geometrie und verschmilzt sie pro Material zu einem Mesh.
 * Ohne das Batching haette der Hafenblock mehrere hundert Draw-Calls - auf
 * Mobilgeraeten der schnellste Weg in die Ruckelzone.
 */
export class WorldBuilder {
  private readonly batches = new Map<string, { color: string; parts: THREE.BufferGeometry[] }>()

  constructor(
    private readonly scene: THREE.Scene,
    private readonly collision: CollisionWorld,
  ) {}

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
    place: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] } = {},
    options: { collide?: boolean; tag?: string } = {},
  ): THREE.Box3 {
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    if (place.rot) quaternion.setFromEuler(new THREE.Euler(place.rot[0], place.rot[1], place.rot[2]))
    matrix.compose(
      new THREE.Vector3(...(place.pos ?? [0, 0, 0])),
      quaternion,
      new THREE.Vector3(...(place.scale ?? [1, 1, 1])),
    )
    source.applyMatrix4(matrix)
    this.push(source, color)

    const bounds = new THREE.Box3().setFromBufferAttribute(
      source.getAttribute('position') as THREE.BufferAttribute,
    )
    if (options.collide) this.collision.addStatic(bounds.clone(), options.tag ?? 'world')
    return bounds
  }

  private push(geometry: THREE.BufferGeometry, color: string): void {
    const key = `${color}|${geometry.index ? 'i' : 'n'}`
    const batch = this.batches.get(key)
    if (batch) batch.parts.push(geometry)
    else this.batches.set(key, { color, parts: [geometry] })
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
  }): void {
    const { x, z, y, length, axis, color, collide = true } = options
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
      this.collisionAdd(bounds)
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
      const mesh = new THREE.Mesh(merged, mat(color))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      this.scene.add(mesh)
      for (const geometry of geometries) geometry.dispose()
    }
    this.batches.clear()
    this.collision.markDirty()
  }
}
