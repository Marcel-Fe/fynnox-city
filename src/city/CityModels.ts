import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import { cone, cylinder, roundedBox, sphere, torus } from '../core/Shapes'
import type { InstanceModel } from '../world/WorldBuilder'

/**
 * Modelle, die in der grossen Stadt tausendfach stehen.
 *
 * Konvention: Ursprung am Fusspunkt, Vorderseite nach +Z. Fassadenteile sitzen
 * mit z = 0 auf der Wandflaeche - gedreht wird beim Platzieren, nicht hier.
 */

type Part = InstanceModel['parts'][number]

/** Quader mit Unterkante bei `y` - dieselbe Pivotregel wie `WorldBuilder.box()`. */
function block(w: number, h: number, d: number, x: number, y: number, z: number, color: string): Part {
  const geometry = new THREE.BoxGeometry(w, h, d)
  geometry.translate(x, y + h / 2, z)
  return { geometry, color }
}

function placed(
  geometry: THREE.BufferGeometry,
  color: string,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): Part {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  )
  geometry.applyMatrix4(matrix)
  return { geometry, color }
}

function model(id: string, parts: Part[], castShadow = true): InstanceModel {
  return { id, parts, castShadow }
}

// --- Fassade -----------------------------------------------------------------

/** Standardfenster 1,2 x 1,5 m mit Laibung, Sprosse und Bank. Unterkante bei y = 0. */
function windowParts(frame: string): Part[] {
  const bar = 0.16
  return [
    block(1.2, 1.5, 0.1, 0, 0, 0, COLORS.glass),
    block(1.2 + 2 * bar, bar, 0.2, 0, 1.5, 0.05, frame),
    block(bar, 1.5, 0.2, -0.6 - bar / 2, 0, 0.05, frame),
    block(bar, 1.5, 0.2, 0.6 + bar / 2, 0, 0.05, frame),
    block(1.2 + 2 * bar + 0.24, bar, 0.32, 0, -bar, 0.1, COLORS.stoneShade),
  ]
}

export const WINDOW = model('window', windowParts(COLORS.stone), false)

/** Fenster mit Klappladen - die Referenzen zeigen an jedem dritten Haus welche. */
export const WINDOW_SHUTTER = model(
  'window-shutter',
  [
    ...windowParts(COLORS.stone),
    block(0.62, 1.62, 0.06, -0.98, -0.02, 0.12, COLORS.groundTeal),
    block(0.62, 1.62, 0.06, 0.98, -0.02, 0.12, COLORS.groundTeal),
  ],
  false,
)

/** Fenster mit Blumenkasten auf der Bank. */
export const WINDOW_FLOWERS = model(
  'window-flowers',
  [
    ...windowParts(COLORS.stone),
    // Kasten, Laubpolster und zwei Bluetenbaender. Vorher drei Kugeln je
    // Fenster - bei zehntausend Fenstern allein 1,7 Mio. Dreiecke.
    block(1.3, 0.24, 0.3, 0, 0, 0.3, COLORS.wood),
    block(1.2, 0.16, 0.24, 0, 0.24, 0.3, COLORS.foliage),
    block(0.4, 0.12, 0.2, -0.32, 0.36, 0.32, COLORS.bloom),
    block(0.4, 0.12, 0.2, 0.3, 0.36, 0.28, COLORS.gold),
  ],
  false,
)

/** Band aus Glas und Stahlstuetzen fuer Hochhaeuser, ein Geschoss hoch, 3 m breit. */
export const TOWER_BAY = model(
  'tower-bay',
  [block(2.9, 2.5, 0.1, 0, 0.35, 0, COLORS.glass), block(0.18, 3.2, 0.26, -1.5, 0, 0.06, COLORS.metal)],
  false,
)

/** Schaufenster 2,2 x 2,6 m im Holzrahmen mit Sturz. */
export const SHOP_WINDOW = model(
  'shop-window',
  [
    block(2.2, 2.6, 0.1, 0, 0.6, 0, COLORS.glass),
    block(2.5, 0.16, 0.22, 0, 3.2, 0.06, COLORS.wood),
    block(0.16, 2.6, 0.22, -1.18, 0.6, 0.06, COLORS.wood),
    block(0.16, 2.6, 0.22, 1.18, 0.6, 0.06, COLORS.wood),
    block(2.5, 0.6, 0.24, 0, 0, 0.07, COLORS.stoneShade),
    block(2.7, 0.26, 0.3, 0, 3.42, 0.1, COLORS.stone),
  ],
  false,
)

/** Markise ueber einem Schaufenster, schraeg und mit Volant. */
function awning(id: string, color: string): InstanceModel {
  const slope = new THREE.BoxGeometry(2.5, 0.08, 1.5)
  return model(id, [
    placed(slope, color, [0, 3.35, 0.7], [0.42, 0, 0]),
    block(2.5, 0.3, 0.05, 0, 2.78, 1.38, color),
    block(2.5, 0.06, 0.06, 0, 3.62, 0.04, COLORS.iron),
  ])
}
export const AWNINGS = [
  awning('awning-coral', COLORS.coral),
  awning('awning-teal', COLORS.groundTeal),
  awning('awning-gold', COLORS.gold),
  awning('awning-cream', COLORS.wallCream),
]

/** Balkonplatte mit Schmiedeeisengelaender, 2,6 m breit. Unterkante bei y = 0. */
export const BALCONY = model('balcony', [
  block(2.6, 0.18, 1.1, 0, 0, 0.55, COLORS.stone),
  block(2.6, 0.06, 0.06, 0, 1.0, 1.07, COLORS.iron),
  block(0.06, 1.0, 1.1, -1.27, 0.18, 0.55, COLORS.iron),
  block(0.06, 1.0, 1.1, 1.27, 0.18, 0.55, COLORS.iron),
  ...[-0.9, -0.3, 0.3, 0.9].map((x) => block(0.05, 0.82, 0.05, x, 0.18, 1.07, COLORS.iron)),
  block(0.5, 0.4, 0.5, -0.8, 0.18, 0.8, COLORS.foliage),
])

/** Haustuer 1,0 x 2,2 m mit Gewaende. */
export const DOOR = model('door', [block(1.5, 2.5, 0.16, 0, 0, 0.03, COLORS.stone), block(1.0, 2.2, 0.1, 0, 0, 0.08, COLORS.wood)], false)

/** Klimageraet und Wassertank auf Flachdaechern. */
export const ROOF_UNIT = model('roof-unit', [
  block(2.2, 1.2, 1.6, 0, 0, 0, COLORS.metal),
  placed(cylinder(0.5, 0.5, 0.18, 12), COLORS.iron, [0, 1.22, 0]),
  placed(cylinder(0.7, 0.7, 1.8, 12), COLORS.wallCream, [2.2, 0.9, 0.4]),
  placed(cone(0.78, 0.4, 12), COLORS.roof, [2.2, 2.0, 0.4]),
])

// --- Strasse -----------------------------------------------------------------

/** Strassenlaterne auf dem Gehweg, 4,4 m. Laterne haengt am Ausleger ueber der Fahrbahnseite (+Z). */
export const STREET_LAMP = model('street-lamp', [
  placed(cylinder(0.2, 0.24, 0.4, 10), COLORS.navy, [0, 0.2, 0]),
  placed(cylinder(0.08, 0.1, 4.2, 8), COLORS.navy, [0, 2.4, 0]),
  placed(cylinder(0.05, 0.05, 1.1, 6), COLORS.navy, [0, 4.4, 0.45], [Math.PI / 2, 0, 0]),
  placed(cylinder(0.14, 0.22, 0.38, 8), COLORS.lanternGlow, [0, 4.1, 0.95]),
  placed(cone(0.3, 0.24, 8), COLORS.navy, [0, 4.4, 0.95]),
  placed(sphere(0.07, 6, 4), COLORS.gold, [0, 4.55, 0.95]),
])

export const BENCH = model('bench', [
  block(0.09, 0.45, 0.62, -0.78, 0, 0, COLORS.iron),
  block(0.09, 0.45, 0.62, 0.78, 0, 0, COLORS.iron),
  ...[0, 1, 2, 3].map((i) => block(1.76, 0.05, 0.11, 0, 0.4, -0.24 + i * 0.15, COLORS.wood)),
  ...[0, 1, 2].map((i) => block(1.64, 0.11, 0.05, 0, 0.53 + i * 0.15, -0.25, COLORS.wood)),
])

export const BIN = model('bin', [
  placed(cylinder(0.26, 0.22, 0.9, 10), COLORS.groundTeal, [0, 0.45, 0]),
  placed(cylinder(0.29, 0.29, 0.08, 10), COLORS.iron, [0, 0.94, 0]),
])

/** Kuebel mit Bluetenpolster. */
export const PLANTER = model('planter', [
  placed(cylinder(0.62, 0.52, 0.6, 12), COLORS.stoneShade, [0, 0.3, 0]),
  placed(sphere(0.5, 8, 6), COLORS.foliage, [0, 0.72, 0], [0, 0, 0], [1, 0.6, 1]),
  placed(sphere(0.22, 6, 4), COLORS.bloom, [0.24, 0.9, 0.1]),
  placed(sphere(0.2, 6, 4), COLORS.gold, [-0.22, 0.88, -0.14]),
  placed(sphere(0.18, 6, 4), COLORS.bloom, [-0.05, 0.94, 0.28]),
])

/** Mittelstrich der Fahrbahn, 3 m lang, entlang Z. */
export const LANE_DASH = model('lane-dash', [block(0.14, 0.02, 3, 0, 0.01, 0, COLORS.cream)], false)

/** Zebrastreifen quer ueber eine 6-m-Fahrbahn; die Streifen laufen entlang Z. */
export const CROSSWALK = model(
  'crosswalk',
  [0, 1, 2, 3, 4, 5].map((i) => block(0.45, 0.02, 3.2, -2.25 + i * 0.9, 0.012, 0, COLORS.cream)),
  false,
)

/** Bushaltestelle mit Glasdach. */
export const BUS_STOP = model('bus-stop', [
  block(3.4, 0.12, 1.5, 0, 2.5, 0, COLORS.groundTeal),
  block(0.1, 2.5, 0.1, -1.6, 0, -0.6, COLORS.metal),
  block(0.1, 2.5, 0.1, 1.6, 0, -0.6, COLORS.metal),
  block(3.2, 2.1, 0.06, 0, 0.3, -0.66, COLORS.glass),
  block(2.4, 0.08, 0.4, 0, 0.45, -0.4, COLORS.wood),
  block(0.8, 1.6, 0.1, 1.9, 0.6, -0.3, COLORS.coral),
])

/**
 * Parkendes Auto. Karosserie und Kabine mit gerundeten Kanten, Raeder als
 * Zylinder - der Nutzer hat ausdruecklich gemeldet, dass die Fahrzeuge nicht
 * eckig aussehen duerfen. Vorderseite nach -Z wie im Paket.
 */
function car(id: string, body: string): InstanceModel {
  const parts: Part[] = [
    placed(roundedBox(1.84, 0.62, 4.1, 0.26), body, [0, 0.62, 0]),
    placed(roundedBox(1.66, 0.58, 2.2, 0.24), COLORS.fynnoxGlass, [0, 1.18, 0.25]),
    placed(roundedBox(1.72, 0.12, 2.0, 0.06), body, [0, 1.48, 0.25]),
    placed(roundedBox(1.9, 0.2, 4.16, 0.1), COLORS.tyre, [0, 0.38, 0]),
    block(1.2, 0.14, 0.06, 0, 0.62, -2.06, COLORS.cream),
    block(1.3, 0.12, 0.06, 0, 0.66, 2.06, COLORS.coral),
  ]
  for (const [x, z] of [
    [-0.86, -1.3],
    [0.86, -1.3],
    [-0.86, 1.3],
    [0.86, 1.3],
  ]) {
    parts.push(placed(cylinder(0.34, 0.34, 0.26, 14), COLORS.tyre, [x, 0.34, z], [0, 0, Math.PI / 2]))
    parts.push(placed(cylinder(0.18, 0.18, 0.28, 10), COLORS.metal, [x, 0.34, z], [0, 0, Math.PI / 2]))
  }
  return model(id, parts)
}
export const CARS = [
  car('car-coral', COLORS.coral),
  car('car-teal', COLORS.sparkBody),
  car('car-gold', COLORS.gold),
  car('car-cream', COLORS.wallCream),
  car('car-blue', COLORS.scoutHull),
]

// --- Gruen -------------------------------------------------------------------

/** Rundkrone aus sieben Ballen, oben heller - dieselbe Bauweise wie im Hafenviertel. */
function tree(id: string, light: string, dark: string, seed: number, trunk: string = COLORS.barkPale): InstanceModel {
  const radius = 1.9
  const parts: Part[] = [placed(cylinder(0.18, 0.3, 3.2, 8), trunk, [0, 1.6, 0])]
  const layout: [number, number, number, number][] = [
    [0, 0.72, 0, 1.0],
    [-0.62, 0.34, 0.24, 0.72],
    [0.58, 0.4, -0.3, 0.68],
    [0.16, 0.3, 0.66, 0.63],
    [-0.3, 0.28, -0.6, 0.6],
    [0.34, 1.06, 0.2, 0.62],
    [-0.36, 0.98, -0.24, 0.56],
  ]
  layout.forEach(([bx, by, bz, scale], i) => {
    const jitter = Math.sin(seed * 2.7 + i * 1.9) * 0.18
    parts.push(
      placed(
        sphere(radius * scale, 8, 5),
        by > 0.6 ? light : dark,
        [(bx + jitter) * radius, 3.8 + by * radius, (bz - jitter * 0.6) * radius],
        [0, 0, 0],
        [1, 0.86, 1],
      ),
    )
  })
  return model(id, parts)
}
export const TREES = [
  tree('tree-a', COLORS.foliageLight, COLORS.foliage, 1),
  tree('tree-b', COLORS.foliage, COLORS.foliageDark, 4),
  tree('tree-blossom', COLORS.blossom, COLORS.foliage, 7, COLORS.barkDark),
]

/** Faecherpalme fuer Promenade und Strand. */
export const PALM = model('palm', [
  placed(cylinder(0.16, 0.24, 2.4, 8), COLORS.barkPale, [0, 1.2, 0]),
  placed(cylinder(0.13, 0.16, 2.4, 8), COLORS.barkPale, [0.18, 3.5, 0], [0, 0, -0.14]),
  placed(cylinder(0.11, 0.13, 1.6, 8), COLORS.barkPale, [0.42, 5.4, 0], [0, 0, -0.26]),
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = (i / 7) * Math.PI * 2
    return placed(
      sphere(1.0, 8, 5),
      i % 2 ? COLORS.palmFrond : COLORS.foliage,
      [0.55 + Math.cos(a) * 1.0, 6.1 - 0.2 * (i % 3), Math.sin(a) * 1.0],
      [0, -a, 0.35],
      [1.3, 0.14, 0.42],
    )
  }),
])

/** Buschgruppe fuer Parks und Innenhoefe. */
export const BUSH = model('bush', [
  placed(sphere(0.9, 8, 6), COLORS.foliage, [0, 0.6, 0], [0, 0, 0], [1, 0.75, 1]),
  placed(sphere(0.7, 8, 6), COLORS.foliageLight, [0.7, 0.55, 0.3], [0, 0, 0], [1, 0.75, 1]),
  placed(sphere(0.2, 6, 4), COLORS.bloom, [0.2, 1.1, 0.5]),
])

// --- Sport und Tankstelle ----------------------------------------------------

/** Fussballtor 7,32 x 2,44 m, Oeffnung nach +Z. */
export const GOAL = model('goal', [
  placed(cylinder(0.06, 0.06, 2.44, 8), COLORS.cream, [-3.66, 1.22, 0]),
  placed(cylinder(0.06, 0.06, 2.44, 8), COLORS.cream, [3.66, 1.22, 0]),
  placed(cylinder(0.06, 0.06, 7.44, 8), COLORS.cream, [0, 2.44, 0], [0, 0, Math.PI / 2]),
  block(7.3, 2.3, 0.03, 0, 0, -1.4, COLORS.stone),
  block(0.03, 2.3, 1.4, -3.66, 0, -0.7, COLORS.stone),
  block(0.03, 2.3, 1.4, 3.66, 0, -0.7, COLORS.stone),
])

/** Flutlichtmast, 16 m. Strahler nach +Z. */
export const FLOODLIGHT = model('floodlight', [
  placed(cylinder(0.22, 0.32, 16, 10), COLORS.metal, [0, 8, 0]),
  block(3.2, 1.6, 0.4, 0, 15.6, 0.3, COLORS.iron),
  ...[-1, 0, 1].map((i) => block(0.8, 0.5, 0.1, i * 1.0, 16.2, 0.54, COLORS.lanternGlow)),
])

/** Basketballkorb mit Brett, Korb zeigt nach +Z. */
export const HOOP = model('hoop', [
  placed(cylinder(0.1, 0.12, 3.4, 8), COLORS.iron, [0, 1.7, -1.1]),
  block(0.1, 0.1, 1.2, 0, 3.3, -0.5, COLORS.iron),
  block(1.8, 1.05, 0.06, 0, 2.9, 0.1, COLORS.cream),
  block(0.6, 0.45, 0.07, 0, 3.05, 0.12, COLORS.coral),
  placed(torus(0.23, 0.02, 6, 16), COLORS.coral, [0, 3.05, 0.4], [Math.PI / 2, 0, 0]),
])

/** Zapfsaeule auf ihrer Insel. */
export const FUEL_PUMP = model('fuel-pump', [
  placed(roundedBox(1.2, 0.2, 3.6, 0.08), COLORS.concrete, [0, 0.1, 0]),
  placed(roundedBox(0.8, 1.7, 0.6, 0.1), COLORS.wallCream, [0, 1.05, 0]),
  block(0.82, 0.3, 0.62, 0, 1.5, 0, COLORS.coral),
  block(0.5, 0.4, 0.64, 0, 0.9, 0, COLORS.navy),
  placed(cylinder(0.2, 0.2, 1.0, 10), COLORS.gold, [0, 0.7, 1.4]),
  placed(sphere(0.21, 8, 6), COLORS.gold, [0, 1.2, 1.4]),
])

/** Halbe Viertelpipe: Kreisausschnitt als Rampe, 2 m hoch, Fahrflaeche nach +Z. */
export function quarterPipe(width: number): InstanceModel {
  const radius = 2.4
  // Profil in XY: Kreisbogen um (radius, radius) vom flachen Auslauf bei
  // (radius, 0) hinauf bis kurz vor die Senkrechte, dann Plattform und Rueckwand.
  const end = (Math.PI / 2) * 0.86
  const shape = new THREE.Shape()
  shape.moveTo(radius, 0)
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * end
    shape.lineTo(radius - Math.sin(a) * radius, radius - Math.cos(a) * radius)
  }
  const top = radius - Math.cos(end) * radius
  shape.lineTo(-0.6, top)
  shape.lineTo(-0.6, 0)
  shape.lineTo(radius, 0)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 2 })
  // Profil lag in XY; drehen, sodass die Rampe nach +Z abfaellt und in X breit ist.
  geometry.rotateY(-Math.PI / 2)
  geometry.translate(width / 2, 0, 0)
  geometry.computeVertexNormals()
  return model(`quarter-pipe-${width}`, [
    { geometry, color: COLORS.concrete },
    placed(cylinder(0.05, 0.05, width, 8), COLORS.metal, [0, top, -0.02], [0, 0, Math.PI / 2]),
  ])
}

/** Grindrail, 6 m. */
export const RAIL = model('rail', [
  placed(cylinder(0.05, 0.05, 6, 8), COLORS.coral, [0, 0.45, 0], [Math.PI / 2, 0, 0]),
  block(0.08, 0.42, 0.08, 0, 0, -2.6, COLORS.iron),
  block(0.08, 0.42, 0.08, 0, 0, 2.6, COLORS.iron),
])
