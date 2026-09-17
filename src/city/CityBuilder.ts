import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import { cylinder, sphere, torus } from '../core/Shapes'
import type { InstanceModel, WorldBuilder } from '../world/WorldBuilder'
import { CURB_HEIGHT, rampRoad, retainingWall, stairDressing } from '../world/District'
import {
  AWNINGS,
  BALCONY,
  BENCH,
  BUSH,
  BUS_STOP,
  CARS,
  CROSSWALK,
  DOOR,
  FLOODLIGHT,
  FUEL_PUMP,
  GOAL,
  HOOP,
  LANE_DASH,
  PALM,
  PLANTER,
  RAIL,
  ROOF_UNIT,
  SHOP_WINDOW,
  STREET_LAMP,
  TOWER_BAY,
  TREES,
  WINDOW,
  WINDOW_FLOWERS,
  WINDOW_SHUTTER,
  quarterPipe,
} from './CityModels'
import { BOULEVARD_Z, CITY, GRID_X, GRID_Z, rand, type Block, type CityPlan, type Rect } from './CityPlan'

const FLOOR = 3.2
const SHOP_FLOOR = 4.0
const MODULE = 2.5

type Face = 'north' | 'south' | 'east' | 'west'

/** Drehung um Y, die die Modell-Vorderseite (+Z) auf die Fassadenseite legt. */
const FACE_ROT: Record<Face, number> = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 }

const WALLS = [COLORS.wallCream, COLORS.wallCoral, COLORS.wallCream, COLORS.groundTeal, COLORS.stone, COLORS.townFarBlue]

/**
 * Baut die grosse Stadt aus dem Plan.
 *
 * Details liegen in `near`, Umrisse in `far`. Kollision wird immer gesetzt -
 * sie haengt nicht an der Sichtbarkeit, sonst liefe man in der Ferne durch
 * Haeuser, die gerade nur als Umriss stehen.
 */
export function buildCity(b: WorldBuilder, plan: CityPlan): void {
  // Grundstufe ist `far`: Gelaende, Strassen und Gehwege stehen immer, werfen
  // keine Schatten und werden je Kachel geschnitten. In `all` waeren sie mit
  // dem Hafenviertel zu einem Mesh je Farbe ueber die ganze Stadt verschmolzen -
  // nie aus dem Blickfeld zu schneiden und jedes Bild im Schattenpass.
  b.withDetail('far', () => {
    buildTerrain(b)
    buildTerraceSides(b, plan)
    buildHarborMile(b)
    buildStreets(b, plan)
    buildSidewalks(b, plan)
    for (const block of plan.blocks) buildBlock(b, block)
    buildEdge(b)
  })
}

// --- Gelaende ----------------------------------------------------------------

function buildTerrain(b: WorldBuilder): void {
  const ground = (x0: number, x1: number, z0: number, z1: number, top: number, color: string = COLORS.paving) =>
    b.box({ x: (x0 + x1) / 2, y: -4, z: (z0 + z1) / 2, w: x1 - x0, h: top + 4, d: z1 - z0, color })

  for (const side of [-1, 1]) {
    const x0 = side < 0 ? CITY.west : CITY.sliceHalf
    const x1 = side < 0 ? -CITY.sliceHalf : CITY.east
    ground(x0, x1, CITY.lowerFrom, CITY.quay, 0)
    ground(x0, x1, CITY.upperFrom, CITY.lowerFrom, CITY.lowerY)
    ground(x0, x1, CITY.upperBack, CITY.upperFrom, CITY.upperY)
    // Kaimauer und Beckenboden laufen die ganze Kueste entlang.
    b.box({ x: (x0 + x1) / 2, y: -3, z: 34.4, w: x1 - x0, h: 3, d: 0.8, color: COLORS.concrete })
    b.box({ x: (x0 + x1) / 2, y: -6, z: 72, w: x1 - x0, h: 3, d: 80, color: COLORS.navyMid, collide: false })
  }
  ground(CITY.west, CITY.east, CITY.north, CITY.upperBack, CITY.upperY)
  // Seebett jenseits des Hafenbeckens bis zur gegenueberliegenden Kueste.
  b.box({ x: 0, y: -8, z: 700, w: 3600, h: 2, d: 1240, color: COLORS.navyMid, collide: false })

  // Land jenseits der Stadtgrenze. Unerreichbar, aber ohne diese Flaechen
  // stuende die Stadt am Rand ueber dem Nichts.
  b.withDetail('far', () => {
    for (const side of [-1, 1]) {
      const x = side * (CITY.east + 520)
      b.box({ x, y: -1, z: -6, w: 1040, h: 1, d: 80, color: COLORS.hinterland, collide: false })
      b.box({ x, y: -1, z: -1223, w: 1040, h: CITY.upperY + 1, d: 2354, color: COLORS.hinterland, collide: false })
    }
    b.box({ x: 0, y: -1, z: -1510, w: 1120, h: CITY.upperY + 1, d: 1780, color: COLORS.hinterland, collide: false })
  })
}

/** Stuetzmauern, Rampen, Treppen und Haeuserzeilen der Terrassen links und rechts der Hangstadt. */
function buildTerraceSides(b: WorldBuilder, plan: CityPlan): void {
  const skip = (x: number, spans: [number, number][]) => spans.some(([a, c]) => x > a && x < c)

  for (const side of [-1, 1] as const) {
    const lowerRamp = plan.lowerRamps.find((r) => Math.sign(r.x) === side)!
    const upperRamp = plan.upperRamps.find((r) => Math.sign(r.x) === side)!
    const lowerSpan: [number, number] = [
      Math.min(lowerRamp.x, lowerRamp.x + lowerRamp.dir * (lowerRamp.rise / 0.06)) - 2,
      Math.max(lowerRamp.x, lowerRamp.x + lowerRamp.dir * (lowerRamp.rise / 0.06)) + 2,
    ]
    const upperSpan: [number, number] = [
      Math.min(upperRamp.x, upperRamp.x + upperRamp.dir * (upperRamp.rise / 0.06)) - 2,
      Math.max(upperRamp.x, upperRamp.x + upperRamp.dir * (upperRamp.rise / 0.06)) + 2,
    ]
    // Stuetzmauern in Abschnitten, ausgespart dort, wo eine Rampe anliegt.
    for (const [z, top, drop, span] of [
      [CITY.lowerFrom, CITY.lowerY, CITY.lowerY, lowerSpan],
      [CITY.upperFrom, CITY.upperY, CITY.upperY - CITY.lowerY, upperSpan],
    ] as [number, number, number, [number, number]][]) {
      const cuts = [CITY.sliceHalf, side < 0 ? -span[1] : span[0], side < 0 ? -span[0] : span[1], CITY.east]
      for (let i = 0; i < cuts.length; i += 2) {
        const a = cuts[i]
        const c = cuts[i + 1]
        if (c - a < 1) continue
        b.withDetail('near', () =>
          retainingWall(b, { x: side * (a + c) / 2, z, length: c - a, top, drop }),
        )
      }
    }
    b.withDetail('near', () => {
    for (const ramp of [lowerRamp, upperRamp]) {
      for (const [dz, width, color, lift] of [
        [0, 6, COLORS.asphalt, 0],
        [3.8, 2, COLORS.concrete, CURB_HEIGHT],
      ] as [number, number, string, number][]) {
        rampRoad(b, {
          x: ramp.x,
          z: ramp.z + dz,
          y: ramp.y + lift,
          width,
          rise: ramp.rise,
          axis: 'x',
          dir: ramp.dir,
          color,
          baseY: ramp.y - 1,
        })
      }
    }
    })
    // Treppen liegen VOR der Kante und steigen zu ihr hinauf. Eine Treppe, die
    // an der Kante beginnt, steckt mit allen Stufen im Terrassenkoerper.
    for (const stair of plan.lowerStairs.filter((s) => Math.sign(s.x) === side)) {
      const z = CITY.lowerFrom + 20 * 0.3
      b.withDetail('near', () => b.stairs({ x: stair.x, y: 0, z, width: 5, steps: 20, color: COLORS.concrete, dir: 'north' }))
      b.withDetail('near', () => stairDressing(b, { x: stair.x, y: 0, z, width: 5, steps: 20, dir: 'north' }))
    }
    for (const stair of plan.upperStairs.filter((s) => Math.sign(s.x) === side)) {
      const z = CITY.upperFrom + 20 * 0.3
      b.withDetail('near', () => b.stairs({ x: stair.x, y: CITY.lowerY, z, width: 4, steps: 40, color: COLORS.concrete, dir: 'north' }))
      b.withDetail('near', () =>
        stairDressing(b, { x: stair.x, y: CITY.lowerY, z, width: 4, steps: 40, dir: 'north' }),
      )
    }

    const x0 = side < 0 ? CITY.west : CITY.sliceHalf
    const x1 = side < 0 ? -CITY.sliceHalf : CITY.east
    const cx = (x0 + x1) / 2
    const w = x1 - x0
    // Terrassenstrassen und Gehwege in derselben Lage wie in der Hangstadt.
    b.box({ x: cx, y: CITY.lowerY, z: -64, w, h: 0.012, d: 6, color: COLORS.asphalt, collide: false })
    b.box({ x: cx, y: CITY.upperY, z: -99, w, h: 0.012, d: 6, color: COLORS.asphalt, collide: false })
    for (const [y, z, depth] of [
      [CITY.lowerY, -47, 2],
      [CITY.lowerY, -60.6, 1.2],
      [CITY.upperY, -78, 12],
      [CITY.upperY, -96.6, 1.2],
      [CITY.upperY, -101.4, 1.2],
    ] as [number, number, number][]) {
      b.box({ x: cx, y, z, w, h: CURB_HEIGHT, d: depth, color: COLORS.concrete })
    }

    // Haeuserzeilen. Stufen und Rampen bleiben frei.
    let seed = side < 0 ? 5000 : 6000
    const stairsLower = plan.lowerStairs.map((s) => Math.abs(s.x))
    const stairsUpper = plan.upperStairs.map((s) => Math.abs(s.x))
    for (const [rowY, z0, depth, shop] of [
      [CITY.lowerY, -60, 12, true],
      [CITY.upperY, -96, 12, false],
      [CITY.upperY, -112, 10, false],
    ] as [number, number, number, boolean][]) {
      for (let ax = CITY.sliceHalf + 3; ax < CITY.east - 14; ax += 15) {
        seed += 3
        if (rand(seed) < 0.14) continue
        const bw = 11 + Math.round(rand(seed + 1) * 2)
        const mid = ax + bw / 2
        if (rowY === CITY.lowerY && stairsUpper.some((s) => Math.abs(s - mid) < 10)) continue
        if (rowY === CITY.lowerY && stairsLower.some((s) => Math.abs(s - mid) < 8)) continue
        const upperAbs: [number, number] = [Math.min(Math.abs(upperSpan[0]), Math.abs(upperSpan[1])), Math.max(Math.abs(upperSpan[0]), Math.abs(upperSpan[1]))]
        if (skip(mid, [[upperAbs[0] - 6, upperAbs[1] + 6]]) && rowY === CITY.lowerY) continue
        const bx0 = side < 0 ? -ax - bw : ax
        building(b, {
          x0: bx0,
          z0,
          w: bw,
          d: depth,
          y: rowY,
          floors: 3 + Math.floor(rand(seed + 2) * 3),
          wall: WALLS[Math.floor(rand(seed + 3) * WALLS.length)],
          face: z0 === -112 ? 'north' : 'south',
          shop,
          seed,
        })
      }
      // Baeume und Laternen vor der Zeile.
      b.withDetail('near', () => {
        for (let ax = CITY.sliceHalf + 8; ax < CITY.east - 4; ax += 12) {
          const x = side * ax
          if (rowY === CITY.lowerY) {
            b.instance(STREET_LAMP, { pos: [x, CITY.lowerY + CURB_HEIGHT, -46.6], rot: [0, Math.PI, 0] })
          } else if (z0 === -96) {
            b.instance(TREES[(ax / 12) % 3 | 0], { pos: [x + 6, CITY.upperY + CURB_HEIGHT, -75] })
            b.instance(STREET_LAMP, { pos: [x, CITY.upperY + CURB_HEIGHT, -72.8] })
          }
        }
      })
    }
  }
}

/** Boulevard, Promenade und Kai der Hafenmeile links und rechts des Hafenviertels. */
function buildHarborMile(b: WorldBuilder): void {
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? CITY.west : CITY.sliceHalf
    const x1 = side < 0 ? -CITY.sliceHalf : CITY.east
    const cx = (x0 + x1) / 2
    const w = x1 - x0
    for (const z of [BOULEVARD_Z - 4, BOULEVARD_Z + 4]) {
      b.box({ x: cx, y: 0, z, w, h: CURB_HEIGHT, d: 2, color: COLORS.concrete })
    }
    for (const edge of [-2.88, 2.88]) {
      b.box({ x: cx, y: 0, z: BOULEVARD_Z + edge, w, h: 0.02, d: 0.14, color: COLORS.cream, collide: false })
    }
    for (const rail of [-0.75, 0.75]) {
      b.box({ x: cx, y: 0, z: BOULEVARD_Z + rail, w, h: 0.06, d: 0.12, color: COLORS.metal, collide: false })
    }
    // Promenade mit Gelaender am Kai.
    b.box({ x: cx, y: 0, z: 29, w, h: CURB_HEIGHT, d: 6, color: COLORS.paving })
    b.box({ x: cx, y: 0, z: 25.4, w, h: CURB_HEIGHT + 0.01, d: 1.2, color: COLORS.stone })
    b.withDetail('near', () => {
      b.railing({ x: cx, z: 32.2, y: CURB_HEIGHT, length: w, axis: 'x', color: COLORS.metal, tag: 'nocam' })
      for (let ax = CITY.sliceHalf + 6; ax < CITY.east; ax += 14) {
        const x = side * ax
        plant(b, PALM, x, CURB_HEIGHT, 27.4, ax * 0.7)
        lamp(b, x + 7, CURB_HEIGHT, 31.2, Math.PI)
        b.instance(BENCH, { pos: [x + 3.5, CURB_HEIGHT, 30.6], rot: [0, Math.PI, 0] })
        if ((ax / 14) % 3 < 1) b.instance(PLANTER, { pos: [x - 3.5, CURB_HEIGHT, 30.2] })
      }
      for (let ax = CITY.sliceHalf + 10; ax < CITY.east; ax += 20) {
        for (const z of [BOULEVARD_Z - 4.4, BOULEVARD_Z + 4.4]) {
          lamp(b, side * ax, CURB_HEIGHT, z, z < BOULEVARD_Z ? 0 : Math.PI)
        }
        plant(b, TREES[(ax / 20) % 2 | 0], side * (ax + 10), CURB_HEIGHT, BOULEVARD_Z - 4.4)
      }
      b.instance(BUS_STOP, { pos: [side * 200, CURB_HEIGHT, BOULEVARD_Z - 4.6] })
      b.instance(BUS_STOP, { pos: [side * 420, CURB_HEIGHT, BOULEVARD_Z + 4.6], rot: [0, Math.PI, 0] })
    })
  }
}

// --- Strassen und Gehwege ----------------------------------------------------

/** Laterne mit Kollision - durch einen Mast laeuft man nicht hindurch. */
function lamp(b: WorldBuilder, x: number, y: number, z: number, rot: number): void {
  b.instance(STREET_LAMP, { pos: [x, y, z], rot: [0, rot, 0] })
  b.collisionAdd(new THREE.Box3(new THREE.Vector3(x - 0.2, y, z - 0.2), new THREE.Vector3(x + 0.2, y + 4.4, z + 0.2)), 'nocam')
}

/** Baum mit Stammkollision. Die Krone bleibt durchlaessig. */
function plant(b: WorldBuilder, model: InstanceModel, x: number, y: number, z: number, rot = 0): void {
  b.instance(model, { pos: [x, y, z], rot: [0, rot, 0] })
  b.collisionAdd(new THREE.Box3(new THREE.Vector3(x - 0.3, y, z - 0.3), new THREE.Vector3(x + 0.3, y + 3, z + 0.3)), 'nocam')
}

function buildStreets(b: WorldBuilder, plan: CityPlan): void {
  for (const street of plan.streets) {
    const { road, y, axis } = street
    b.box({
      x: (road.x0 + road.x1) / 2,
      y,
      z: (road.z0 + road.z1) / 2,
      w: road.x1 - road.x0,
      h: 0.012,
      d: road.z1 - road.z0,
      color: COLORS.asphalt,
      collide: false,
    })
    b.withDetail('near', () => {
      if (axis === 'z') {
        const x = (road.x0 + road.x1) / 2
        for (let z = road.z0 + 4; z < road.z1 - 2; z += 7) b.instance(LANE_DASH, { pos: [x, y, z] })
      } else {
        const z = (road.z0 + road.z1) / 2
        // Auf dem Boulevard liegt mittig das Gleis, dort kein Mittelstrich.
        if (y > 0) {
          for (let x = road.x0 + 4; x < road.x1 - 2; x += 7) b.instance(LANE_DASH, { pos: [x, y, z], rot: [0, Math.PI / 2, 0] })
        }
      }
    })
  }
  // Zebrastreifen vor jeder Kreuzung der Oberstadt.
  b.withDetail('near', () => {
    for (const x of GRID_X) {
      for (const z of GRID_Z) {
        const stadium = x === GRID_X[10]
        if (z !== GRID_Z[0] && !(stadium && z === GRID_Z[3])) b.instance(CROSSWALK, { pos: [x, CITY.upperY, z + 6.2] })
        if (z !== GRID_Z[6] && !(stadium && z === GRID_Z[4])) b.instance(CROSSWALK, { pos: [x, CITY.upperY, z - 6.2] })
        b.instance(CROSSWALK, { pos: [x + 6.2, CITY.upperY, z], rot: [0, Math.PI / 2, 0] })
        b.instance(CROSSWALK, { pos: [x - 6.2, CITY.upperY, z], rot: [0, Math.PI / 2, 0] })
      }
    }
  })
}

function buildSidewalks(b: WorldBuilder, plan: CityPlan): void {
  const y = CITY.upperY
  for (const { outer } of plan.sidewalks) {
    const w = outer.x1 - outer.x0
    const d = outer.z1 - outer.z0
    const cx = (outer.x0 + outer.x1) / 2
    const cz = (outer.z0 + outer.z1) / 2
    b.box({ x: cx, y, z: outer.z0 + 1, w, h: CURB_HEIGHT, d: 2, color: COLORS.concrete })
    b.box({ x: cx, y, z: outer.z1 - 1, w, h: CURB_HEIGHT, d: 2, color: COLORS.concrete })
    b.box({ x: outer.x0 + 1, y, z: cz, w: 2, h: CURB_HEIGHT, d: d - 4, color: COLORS.concrete })
    b.box({ x: outer.x1 - 1, y, z: cz, w: 2, h: CURB_HEIGHT, d: d - 4, color: COLORS.concrete })
    // Bordsteinkante als helle Linie - ohne sie verschwimmt der Gehweg mit der
    // Fahrbahn, sobald die Sonne flach steht.
    b.withDetail('near', () => {
      for (const [x, z, ww, dd] of [
        [cx, outer.z0 + 0.1, w, 0.2],
        [cx, outer.z1 - 0.1, w, 0.2],
        [outer.x0 + 0.1, cz, 0.2, d],
        [outer.x1 - 0.1, cz, 0.2, d],
      ]) {
        b.box({ x, y: y + CURB_HEIGHT, z, w: ww, h: 0.01, d: dd, color: COLORS.stone, collide: false })
      }
      // Laternen und Baeume entlang der Kanten, mit Blick zur Fahrbahn.
      const alongX = (z: number, rot: number) => {
        for (let x = outer.x0 + 8; x < outer.x1 - 6; x += 24) {
          lamp(b, x, y + CURB_HEIGHT, z, rot)
          plant(b, TREES[Math.abs(Math.round(x / 24)) % 3], x + 12, y + CURB_HEIGHT, z)
        }
      }
      const alongZ = (x: number, rot: number) => {
        for (let z = outer.z0 + 8; z < outer.z1 - 6; z += 24) {
          lamp(b, x, y + CURB_HEIGHT, z, rot)
          plant(b, TREES[Math.abs(Math.round(z / 24)) % 3], x, y + CURB_HEIGHT, z + 12)
        }
      }
      alongX(outer.z0 + 0.7, Math.PI)
      alongX(outer.z1 - 0.7, 0)
      alongZ(outer.x0 + 0.7, -Math.PI / 2)
      alongZ(outer.x1 - 0.7, Math.PI / 2)
    })
  }
  // Streifen zwischen Hangstadt und erster Strasse der Oberstadt.
  b.box({ x: 0, y, z: -115.5, w: CITY.east - CITY.west, h: CURB_HEIGHT, d: 7, color: COLORS.concrete })
  // Nordrand: Gruenstreifen mit Baumreihe vor der Bergregion.
  b.box({ x: 0, y, z: (CITY.north + GRID_Z[6] - 3) / 2, w: CITY.east - CITY.west, h: 0.05, d: GRID_Z[6] - 3 - CITY.north, color: COLORS.lawn, collide: false })
  b.withDetail('near', () => {
    for (let x = CITY.west + 6; x < CITY.east; x += 9) {
      b.instance(TREES[Math.abs(x) % 2], { pos: [x, y, CITY.north + 6 + rand(x) * 5], rot: [0, x, 0] })
    }
  })
}

// --- Bauwerke ----------------------------------------------------------------

interface BuildingSpec {
  x0: number
  z0: number
  w: number
  d: number
  y: number
  floors: number
  wall: string
  face: Face
  shop: boolean
  seed: number
  /** Seiten ohne Fenster: Hofseite und Waende, die an Nachbarn stossen. */
  blind?: Face[]
}

/**
 * Wohn- und Geschaeftshaus der grossen Stadt.
 *
 * Leichter gebaut als `buildFacadeBuilding()` im Hafenviertel: dort ist jedes
 * Fenster aus fuenf eigenen Kisten verschmolzen, hier ein Instanzmodell. Das
 * Hafenviertel hat 40 Haeuser, die Stadt ueber tausend - mit der schweren
 * Bauweise kaemen einige hundert Megabyte Geometrie zusammen.
 */
function building(b: WorldBuilder, s: BuildingSpec): void {
  const ground = s.shop ? SHOP_FLOOR : FLOOR
  const height = ground + (s.floors - 1) * FLOOR
  const cx = s.x0 + s.w / 2
  const cz = s.z0 + s.d / 2
  const top = s.y + height

  b.collisionAdd(new THREE.Box3(new THREE.Vector3(s.x0, s.y, s.z0), new THREE.Vector3(s.x0 + s.w, top + 0.25, s.z0 + s.d)))

  b.withDetail('far', () => {
    b.box({ x: cx, y: s.y, z: cz, w: s.w - 0.16, h: height - 0.1, d: s.d - 0.16, color: s.wall, collide: false })
    b.box({ x: cx, y: top - 0.2, z: cz, w: s.w - 0.2, h: 0.05, d: s.d - 0.2, color: COLORS.roof, collide: false })
  })

  b.withDetail('near', () => {
    const put = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) =>
      b.box({ x, y: s.y + y, z, w, h, d, color, collide: false })
    const groundColor = s.shop ? COLORS.groundTeal : s.wall === COLORS.stone ? COLORS.stoneShade : COLORS.stone
    put(cx, 0, cz, s.w, ground, s.d, groundColor)
    put(cx, ground, cz, s.w, height - ground, s.d, s.wall)
    put(cx, 0, cz, s.w + 0.24, 0.5, s.d + 0.24, COLORS.stoneShade)
    for (const [lx, lz] of [
      [s.x0 + 0.2, s.z0 + 0.2],
      [s.x0 + s.w - 0.2, s.z0 + 0.2],
      [s.x0 + 0.2, s.z0 + s.d - 0.2],
      [s.x0 + s.w - 0.2, s.z0 + s.d - 0.2],
    ]) {
      put(lx, 0, lz, 0.5, height, 0.5, COLORS.stone)
    }
    put(cx, ground - 0.15, cz, s.w + 0.3, 0.3, s.d + 0.3, COLORS.stone)
    put(cx, height - 0.45, cz, s.w + 0.5, 0.45, s.d + 0.5, COLORS.stone)
    put(cx, height, cz, s.w + 0.3, 0.25, s.d + 0.3, COLORS.roof)
    for (const [x, z, w, d] of [
      [cx, s.z0 + 0.1, s.w + 0.3, 0.25],
      [cx, s.z0 + s.d - 0.1, s.w + 0.3, 0.25],
      [s.x0 + 0.1, cz, 0.25, s.d],
      [s.x0 + s.w - 0.1, cz, 0.25, s.d],
    ]) {
      put(x, height + 0.25, z, w, 0.7, d, s.wall)
    }
    if (s.w > 9 && s.d > 9) {
      b.instance(ROOF_UNIT, { pos: [cx - 1.5 + rand(s.seed) * 2, top + 0.25, cz - 1], rot: [0, Math.floor(rand(s.seed + 1) * 4) * (Math.PI / 2), 0] })
    }

    const windowModel = [WINDOW, WINDOW_SHUTTER, WINDOW_FLOWERS][Math.floor(rand(s.seed + 5) * 3)]
    const balconies = rand(s.seed + 6) > 0.45
    const awning = AWNINGS[Math.floor(rand(s.seed + 7) * AWNINGS.length)]

    for (const face of ['north', 'south', 'east', 'west'] as Face[]) {
      if (s.blind?.includes(face)) continue
      const alongX = face === 'north' || face === 'south'
      const length = alongX ? s.w : s.d
      const columns = Math.floor((length - 1) / MODULE)
      if (columns < 1) continue
      const planeZ = face === 'south' ? s.z0 + s.d : face === 'north' ? s.z0 : cz
      const planeX = face === 'east' ? s.x0 + s.w : face === 'west' ? s.x0 : cx
      const rot: [number, number, number] = [0, FACE_ROT[face], 0]
      const isFront = face === s.face
      for (let c = 0; c < columns; c++) {
        const t = (c - (columns - 1) / 2) * MODULE
        const px = alongX ? cx + t : planeX
        const pz = alongX ? planeZ : cz + t
        for (let r = 0; r < s.floors - 1; r++) {
          const wy = top - height + ground + r * FLOOR + 0.9
          b.instance(windowModel, { pos: [px, wy, pz], rot })
          if (isFront && balconies && c % 2 === 1 && c < columns - 1) {
            b.instance(BALCONY, { pos: [px, wy - 0.72, pz], rot })
          }
        }
        if (isFront && s.shop) {
          b.instance(SHOP_WINDOW, { pos: [px, s.y, pz], rot })
          if (c % 2 === 0) b.instance(awning, { pos: [px, s.y, pz], rot })
        } else if (!s.shop && c !== Math.floor(columns / 2)) {
          b.instance(windowModel, { pos: [px, s.y + 0.95, pz], rot })
        }
      }
      if (isFront) {
        const doorT = alongX ? cx : cz
        const px = alongX ? doorT + (s.shop ? 0 : 0) : planeX
        const pz = alongX ? planeZ : doorT
        if (!s.shop) b.instance(DOOR, { pos: [px, s.y, pz], rot })
      }
    }
  })
}

/** Hochhaus mit Glasraster und Sockelgeschoss. */
function tower(b: WorldBuilder, x0: number, z0: number, w: number, d: number, y: number, floors: number, seed: number): void {
  const podium = 2
  const height = podium * SHOP_FLOOR + (floors - podium) * FLOOR
  const cx = x0 + w / 2
  const cz = z0 + d / 2
  const top = y + height
  b.collisionAdd(new THREE.Box3(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x0 + w, top, z0 + d)))

  const body = rand(seed) > 0.5 ? COLORS.towerBody : COLORS.wallCream
  b.withDetail('far', () => {
    b.box({ x: cx, y, z: cz, w: w - 0.2, h: height - 0.1, d: d - 0.2, color: COLORS.towerGlass, collide: false })
    for (let f = podium + 1; f < floors; f += 2) {
      const fy = y + podium * SHOP_FLOOR + (f - podium) * FLOOR
      b.box({ x: cx, y: fy, z: cz, w: w + 0.1, h: 0.3, d: d + 0.1, color: body, collide: false })
    }
  })
  b.withDetail('near', () => {
    b.box({ x: cx, y, z: cz, w: w + 1.2, h: podium * SHOP_FLOOR, d: d + 1.2, color: COLORS.groundTeal, collide: false })
    b.box({ x: cx, y: y + podium * SHOP_FLOOR, z: cz, w, h: height - podium * SHOP_FLOOR, d, color: body, collide: false })
    for (let f = podium; f < floors; f++) {
      const fy = y + podium * SHOP_FLOOR + (f - podium) * FLOOR
      b.box({ x: cx, y: fy - 0.02, z: cz, w: w + 0.3, h: 0.35, d: d + 0.3, color: COLORS.stone, collide: false })
      for (const face of ['north', 'south', 'east', 'west'] as Face[]) {
        const alongX = face === 'north' || face === 'south'
        const length = alongX ? w : d
        const bays = Math.floor(length / 3)
        for (let c = 0; c < bays; c++) {
          const t = (c - (bays - 1) / 2) * 3
          b.instance(TOWER_BAY, {
            pos: [
              alongX ? cx + t : face === 'east' ? x0 + w : x0,
              fy,
              alongX ? (face === 'south' ? z0 + d : z0) : cz + t,
            ],
            rot: [0, FACE_ROT[face], 0],
          })
        }
      }
    }
    // Krone: zurueckgesetzter Aufbau und Antenne - die Skyline braucht Spitzen.
    b.box({ x: cx, y: top, z: cz, w: w * 0.6, h: 4, d: d * 0.6, color: COLORS.stone, collide: false })
    b.shape(cylinder(0.25, 0.4, 14, 8), COLORS.metal, { pos: [cx, top + 11, cz] })
    for (const face of ['north', 'south', 'east', 'west'] as Face[]) {
      const alongX = face === 'north' || face === 'south'
      const length = alongX ? w + 1.2 : d + 1.2
      const n = Math.floor(length / MODULE) - 1
      for (let c = 0; c < n; c++) {
        const t = (c - (n - 1) / 2) * MODULE
        b.instance(SHOP_WINDOW, {
          pos: [
            alongX ? cx + t : face === 'east' ? x0 + w + 0.6 : x0 - 0.6,
            y,
            alongX ? (face === 'south' ? z0 + d + 0.6 : z0 - 0.6) : cz + t,
          ],
          rot: [0, FACE_ROT[face], 0],
        })
      }
    }
  })
}

function buildBlock(b: WorldBuilder, block: Block): void {
  switch (block.kind) {
    case 'residential':
      return perimeterBlock(b, block, false)
    case 'shops':
      return block.y === 0 ? harborRow(b, block) : perimeterBlock(b, block, true)
    case 'downtown':
      return downtownBlock(b, block)
    case 'plaza':
      return plazaBlock(b, block)
    case 'park':
      return parkBlock(b, block)
    case 'stadium':
      return stadiumBlock(b, block)
    case 'pitch':
      return pitchBlock(b, block)
    case 'skatepark':
      return skateparkBlock(b, block)
    case 'courts':
      return courtsBlock(b, block)
    case 'gas':
      return gasBlock(b, block)
    case 'market':
      return marketBlock(b, block)
    case 'arena':
      return arenaBlock(b, block)
  }
}

const size = (r: Rect) => ({ w: r.x1 - r.x0, d: r.z1 - r.z0, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2 })

/** Flaeche knapp ueber dem Boden, damit sie nicht gegen das Gelaende flimmert. */
function surface(b: WorldBuilder, r: Rect, y: number, color: string, lift = 0.03): void {
  const { w, d, cx, cz } = size(r)
  b.box({ x: cx, y, z: cz, w, h: lift, d, color, collide: false })
}

/** Randbebauung um einen Innenhof - die typische Stadtbauweise der Referenzen. */
function perimeterBlock(b: WorldBuilder, block: Block, shops: boolean): void {
  const { lot, y } = block
  let seed = block.seed
  const centre = Math.hypot((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2 + 280)
  const baseFloors = shops ? 3 : Math.max(3, Math.round(6 - centre / 140))
  const depth = 12 + Math.floor(rand(seed) * 3)
  const OPPOSITE: Record<Face, Face> = { north: 'south', south: 'north', east: 'west', west: 'east' }
  const place = (x0: number, z0: number, w: number, d: number, face: Face, blind: Face[]) => {
    seed += 5
    building(b, {
      blind: [OPPOSITE[face], ...blind],
      x0,
      z0,
      w,
      d,
      y,
      floors: baseFloors + Math.floor(rand(seed + 1) * 3),
      wall: WALLS[Math.floor(rand(seed + 2) * WALLS.length)],
      face,
      shop: shops || rand(seed + 3) > 0.7,
      seed,
    })
  }
  const row = (from: number, to: number, fixed: number, alongX: boolean, face: Face) => {
    let t = from
    while (to - t >= 10) {
      seed += 3
      let w = 12 + Math.floor(rand(seed) * 9)
      if (to - t - w < 10) w = to - t
      if (rand(seed + 9) < 0.12 && to - t > 30) {
        t += 4
        continue
      }
      // Seitenwaende innerhalb der Zeile stossen an den Nachbarn; nur die
      // Enden der Zeile zeigen zur Strasse.
      const first = t <= from + 0.1
      const last = t + w >= to - 10
      const sides: Face[] = alongX ? ['west', 'east'] : ['north', 'south']
      const blind = alongX ? sides.filter((_, i) => (i === 0 ? !first : !last)) : sides
      if (alongX) place(t, fixed, w, depth, face, blind)
      else place(fixed, t, depth, w, face, blind)
      t += w + (rand(seed + 4) < 0.3 ? 1.5 : 0)
    }
  }
  row(lot.x0, lot.x1, lot.z1 - depth, true, 'south')
  row(lot.x0, lot.x1, lot.z0, true, 'north')
  row(lot.z0 + depth + 1, lot.z1 - depth - 1, lot.x0, false, 'west')
  row(lot.z0 + depth + 1, lot.z1 - depth - 1, lot.x1 - depth, false, 'east')

  // Innenhof mit Rasen und Baeumen.
  const court: Rect = { x0: lot.x0 + depth + 2, x1: lot.x1 - depth - 2, z0: lot.z0 + depth + 2, z1: lot.z1 - depth - 2 }
  if (court.x1 - court.x0 > 8 && court.z1 - court.z0 > 8) {
    surface(b, court, y, COLORS.lawn)
    b.withDetail('near', () => {
      const { cx, cz } = size(court)
      for (let i = 0; i < 4; i++) {
        b.instance(TREES[(block.seed + i) % 3], {
          pos: [cx + (rand(seed + i) - 0.5) * (court.x1 - court.x0 - 6), y, cz + (rand(seed + i + 20) - 0.5) * (court.z1 - court.z0 - 6)],
          rot: [0, i, 0],
        })
      }
      b.instance(BENCH, { pos: [cx, y, cz + 3] })
    })
  }
}

/** Ladenzeile nordlich des Hafenboulevards. */
function harborRow(b: WorldBuilder, block: Block): void {
  const { lot, y } = block
  let seed = block.seed
  let x = lot.x0
  const depth = Math.min(16, lot.z1 - lot.z0)
  while (lot.x1 - x >= 10) {
    seed += 3
    let w = 12 + Math.floor(rand(seed) * 8)
    if (lot.x1 - x - w < 10) w = lot.x1 - x
    building(b, {
      x0: x,
      z0: lot.z1 - depth,
      w,
      d: depth,
      y,
      floors: 2 + Math.floor(rand(seed + 1) * 3),
      wall: WALLS[Math.floor(rand(seed + 2) * WALLS.length)],
      face: 'south',
      shop: true,
      seed,
      blind: ['north'],
    })
    x += w + (rand(seed + 4) < 0.25 ? 3 : 0)
  }
  b.withDetail('near', () => {
    for (let px = lot.x0 + 5; px < lot.x1; px += 11) {
      b.instance(TREES[Math.abs(px) % 3], { pos: [px, y, lot.z0 + 2.5] })
    }
  })
}

function downtownBlock(b: WorldBuilder, block: Block): void {
  const { lot, y, seed } = block
  const { w, d } = size(lot)
  surface(b, lot, y, COLORS.paving, CURB_HEIGHT)
  const count = 2 + Math.floor(rand(seed) * 2)
  const cols = count === 2 ? 2 : 2
  const cellW = w / cols
  const cellD = d / 2
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const rowIndex = Math.floor(i / cols)
    const fw = 20 + Math.floor(rand(seed + i) * 8)
    const fd = 18 + Math.floor(rand(seed + i + 3) * 8)
    const x0 = lot.x0 + col * cellW + (cellW - fw) / 2
    const z0 = lot.z0 + rowIndex * cellD + (cellD - fd) / 2
    const floors = 12 + Math.floor(rand(seed + i + 7) * 20)
    tower(b, x0, z0, fw, fd, y + CURB_HEIGHT, floors, seed + i)
  }
  if (count === 2) {
    // Freier Teil als kleiner Platz mit Baeumen.
    b.withDetail('near', () => {
      for (let i = 0; i < 6; i++) {
        b.instance(TREES[i % 3], { pos: [lot.x0 + 8 + i * ((w - 16) / 5), y + CURB_HEIGHT, lot.z1 - 12] })
        b.instance(BENCH, { pos: [lot.x0 + 12 + i * ((w - 16) / 5), y + CURB_HEIGHT, lot.z1 - 8] })
      }
    })
  }
}

function plazaBlock(b: WorldBuilder, block: Block): void {
  const { lot, y } = block
  const { cx, cz, w, d } = size(lot)
  surface(b, lot, y, COLORS.paving, CURB_HEIGHT)
  const top = y + CURB_HEIGHT
  // Brunnen in der Mitte: Becken, Wasser, Saeule mit Schalen.
  b.shape(cylinder(9, 9.4, 0.8, 32), COLORS.stone, { pos: [cx, top + 0.4, cz] }, { collide: true, tag: 'nocam' })
  b.shape(cylinder(8.4, 8.4, 0.1, 32), COLORS.water, { pos: [cx, top + 0.72, cz] })
  b.shape(cylinder(0.8, 1.1, 3.2, 12), COLORS.stone, { pos: [cx, top + 2.2, cz] })
  b.shape(cylinder(3, 2.2, 0.4, 20), COLORS.stone, { pos: [cx, top + 2.6, cz] })
  b.shape(cylinder(1.6, 1.2, 0.3, 16), COLORS.stone, { pos: [cx, top + 4.0, cz] })
  b.shape(sphere(0.6, 12, 8), COLORS.gold, { pos: [cx, top + 4.6, cz] })
  b.withDetail('near', () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      b.instance(TREES[i % 3], { pos: [cx + Math.cos(a) * (w / 2 - 7), top, cz + Math.sin(a) * (d / 2 - 7)] })
      b.instance(BENCH, { pos: [cx + Math.cos(a) * 13, top, cz + Math.sin(a) * 13], rot: [0, -a - Math.PI / 2, 0] })
      if (i % 2) b.instance(PLANTER, { pos: [cx + Math.cos(a + 0.2) * 17, top, cz + Math.sin(a + 0.2) * 17] })
    }
    for (const [x, z] of [[lot.x0 + 3, lot.z0 + 3], [lot.x1 - 3, lot.z0 + 3], [lot.x0 + 3, lot.z1 - 3], [lot.x1 - 3, lot.z1 - 3]]) {
      b.instance(STREET_LAMP, { pos: [x, top, z] })
    }
  })
}

function parkBlock(b: WorldBuilder, block: Block): void {
  const { lot, y, seed } = block
  const { cx, cz, w, d } = size(lot)
  surface(b, lot, y, COLORS.lawn)
  // Wegekreuz.
  b.box({ x: cx, y, z: cz, w: 4, h: 0.06, d, color: COLORS.sand, collide: false })
  b.box({ x: cx, y, z: cz, w, h: 0.06, d: 4, color: COLORS.sand, collide: false })
  // Teich in einem Viertel.
  const px = cx + w * 0.22
  const pz = cz - d * 0.22
  const pond = Math.min(w, d) * 0.16
  b.shape(cylinder(pond + 0.6, pond + 0.6, 0.35, 28), COLORS.stone, { pos: [px, y + 0.17, pz] }, { collide: true, tag: 'nocam' })
  b.shape(cylinder(pond, pond, 0.1, 28), COLORS.water, { pos: [px, y + 0.33, pz] })
  // Spielplatz: Sandflaeche, Rutsche, Schaukel.
  const gx = cx - w * 0.22
  const gz = cz + d * 0.22
  b.box({ x: gx, y, z: gz, w: 14, h: 0.08, d: 12, color: COLORS.sand, collide: false })
  b.withDetail('near', () => {
    b.box({ x: gx - 3, y, z: gz, w: 1.6, h: 2.2, d: 1.6, color: COLORS.coral })
    b.shape(new THREE.BoxGeometry(0.9, 0.1, 3.6), COLORS.gold, { pos: [gx - 3, y + 1.2, gz + 2.3], rot: [0.62, 0, 0] })
    for (const sx of [-1, 1]) {
      b.shape(cylinder(0.08, 0.08, 2.6, 8), COLORS.groundTeal, { pos: [gx + 3 + sx * 1.6, y + 1.2, gz], rot: [0, 0, sx * 0.25] })
    }
    b.shape(cylinder(0.07, 0.07, 3.4, 8), COLORS.groundTeal, { pos: [gx + 3, y + 2.5, gz], rot: [0, 0, Math.PI / 2] })
    b.box({ x: gx + 2.4, y: y + 0.5, z: gz, w: 0.5, h: 0.06, d: 0.3, color: COLORS.coral, collide: false })
    b.box({ x: gx + 3.6, y: y + 0.5, z: gz, w: 0.5, h: 0.06, d: 0.3, color: COLORS.gold, collide: false })

    for (let i = 0; i < 38; i++) {
      const tx = lot.x0 + 4 + rand(seed + i * 3) * (w - 8)
      const tz = lot.z0 + 4 + rand(seed + i * 5) * (d - 8)
      if (Math.abs(tx - cx) < 5 || Math.abs(tz - cz) < 5) continue
      if (Math.hypot(tx - px, tz - pz) < pond + 4) continue
      if (Math.abs(tx - gx) < 9 && Math.abs(tz - gz) < 8) continue
      b.instance(rand(seed + i) > 0.25 ? TREES[i % 3] : BUSH, { pos: [tx, y, tz], rot: [0, i, 0] })
    }
    for (let i = 1; i < 6; i++) {
      b.instance(BENCH, { pos: [cx + 3.2, y, lot.z0 + (i * d) / 6], rot: [0, -Math.PI / 2, 0] })
      b.instance(STREET_LAMP, { pos: [cx - 2.6, y, lot.z0 + (i * d) / 6 + 4], rot: [0, Math.PI / 2, 0] })
    }
  })
}

/** Linien eines Spielfelds: Aussenlinie, Mittellinie, Mittelkreis, Strafraeume. */
function pitchLines(b: WorldBuilder, cx: number, cz: number, length: number, width: number, y: number): void {
  const line = (x: number, z: number, w: number, d: number) =>
    b.box({ x, y: y + 0.03, z, w, h: 0.012, d, color: COLORS.cream, collide: false })
  line(cx, cz - width / 2, length, 0.12)
  line(cx, cz + width / 2, length, 0.12)
  line(cx - length / 2, cz, 0.12, width)
  line(cx + length / 2, cz, 0.12, width)
  line(cx, cz, 0.12, width)
  b.shape(torus(Math.min(9.15, width * 0.18), 0.06, 4, 40), COLORS.cream, { pos: [cx, y + 0.04, cz], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.2] })
  const boxL = Math.min(16.5, length * 0.16)
  const boxW = Math.min(40.3, width * 0.6)
  for (const sx of [-1, 1]) {
    const x = cx + sx * (length / 2 - boxL)
    line(x, cz, 0.12, boxW)
    line(cx + sx * (length / 2 - boxL / 2), cz - boxW / 2, boxL, 0.12)
    line(cx + sx * (length / 2 - boxL / 2), cz + boxW / 2, boxL, 0.12)
  }
}

/** Rasen mit Maehstreifen quer zur Spielrichtung. */
function stripedLawn(b: WorldBuilder, cx: number, cz: number, length: number, width: number, y: number): void {
  b.box({ x: cx, y, z: cz, w: length + 6, h: 0.02, d: width + 6, color: COLORS.lawn, collide: false })
  const stripes = 10
  for (let i = 0; i < stripes; i += 2) {
    b.box({
      x: cx - length / 2 + (i + 0.5) * (length / stripes),
      y: y + 0.02,
      z: cz,
      w: length / stripes,
      h: 0.006,
      d: width,
      color: COLORS.lawnStripe,
      collide: false,
    })
  }
}

function stadiumBlock(b: WorldBuilder, block: Block): void {
  const { lot, y } = block
  const { cx, cz, w, d } = size(lot)
  surface(b, lot, y, COLORS.paving, CURB_HEIGHT)
  const base = y + CURB_HEIGHT
  const length = 96
  const width = 44
  stripedLawn(b, cx, cz, length, width, base)
  b.withDetail('near', () => {
    pitchLines(b, cx, cz, length, width, base + 0.02)
    b.instance(GOAL, { pos: [cx - length / 2, base, cz], rot: [0, Math.PI / 2, 0] })
    b.instance(GOAL, { pos: [cx + length / 2, base, cz], rot: [0, -Math.PI / 2, 0] })
  })

  // Tribuenen: Stufen mit Sitzreihen in zwei Farben. Jede Reihe steigt 0,55 m -
  // hoeher als die Stufenautomatik, man springt also von Reihe zu Reihe wie im
  // echten Stadion ueber die Sitze. Die Aufgaenge an den Enden sind Treppen.
  const tiers = 8
  const stand = (x: number, z: number, len: number, alongX: boolean, sign: number) => {
    for (let t = 0; t < tiers; t++) {
      const offset = 3 + t * 0.9
      const h = 0.55 * (t + 1)
      const color = t % 2 ? COLORS.seatCoral : COLORS.seatTeal
      b.box({
        x: alongX ? x : x + sign * offset,
        y: base,
        z: alongX ? z + sign * offset : z,
        w: alongX ? len : 0.9,
        h,
        d: alongX ? 0.9 : len,
        color,
      })
    }
    const back = 3 + tiers * 0.9
    b.box({
      x: alongX ? x : x + sign * (back + 0.3),
      y: base,
      z: alongX ? z + sign * (back + 0.3) : z,
      w: alongX ? len : 0.6,
      h: tiers * 0.55 + 2.4,
      d: alongX ? 0.6 : len,
      color: COLORS.wallCream,
    })
    // Dach ueber den Laengstribuenen, auf schlanken Stuetzen.
    if (alongX) {
      b.withDetail('near', () => {
        b.box({ x, y: base + tiers * 0.55 + 6, z: z + sign * (back / 2 + 1), w: len + 2, h: 0.4, d: back + 3, color: COLORS.domeRoof, collide: false })
        for (let i = 0; i <= 6; i++) {
          b.shape(cylinder(0.18, 0.18, tiers * 0.55 + 6, 8), COLORS.metal, {
            pos: [x - len / 2 + (i * len) / 6, base + (tiers * 0.55 + 6) / 2, z + sign * (back + 0.8)],
          })
        }
      })
    }
  }
  stand(cx, cz - width / 2 - 1, length + 8, true, -1)
  stand(cx, cz + width / 2 + 1, length + 8, true, 1)
  stand(cx - length / 2 - 3, cz, width, false, -1)
  stand(cx + length / 2 + 3, cz, width, false, 1)
  b.withDetail('near', () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.instance(FLOODLIGHT, {
        pos: [cx + sx * (length / 2 + 14), base, cz + sz * (width / 2 + 13)],
        rot: [0, Math.atan2(-sx, -sz), 0],
      })
    }
    // Vorplatz mit Parkplaetzen an der Laengsseite.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        b.instance(CARS[(i + (sx > 0 ? 2 : 0)) % CARS.length], { pos: [cx + sx * (w / 2 - 5), base, cz - 24 + i * 6], rot: [0, Math.PI / 2, 0] })
      }
    }
  })
  void d
}

function pitchBlock(b: WorldBuilder, block: Block): void {
  const { lot, y } = block
  const { cx, cz, w, d } = size(lot)
  const length = Math.min(w - 14, 68)
  const width = Math.min(d - 10, 42)
  stripedLawn(b, cx, cz, length, width, y)
  b.withDetail('near', () => {
    pitchLines(b, cx, cz, length, width, y + 0.02)
    b.instance(GOAL, { pos: [cx - length / 2, y, cz], rot: [0, Math.PI / 2, 0] })
    b.instance(GOAL, { pos: [cx + length / 2, y, cz], rot: [0, -Math.PI / 2, 0] })
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.instance(FLOODLIGHT, { pos: [cx + sx * (length / 2 + 4), y, cz + sz * (width / 2 + 3.5)], rot: [0, Math.atan2(-sx, -sz), 0] })
    }
    for (let i = 0; i < 3; i++) b.instance(BENCH, { pos: [cx - 4 + i * 4, y, cz - width / 2 - 2.2], rot: [0, 0, 0] })
    ballFence(b, { x0: cx - length / 2 - 5, x1: cx + length / 2 + 5, z0: cz - width / 2 - 4, z1: cz + width / 2 + 4 }, y, 4)
  })
}

/** Ballfangzaun mit Pfosten und Netz; an der Laengsseite bleibt ein Tor offen. */
function ballFence(b: WorldBuilder, r: Rect, y: number, height: number): void {
  const { cx, cz, w, d } = size(r)
  const gate = 4
  for (const [x, z, len, alongX] of [
    [cx, r.z0, w, true],
    [r.x0, cz, d, false],
    [r.x1, cz, d, false],
  ] as [number, number, number, boolean][]) {
    b.box({ x, y, z, w: alongX ? len : 0.05, h: height, d: alongX ? 0.05 : len, color: COLORS.iron, collide: false })
    b.collisionAdd(new THREE.Box3(new THREE.Vector3(x - (alongX ? len / 2 : 0.1), y, z - (alongX ? 0.1 : len / 2)), new THREE.Vector3(x + (alongX ? len / 2 : 0.1), y + height, z + (alongX ? 0.1 : len / 2))), 'nocam')
  }
  for (const side of [-1, 1]) {
    const len = (w - gate) / 2
    const x = cx + side * (gate / 2 + len / 2)
    b.box({ x, y, z: r.z1, w: len, h: height, d: 0.05, color: COLORS.iron, collide: false })
    b.collisionAdd(new THREE.Box3(new THREE.Vector3(x - len / 2, y, r.z1 - 0.1), new THREE.Vector3(x + len / 2, y + height, r.z1 + 0.1)), 'nocam')
  }
  for (let x = r.x0; x <= r.x1; x += 4) {
    b.box({ x, y, z: r.z0, w: 0.1, h: height + 0.2, d: 0.1, color: COLORS.metal, collide: false })
    b.box({ x, y, z: r.z1, w: 0.1, h: height + 0.2, d: 0.1, color: COLORS.metal, collide: false })
  }
}

/**
 * Stufen-Kollision unter einer gekruemmten Rampe.
 *
 * `CollisionWorld` kennt keine Schraegen. Die Viertelpipe bekommt deshalb
 * Kollisionsstufen unter 0,35 m, solange ihr Profil flach genug ist - man
 * laeuft den unteren Teil hinauf, der steile obere Teil bleibt eine Kante.
 */
function pipeCollision(b: WorldBuilder, x: number, z: number, y: number, width: number, facing: 1 | -1): void {
  const radius = 2.4
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2) * 0.86
    const depth = radius - Math.sin(a) * radius
    const h = radius - Math.cos(a) * radius
    const z0 = z + facing * depth
    b.collisionAdd(
      new THREE.Box3(
        new THREE.Vector3(x - width / 2, y, Math.min(z0, z - facing * 0.6)),
        new THREE.Vector3(x + width / 2, y + h, Math.max(z0, z - facing * 0.6)),
      ),
      'nocam',
    )
  }
}

const PIPE_8 = quarterPipe(8)
const PIPE_12 = quarterPipe(12)

function skateparkBlock(b: WorldBuilder, block: Block): void {
  const { lot, y } = block
  const { cx, cz, w, d } = size(lot)
  const pad: Rect = { x0: lot.x0 + 3, x1: lot.x1 - 3, z0: lot.z0 + 3, z1: lot.z1 - 3 }
  surface(b, pad, y, COLORS.skateConcrete, 0.1)
  const top = y + 0.1

  // Halfpipe: zwei Viertelpipes gegenueber, 9 m Flat dazwischen.
  const hx = cx - w * 0.22
  const flat = 9
  const hz0 = cz - flat / 2 - 2.4
  const hz1 = cz + flat / 2 + 2.4
  b.withDetail('near', () => {
    b.instance(PIPE_12, { pos: [hx, top, hz0] })
    b.instance(PIPE_12, { pos: [hx, top, hz1], rot: [0, Math.PI, 0] })
  })
  pipeCollision(b, hx, hz0, top, 12, 1)
  pipeCollision(b, hx, hz1, top, 12, -1)
  b.withDetail('far', () => {
    b.box({ x: hx, y: top, z: hz0 - 0.6, w: 12, h: 1.8, d: 1.2, color: COLORS.skateConcrete, collide: false })
    b.box({ x: hx, y: top, z: hz1 + 0.6, w: 12, h: 1.8, d: 1.2, color: COLORS.skateConcrete, collide: false })
  })

  // Street-Bereich: Funbox mit Rampen, Ledge, Rails, Stufenset, Viertelpipe am Rand.
  const sx = cx + w * 0.18
  b.box({ x: sx, y: top, z: cz, w: 6, h: 0.6, d: 4, color: COLORS.skateConcrete })
  for (const dir of [-1, 1]) {
    b.shape(new THREE.BoxGeometry(6, 0.12, 3.2), COLORS.skateConcrete, { pos: [sx, top + 0.3, cz + dir * 3.5], rot: [dir * 0.19, 0, 0] })
    for (let i = 1; i <= 3; i++) {
      b.collisionAdd(new THREE.Box3(new THREE.Vector3(sx - 3, top, cz + dir * (2 + (3 - i) * 1.0) - 0.5), new THREE.Vector3(sx + 3, top + i * 0.2, cz + dir * (2 + (3 - i) * 1.0) + 0.5)), 'nocam')
    }
  }
  b.box({ x: sx + 8, y: top, z: cz - 6, w: 1.2, h: 0.45, d: 8, color: COLORS.stone, tag: 'nocam' })
  b.withDetail('near', () => {
    b.instance(RAIL, { pos: [sx - 8, top, cz - 5] })
    b.instance(RAIL, { pos: [sx + 9, top, cz + 7], rot: [0, Math.PI / 2, 0] })
    b.instance(PIPE_8, { pos: [cx + w * 0.3, top, pad.z0 + 0.8] })
  })
  pipeCollision(b, cx + w * 0.3, pad.z0 + 0.8, top, 8, 1)
  b.stairs({ x: sx - 1, y: top, z: pad.z1 - 3, width: 5, steps: 4, color: COLORS.skateConcrete, dir: 'south' })

  // Graffitiwaende und Zuschauerbaenke - die Farbe des Ortes.
  const panels = [COLORS.coral, COLORS.groundTeal, COLORS.gold, COLORS.bloom, COLORS.courtBlue]
  for (let i = 0; i < 5; i++) {
    b.box({ x: pad.x0 + 6 + i * 4.2, y: top, z: pad.z1 - 0.6, w: 4, h: 2.2, d: 0.4, color: panels[i], tag: 'nocam' })
  }
  b.withDetail('near', () => {
    for (let i = 0; i < 4; i++) b.instance(BENCH, { pos: [pad.x1 - 4 - i * 3, top, pad.z1 - 1.5], rot: [0, Math.PI, 0] })
    b.instance(STREET_LAMP, { pos: [pad.x0 + 1, top, pad.z0 + 1] })
    b.instance(STREET_LAMP, { pos: [pad.x1 - 1, top, pad.z0 + 1] })
  })
  void d
}

function courtsBlock(b: WorldBuilder, block: Block): void {
  const { lot, y } = block
  const { cx, cz, w, d } = size(lot)
  const courtL = 28
  const courtW = 15
  const alongX = w >= d
  const count = Math.max(1, Math.min(3, Math.floor((alongX ? w : d) / (courtL + 6))))
  for (let i = 0; i < count; i++) {
    const t = (i - (count - 1) / 2) * (courtL + 6)
    const x = alongX ? cx + t : cx
    const z = alongX ? cz : cz + t
    const r: Rect = alongX
      ? { x0: x - courtL / 2 - 2, x1: x + courtL / 2 + 2, z0: z - courtW / 2 - 2, z1: z + courtW / 2 + 2 }
      : { x0: x - courtW / 2 - 2, x1: x + courtW / 2 + 2, z0: z - courtL / 2 - 2, z1: z + courtL / 2 + 2 }
    surface(b, r, y, COLORS.courtGreen, 0.04)
    const inner: Rect = alongX
      ? { x0: x - courtL / 2, x1: x + courtL / 2, z0: z - courtW / 2, z1: z + courtW / 2 }
      : { x0: x - courtW / 2, x1: x + courtW / 2, z0: z - courtL / 2, z1: z + courtL / 2 }
    surface(b, inner, y + 0.01, i % 2 ? COLORS.courtBlue : COLORS.tartan, 0.04)
    b.withDetail('near', () => {
      const len = alongX ? courtL : courtW
      const wid = alongX ? courtW : courtL
      const line = (lx: number, lz: number, lw: number, ld: number) =>
        b.box({ x: lx, y: y + 0.055, z: lz, w: lw, h: 0.01, d: ld, color: COLORS.cream, collide: false })
      line(x, z - wid / 2, len, 0.08)
      line(x, z + wid / 2, len, 0.08)
      line(x - len / 2, z, 0.08, wid)
      line(x + len / 2, z, 0.08, wid)
      if (alongX) {
        line(x, z, 0.08, wid)
        b.shape(torus(1.8, 0.04, 4, 28), COLORS.cream, { pos: [x, y + 0.06, z], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.2] })
        b.instance(HOOP, { pos: [x - courtL / 2 + 1.2, y, z], rot: [0, Math.PI / 2, 0] })
        b.instance(HOOP, { pos: [x + courtL / 2 - 1.2, y, z], rot: [0, -Math.PI / 2, 0] })
      } else {
        line(x, z, wid, 0.08)
        b.instance(HOOP, { pos: [x, y, z - courtL / 2 + 1.2], rot: [0, 0, 0] })
        b.instance(HOOP, { pos: [x, y, z + courtL / 2 - 1.2], rot: [0, Math.PI, 0] })
      }
      ballFence(b, r, y, 3)
    })
  }
  void d
}

function gasBlock(b: WorldBuilder, block: Block): void {
  const { lot, y, seed } = block
  const { cz, w, d } = size(lot)
  // Asphalt nur unter dem Tankdach und der Zufahrt. Die ganze Parzelle in
  // Asphalt war im Bild eine 110 m breite schwarze Flaeche.
  const roofW = Math.min(30, w - 16)
  const roofD = 16
  const rx = lot.x0 + roofW / 2 + 4
  const rz = cz
  surface(b, lot, y, COLORS.paving, 0.01)
  surface(b, { x0: lot.x0, x1: rx + roofW / 2 + 6, z0: rz - roofD / 2 - 4, z1: lot.z1 }, y + 0.01, COLORS.asphalt, 0.01)
  const top = y + 0.02
  b.box({ x: rx, y: top + 5.2, z: rz, w: roofW, h: 0.6, d: roofD, color: COLORS.wallCream, collide: false })
  b.box({ x: rx, y: top + 5.0, z: rz, w: roofW + 0.3, h: 0.3, d: roofD + 0.3, color: COLORS.coral, collide: false })
  for (const px of [-1, 0, 1]) {
    for (const pz of [-1, 1]) {
      b.shape(cylinder(0.3, 0.3, 5.2, 12), COLORS.stone, { pos: [rx + px * (roofW / 2 - 2), top + 2.6, rz + pz * (roofD / 2 - 2)] }, { collide: true, tag: 'nocam' })
    }
  }
  b.withDetail('near', () => {
    for (const px of [-1, 1]) {
      for (const pz of [-0.5, 0.5]) {
        b.instance(FUEL_PUMP, { pos: [rx + px * (roofW / 4), top, rz + pz * 7] })
      }
    }
    for (let i = 0; i < 3; i++) {
      b.instance(CARS[(seed + i) % CARS.length], { pos: [rx - roofW / 4 + i * (roofW / 4) + 2.4, top, rz + (i % 2 ? 3 : -3)], rot: [0, Math.PI / 2, 0] })
    }
  })
  // Tankstellenshop mit Pylon.
  const shopW = Math.min(18, w - roofW - 12)
  if (shopW >= 10) {
    building(b, { x0: lot.x1 - shopW - 2, z0: cz - 6, w: shopW, d: 12, y: top, floors: 1, wall: COLORS.wallCream, face: 'west', shop: true, seed })
  }
  const px = lot.x0 + 2
  const pz = lot.z1 - 3
  b.box({ x: px, y: top, z: pz, w: 1.6, h: 8, d: 0.6, color: COLORS.navy })
  b.box({ x: px, y: top + 6, z: pz, w: 1.8, h: 1.8, d: 0.7, color: COLORS.coral, collide: false })
  for (let i = 0; i < 3; i++) {
    b.box({ x: px, y: top + 1.6 + i * 1.3, z: pz, w: 1.7, h: 0.9, d: 0.66, color: COLORS.cream, collide: false })
  }
  void d
}

function marketBlock(b: WorldBuilder, block: Block): void {
  const { lot, y, seed } = block
  const { cx, w, d } = size(lot)
  surface(b, lot, y, COLORS.asphalt, 0.02)
  const top = y + 0.02
  const hallW = Math.min(52, w - 8)
  const hallD = Math.min(26, d * 0.5)
  const hz0 = lot.z0 + 2
  const hx = cx
  // Markthalle: flacher Koerper, Glasfront, farbiges Dachband und Tonnendach.
  b.box({ x: hx, y: top, z: hz0 + hallD / 2, w: hallW, h: 7, d: hallD, color: COLORS.wallCream })
  b.box({ x: hx, y: top + 7, z: hz0 + hallD / 2, w: hallW + 0.6, h: 0.8, d: hallD + 0.6, color: COLORS.groundTeal, collide: false })
  b.shape(cylinder(hallD / 2, hallD / 2, hallW - 2, 20, ), COLORS.domeRoof, {
    pos: [hx, top + 7.8, hz0 + hallD / 2],
    rot: [0, 0, Math.PI / 2],
    scale: [0.28, 1, 1],
  })
  b.withDetail('near', () => {
    const n = Math.floor((hallW - 4) / MODULE)
    for (let i = 0; i < n; i++) {
      const x = hx - ((n - 1) / 2) * MODULE + i * MODULE
      b.instance(SHOP_WINDOW, { pos: [x, top, hz0 + hallD], rot: [0, 0, 0] })
      if (i % 3 === 1) b.instance(AWNINGS[(seed + i) % AWNINGS.length], { pos: [x, top, hz0 + hallD] })
    }
    // Parkplatz mit Linien und Autos.
    const rows = 2
    for (let r = 0; r < rows; r++) {
      const pz = hz0 + hallD + 8 + r * 12
      if (pz > lot.z1 - 4) break
      for (let i = 0; i < Math.floor((w - 8) / 3); i++) {
        const px = lot.x0 + 5 + i * 3
        b.instance(LANE_DASH, { pos: [px - 1.5, top, pz], rot: [0, 0, 0], scale: [1, 1, 1.6] })
        if (rand(seed + r * 31 + i) > 0.45) b.instance(CARS[(i + r) % CARS.length], { pos: [px, top, pz], rot: [0, r % 2 ? 0 : Math.PI, 0] })
      }
    }
    for (let i = 0; i < 4; i++) b.instance(PLANTER, { pos: [lot.x0 + 3, top, lot.z0 + 6 + i * 6] })
  })
}

/** Veranstaltungshalle "Fynnox Dome" fuer spaetere Sportevents und Konzerte. */
function arenaBlock(b: WorldBuilder, block: Block): void {
  const { lot, y } = block
  const { cx, cz, w, d } = size(lot)
  surface(b, lot, y, COLORS.paving, CURB_HEIGHT)
  const top = y + CURB_HEIGHT
  const radius = Math.min(w, d) / 2 - 7
  const wallH = 13
  b.shape(cylinder(radius, radius, wallH, 48), COLORS.wallCream, { pos: [cx, top + wallH / 2, cz] })
  b.shape(cylinder(radius + 0.4, radius + 0.4, 2.2, 48), COLORS.towerGlass, { pos: [cx, top + 7.4, cz] })
  b.shape(cylinder(radius + 0.8, radius + 0.8, 0.9, 48), COLORS.coral, { pos: [cx, top + wallH, cz] })
  b.shape(cylinder(radius + 0.3, radius + 0.6, 1.2, 48), COLORS.stoneShade, { pos: [cx, top + 0.6, cz] })
  // Kuppel: flach gestauchte Halbkugel mit Oberlicht.
  const dome = new THREE.SphereGeometry(radius + 0.6, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2)
  b.shape(dome, COLORS.domeRoof, { pos: [cx, top + wallH + 0.4, cz], scale: [1, 0.34, 1] })
  b.shape(cylinder(5, 6, 2.4, 24), COLORS.towerGlass, { pos: [cx, top + wallH + radius * 0.34 + 0.8, cz] })
  // Kollision als Scheiben quer durch den Kreis.
  for (let k = -3; k <= 3; k++) {
    const zc = cz + (k / 3.5) * radius
    const half = Math.sqrt(Math.max(0, radius * radius - (zc - cz) ** 2))
    b.collisionAdd(new THREE.Box3(new THREE.Vector3(cx - half, top, zc - radius / 7), new THREE.Vector3(cx + half, top + wallH + 6, zc + radius / 7)))
  }
  b.withDetail('near', () => {
    // Portal zur Strasse hin und Fahnenmasten auf dem Vorplatz.
    const facing = block.front === 'east' ? 1 : -1
    const px = cx + facing * (radius + 1.5)
    b.box({ x: px, y: top, z: cz, w: 3, h: 7, d: 14, color: COLORS.groundTeal, collide: false })
    b.box({ x: px + facing * 1.6, y: top + 5.6, z: cz, w: 0.3, h: 1.2, d: 12, color: COLORS.gold, collide: false })
    for (let i = -2; i <= 2; i++) {
      b.instance(SHOP_WINDOW, { pos: [px + facing * 1.5, top, cz + i * 2.5], rot: [0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0] })
    }
    const flags = [COLORS.coral, COLORS.groundTeal, COLORS.gold, COLORS.courtBlue, COLORS.bloom, COLORS.coral]
    for (let i = 0; i < 6; i++) {
      const fz = lot.z0 + 6 + i * ((d - 12) / 5)
      const fx = cx + facing * (w / 2 - 3)
      b.shape(cylinder(0.08, 0.1, 9, 8), COLORS.metal, { pos: [fx, top + 4.5, fz] })
      b.box({ x: fx + facing * 0.8, y: top + 6.6, z: fz, w: 1.6, h: 2.2, d: 0.05, color: flags[i], collide: false })
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3
      b.instance(PLANTER, { pos: [cx + Math.cos(a) * (radius + 4), top, cz + Math.sin(a) * (radius + 4)] })
      b.instance(STREET_LAMP, { pos: [cx + Math.cos(a + 0.4) * (radius + 5), top, cz + Math.sin(a + 0.4) * (radius + 5)], rot: [0, -a, 0] })
    }
  })
}

// --- Rand ----------------------------------------------------------------------

/**
 * Unsichtbare Grenze der begehbaren Stadt.
 *
 * Dahinter liegt Land ohne Kollision und die Kulisse. Ein Spieler soll dort
 * nicht ins Leere laufen, aber auch keine Mauer sehen - der Baumsaum am
 * Nordrand und das Hinterland verdecken, dass hier Schluss ist.
 */
function buildEdge(b: WorldBuilder): void {
  const tall = 80
  const wall = (x0: number, x1: number, z0: number, z1: number) =>
    b.collisionAdd(new THREE.Box3(new THREE.Vector3(x0, -10, z0), new THREE.Vector3(x1, tall, z1)), 'nocam')
  wall(CITY.west - 2, CITY.west, CITY.north, CITY.quay)
  wall(CITY.east, CITY.east + 2, CITY.north, CITY.quay)
  wall(CITY.west, CITY.east, CITY.north - 2, CITY.north)
  b.withDetail('near', () => {
    for (const side of [-1, 1]) {
      for (let z = CITY.north + 4; z < CITY.lowerFrom; z += 8) {
        const y = z < CITY.upperFrom ? CITY.upperY : CITY.lowerY
        b.instance(TREES[Math.abs(z) % 2], { pos: [side * (CITY.east - 2.5), y, z], rot: [0, z, 0] })
      }
    }
  })
}
