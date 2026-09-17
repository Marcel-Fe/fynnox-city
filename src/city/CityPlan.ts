/**
 * Stadtplan von Fynnox City - reine Daten, keine Geometrie.
 *
 * Bis 17.09.2026 war die begehbare Welt das handgebaute Hafenviertel mit
 * 160 x 146 m. Der Nutzer will eine richtige Stadt: "riesig", mit Shops,
 * Tankstellen, Skaterparks und Fussballplaetzen, und ohne dass man ein Ende
 * sieht. Der Plan legt deshalb um das Hafenviertel herum drei Zonen:
 *
 *   Hafenmeile West/Ost  y = 0     z -46..34, entlang der Kaimauer
 *   Hangterrassen W/O    y = 3,2 / 9,6   dieselbe Staffelung wie die Hangstadt
 *   Oberstadt            y = 9,6   Strassenraster bis z -620
 *
 * Das Hafenviertel selbst bleibt unangetastet - an ihm haengen alle Abnahmen.
 * Alle Kanten stehen hier an einer Stelle. Wer eine verschiebt, sieht die
 * Nachbarn mit (Lehre aus der Tiefenstaffelung der Kulisse, 09.09.2026).
 */

export const CITY = {
  west: -560,
  east: 560,
  /** Kaimauer - suedlich davon Wasser. */
  quay: 34,
  /** Nordrand der Oberstadt. Dahinter ist die Bergregion vorgesehen. */
  north: -620,
  /** Das handgebaute Hafenviertel reicht in x von -80 bis 80. */
  sliceHalf: 80,
  lowerFrom: -46,
  lowerY: 3.2,
  upperFrom: -72,
  upperY: 9.6,
  /** Hinterkante der Hangstadt und damit Suedrand der Oberstadt. */
  upperBack: -112,
  road: 6,
  walk: 2,
} as const

export type BlockKind =
  | 'residential'
  | 'shops'
  | 'downtown'
  | 'plaza'
  | 'park'
  | 'stadium'
  | 'pitch'
  | 'skatepark'
  | 'courts'
  | 'gas'
  | 'market'
  | 'arena'

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface Block {
  /** Bebaubare Flaeche innerhalb des Gehwegs. */
  lot: Rect
  kind: BlockKind
  y: number
  seed: number
  /** Seite, an der die Hauptstrasse liegt - dorthin zeigen Schaufenster. */
  front: 'north' | 'south' | 'east' | 'west'
  /** Name fuer Karte und Nachweise. */
  label: string
}

export interface Street {
  /** Fahrbahn. */
  road: Rect
  y: number
  axis: 'x' | 'z'
}

export interface Ramp {
  x: number
  z: number
  y: number
  rise: number
  dir: 1 | -1
}

/** Deterministische Streuung - dieselbe Stadt bei jedem Start. */
export function rand(seed: number): number {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Nord-Sued-Strassen der Oberstadt, alle 80 m. */
export const GRID_X = Array.from({ length: 13 }, (_, i) => -480 + i * 80)
/** Ost-West-Strassen der Oberstadt, alle 80 m nach Norden. */
export const GRID_Z = Array.from({ length: 7 }, (_, j) => -122 - j * 80)

/** Hafenmeile: Querstrassen je Seite, gemessen als Betrag von x. */
export const HARBOR_CROSS = [140, 260, 380, 500]
/** Hauptboulevard der Hafenmeile - dieselbe Achse wie die Strasse im Hafenviertel. */
export const BOULEVARD_Z = -12

/**
 * Sonderbloecke der Oberstadt. Schluessel ist "Spalte,Zeile": Spalte 0 beginnt
 * bei x -560, Zeile 0 liegt direkt hinter der Hangstadt.
 */
const SPECIAL: Record<string, [BlockKind, string]> = {
  '6,0': ['shops', 'Markthallenplatz'],
  '7,0': ['shops', 'Fuchsbau-Arkaden'],
  '5,1': ['downtown', 'Tideline Tower'],
  '6,1': ['plaza', 'Stadtfunken-Platz'],
  '7,1': ['downtown', 'Pawlink Center'],
  '8,1': ['downtown', 'Hafenblick-Tuerme'],
  '6,2': ['downtown', 'Bluefin Plaza'],
  '7,2': ['downtown', 'Skyline Nord'],
  '6,3': ['shops', 'Einkaufsstrasse Sued'],
  '7,3': ['shops', 'Einkaufsstrasse Sued'],
  '6,4': ['shops', 'Einkaufsstrasse Nord'],
  '7,4': ['shops', 'Einkaufsstrasse Nord'],
  '9,1': ['market', 'Frischmarkt'],
  '12,0': ['gas', 'Tankstelle Ost'],
  '1,4': ['gas', 'Tankstelle West'],
  '3,2': ['pitch', 'Fussballplatz Weststadt'],
  '2,2': ['skatepark', 'Skatepark Weststadt'],
  '2,3': ['courts', 'Basketballplaetze'],
  '8,4': ['park', 'Stadtpark'],
  '4,4': ['park', 'Weidenpark'],
  '12,5': ['park', 'Nordpark'],
  '10,3': ['stadium', 'Fynnox Stadion'],
  '9,4': ['arena', 'Fynnox Dome'],
}
/** Das Stadion belegt zwei Bloecke; die Strasse zwischen ihnen entfaellt. */
const MERGED_INTO: Record<string, string> = { '11,3': '10,3' }

export interface CityPlan {
  blocks: Block[]
  streets: Street[]
  /** Gehwegringe um die Bloecke, jeweils die Aussenkante. */
  sidewalks: { outer: Rect; y: number }[]
  lowerRamps: Ramp[]
  upperRamps: Ramp[]
  lowerStairs: { x: number }[]
  upperStairs: { x: number }[]
}

export function createCityPlan(): CityPlan {
  const blocks: Block[] = []
  const streets: Street[] = []
  const sidewalks: CityPlan['sidewalks'] = []
  const pad = CITY.road / 2 + CITY.walk

  // --- Oberstadt ------------------------------------------------------------
  const columnEdges = [CITY.west + 5, ...GRID_X, CITY.east - 5]
  const rowEdges = [...GRID_Z]
  let seed = 1000
  for (let i = 0; i < columnEdges.length - 1; i++) {
    for (let j = 0; j < rowEdges.length - 1; j++) {
      seed += 7
      const id = `${i},${j}`
      if (MERGED_INTO[id]) continue
      let right = columnEdges[i + 1]
      const merged = Object.entries(MERGED_INTO).find(([, target]) => target === id)
      if (merged) right = columnEdges[Number(merged[0].split(',')[0]) + 1]
      const left = columnEdges[i]
      const south = rowEdges[j]
      const north = rowEdges[j + 1]
      const outerLeft = i === 0 ? left : left + CITY.road / 2
      const outerRight = i + 1 === columnEdges.length - 1 ? right : right - CITY.road / 2
      const outer: Rect = { x0: outerLeft, x1: outerRight, z0: north + CITY.road / 2, z1: south - CITY.road / 2 }
      sidewalks.push({ outer, y: CITY.upperY })
      const lot: Rect = {
        x0: outer.x0 + CITY.walk,
        x1: outer.x1 - CITY.walk,
        z0: outer.z0 + CITY.walk,
        z1: outer.z1 - CITY.walk,
      }
      const special = SPECIAL[id]
      const centre = (lot.x0 + lot.x1) / 2
      blocks.push({
        lot,
        kind: special?.[0] ?? 'residential',
        y: CITY.upperY,
        seed,
        front: centre < 0 ? 'east' : 'west',
        label: special?.[1] ?? 'Wohnviertel',
      })
    }
  }
  // Strassen der Oberstadt. Die Nord-Sued-Achse zwischen den Stadionbloecken
  // wird in dieser Zeile ausgespart.
  const stadiumGap = { x: GRID_X[10], z0: GRID_Z[4], z1: GRID_Z[3] }
  for (const x of GRID_X) {
    const segments: [number, number][] =
      x === stadiumGap.x
        ? [
            [CITY.north, stadiumGap.z0 - CITY.road / 2],
            [stadiumGap.z1 + CITY.road / 2, CITY.upperBack - 7],
          ]
        : [[CITY.north, CITY.upperBack - 7]]
    for (const [z0, z1] of segments) {
      streets.push({ road: { x0: x - CITY.road / 2, x1: x + CITY.road / 2, z0, z1 }, y: CITY.upperY, axis: 'z' })
    }
  }
  for (const z of GRID_Z) {
    streets.push({
      road: { x0: CITY.west, x1: CITY.east, z0: z - CITY.road / 2, z1: z + CITY.road / 2 },
      y: CITY.upperY,
      axis: 'x',
    })
  }

  // --- Hafenmeile -----------------------------------------------------------
  for (const side of [-1, 1] as const) {
    const edges = [CITY.sliceHalf, ...HARBOR_CROSS, CITY.east]
    for (let k = 0; k < edges.length - 1; k++) {
      const a = edges[k] + (k === 0 ? 3 : pad)
      const b = edges[k + 1] - (k + 1 === edges.length - 1 ? 5 : pad)
      const x0 = side < 0 ? -b : a
      const x1 = side < 0 ? -a : b
      seed += 11
      // Nordseite des Boulevards: Laeden mit Wohnungen darueber. Vor der
      // Terrassenkante bleibt Platz fuer die Rampen.
      blocks.push({
        lot: { x0, x1, z0: -38, z1: BOULEVARD_Z - 3 - CITY.walk - 2 },
        kind: 'shops',
        y: 0,
        seed,
        front: 'south',
        label: side < 0 ? 'Hafenmeile West' : 'Hafenmeile Ost',
      })
      const south: [BlockKind, string] =
        side < 0
          ? ([
              ['shops', 'Hafenmeile West'],
              ['gas', 'Tankstelle am Hafen'],
              ['skatepark', 'Skatepark am Wasser'],
              ['courts', 'Strandplaetze'],
              ['park', 'Kuestenpark West'],
            ][k] as [BlockKind, string])
          : ([
              ['shops', 'Hafenmeile Ost'],
              ['park', 'Uferpark'],
              ['market', 'Fischmarkt'],
              ['pitch', 'Bolzplatz am Kai'],
              ['park', 'Kuestenpark Ost'],
            ][k] as [BlockKind, string])
      seed += 11
      blocks.push({
        lot: { x0, x1, z0: BOULEVARD_Z + 3 + CITY.walk + 2, z1: 24 },
        kind: south[0],
        y: 0,
        seed,
        front: 'north',
        label: south[1],
      })
    }
    // Boulevard, Querstrassen.
    const x0 = side < 0 ? CITY.west : CITY.sliceHalf
    const x1 = side < 0 ? -CITY.sliceHalf : CITY.east
    streets.push({ road: { x0, x1, z0: BOULEVARD_Z - 3, z1: BOULEVARD_Z + 3 }, y: 0, axis: 'x' })
    for (const ax of HARBOR_CROSS) {
      const x = side * ax
      streets.push({ road: { x0: x - 3, x1: x + 3, z0: -38, z1: 26 }, y: 0, axis: 'z' })
    }
  }

  return {
    blocks,
    streets,
    sidewalks,
    // Rampen laufen parallel zur Terrassenkante, wie im Hafenviertel.
    lowerRamps: [
      { x: -330, z: CITY.lowerFrom + 3, y: 0, rise: CITY.lowerY, dir: 1 },
      { x: 330, z: CITY.lowerFrom + 3, y: 0, rise: CITY.lowerY, dir: -1 },
    ],
    upperRamps: [
      { x: -200, z: CITY.upperFrom + 3, y: CITY.lowerY, rise: CITY.upperY - CITY.lowerY, dir: -1 },
      { x: 200, z: CITY.upperFrom + 3, y: CITY.lowerY, rise: CITY.upperY - CITY.lowerY, dir: 1 },
    ],
    lowerStairs: [{ x: -180 }, { x: 180 }, { x: -440 }, { x: 440 }],
    upperStairs: [{ x: -420 }, { x: 420 }, { x: -130 }, { x: 130 }],
  }
}
