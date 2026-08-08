import * as THREE from 'three'

export interface Collider {
  box: THREE.Box3
  tag: string
  /** Deaktivierte Collider bleiben registriert (Weltzustaende schalten sie um). */
  enabled: boolean
}

const CELL = 8

function key(cx: number, cz: number): string {
  return `${cx},${cz}`
}

/**
 * Achsen-ausgerichtete Kollisionswelt fuer das Graybox-Level.
 * Bewusst simpel: Boxen statt Meshes, dafuer stabil und mobil billig.
 */
export class CollisionWorld {
  private readonly statics: Collider[] = []
  private readonly dynamics = new Map<string, Collider>()
  private grid = new Map<string, number[]>()
  private gridDirty = true

  addStatic(box: THREE.Box3, tag = 'world'): Collider {
    const collider: Collider = { box, tag, enabled: true }
    this.statics.push(collider)
    this.gridDirty = true
    return collider
  }

  setDynamic(id: string, box: THREE.Box3, tag = 'dynamic'): void {
    this.dynamics.set(id, { box, tag, enabled: true })
  }

  removeDynamic(id: string): void {
    this.dynamics.delete(id)
  }

  markDirty(): void {
    this.gridDirty = true
  }

  private rebuildGrid(): void {
    this.grid = new Map()
    this.statics.forEach((collider, index) => {
      const { min, max } = collider.box
      for (let cx = Math.floor(min.x / CELL); cx <= Math.floor(max.x / CELL); cx++) {
        for (let cz = Math.floor(min.z / CELL); cz <= Math.floor(max.z / CELL); cz++) {
          const k = key(cx, cz)
          const bucket = this.grid.get(k)
          if (bucket) bucket.push(index)
          else this.grid.set(k, [index])
        }
      }
    })
    this.gridDirty = false
  }

  /** Alle aktiven Collider, die eine Box beruehren koennten. */
  query(box: THREE.Box3, ignoreTag?: string): Collider[] {
    if (this.gridDirty) this.rebuildGrid()
    const found: Collider[] = []
    const seen = new Set<number>()
    for (let cx = Math.floor(box.min.x / CELL); cx <= Math.floor(box.max.x / CELL); cx++) {
      for (let cz = Math.floor(box.min.z / CELL); cz <= Math.floor(box.max.z / CELL); cz++) {
        const bucket = this.grid.get(key(cx, cz))
        if (!bucket) continue
        for (const index of bucket) {
          if (seen.has(index)) continue
          seen.add(index)
          const collider = this.statics[index]
          if (!collider.enabled) continue
          if (ignoreTag && collider.tag === ignoreTag) continue
          if (collider.box.intersectsBox(box)) found.push(collider)
        }
      }
    }
    for (const collider of this.dynamics.values()) {
      if (!collider.enabled) continue
      if (ignoreTag && collider.tag === ignoreTag) continue
      if (collider.box.intersectsBox(box)) found.push(collider)
    }
    return found
  }

  /** Prueft, ob ein Volumen frei ist - Grundlage des Safe-Exit-Sweeps. */
  isFree(box: THREE.Box3, ignoreTag?: string): boolean {
    return this.query(box, ignoreTag).length === 0
  }

  /** Naechster Treffer entlang eines Strahls, fuer die Kamerakollision. */
  rayHitDistance(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): number {
    if (this.gridDirty) this.rebuildGrid()
    const ray = new THREE.Ray(origin, direction)
    const end = origin.clone().addScaledVector(direction, maxDistance)
    const sweep = new THREE.Box3().setFromPoints([origin, end])
    const hitPoint = new THREE.Vector3()
    let nearest = maxDistance
    for (const collider of this.query(sweep)) {
      if (collider.tag === 'nocam') continue
      if (ray.intersectBox(collider.box, hitPoint)) {
        nearest = Math.min(nearest, origin.distanceTo(hitPoint))
      }
    }
    return nearest
  }

  /** Hoehe der obersten Flaeche unter einem Punkt (Boden, Treppe, Dach). */
  groundHeightAt(x: number, z: number, fromY: number, radius = 0.2, ignoreTag?: string): number {
    const probe = new THREE.Box3(
      new THREE.Vector3(x - radius, -200, z - radius),
      new THREE.Vector3(x + radius, fromY, z + radius),
    )
    let best = -200
    for (const collider of this.query(probe, ignoreTag)) {
      if (collider.box.max.y <= fromY + 0.01) best = Math.max(best, collider.box.max.y)
    }
    return best
  }
}

export interface MoveResult {
  grounded: boolean
  hitWall: boolean
  stepped: boolean
}

const tmpBox = new THREE.Box3()

/**
 * Der Fusspunkt wird minimal angehoben. Ohne diesen Epsilon beruehrt die
 * Figur beim Stehen die Bodenbox, Box3.intersectsBox meldet eine Kollision -
 * und die seitliche Aufloesung schiebt sie quer ueber die ganze Bodenplatte.
 */
const GROUND_EPSILON = 0.06

function boxAt(position: THREE.Vector3, half: THREE.Vector3, target: THREE.Box3): THREE.Box3 {
  target.min.set(position.x - half.x, position.y + GROUND_EPSILON, position.z - half.z)
  target.max.set(position.x + half.x, position.y + half.y * 2, position.z + half.z)
  return target
}

/**
 * Achsenweises Move-and-Slide mit Stufenautomatik.
 * stepHeight 0,35 m deckt Bordstein (0,15 m) und Treppenstufe (0,16 m) ab,
 * ohne dass Fynnox auf Bruestungen (1,1 m) klettert.
 */
export function moveAndSlide(
  world: CollisionWorld,
  position: THREE.Vector3,
  half: THREE.Vector3,
  motion: THREE.Vector3,
  stepHeight = 0.35,
  ignoreTag?: string,
): MoveResult {
  let hitWall = false
  let stepped = false

  for (const axis of ['x', 'z'] as const) {
    const delta = motion[axis]
    if (delta === 0) continue
    position[axis] += delta
    const hits = world.query(boxAt(position, half, tmpBox), ignoreTag)
    if (hits.length === 0) continue

    // Erst versuchen hochzusteigen, sonst zurueckdruecken.
    const stepTop = Math.max(...hits.map((h) => h.box.max.y))
    const rise = stepTop - position.y
    if (rise > 0 && rise <= stepHeight) {
      const raised = position.clone()
      raised.y = stepTop + 0.001
      if (world.isFree(boxAt(raised, half, tmpBox), ignoreTag)) {
        position.y = raised.y
        stepped = true
        continue
      }
    }

    hitWall = true
    // Nur die groesste noetige Korrektur anwenden, nicht die Summe aller
    // Treffer - sonst addieren sich ueberlappende Boxen zu einem Sprung.
    let push = 0
    for (const hit of hits) {
      const candidate =
        delta > 0
          ? hit.box.min[axis] - (position[axis] + half[axis]) - 0.0001
          : hit.box.max[axis] - (position[axis] - half[axis]) + 0.0001
      push = delta > 0 ? Math.min(push, candidate) : Math.max(push, candidate)
    }
    // Sicherheitsnetz gegen absurde Korrekturen an sehr grossen Boxen.
    const limit = Math.abs(delta) + half[axis] * 2 + 0.5
    position[axis] += Math.abs(push) > limit ? -delta : push
  }

  let grounded = false
  if (motion.y !== 0) {
    position.y += motion.y
    const hits = world.query(boxAt(position, half, tmpBox), ignoreTag)
    if (hits.length > 0) {
      if (motion.y <= 0) {
        position.y = Math.max(...hits.map((h) => h.box.max.y))
        grounded = true
      } else {
        position.y = Math.min(...hits.map((h) => h.box.min.y)) - half.y * 2 - 0.001
      }
    }
  }

  if (!grounded) {
    const ground = world.groundHeightAt(position.x, position.z, position.y + 0.05, half.x * 0.9, ignoreTag)
    if (position.y - ground < 0.06 && motion.y <= 0) {
      position.y = ground
      grounded = true
    }
  }

  return { grounded, hitWall, stepped }
}
