import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
import { WorldBuilder } from './WorldBuilder'
import { PartBatcher, box, cone, cylinder, sphere, torus } from '../core/Shapes'
import type { MotionParts } from './AmbientMotion'

/**
 * Hafenviertel des Vertical Slice.
 * Alle Masse stammen aus 04_Modelllisten/BAUWERK_MODULE_MASSE_UND_SNAPGRID.md:
 * 1 Einheit = 1 m, Snap-Grid 0,5 m, Fassadenraster 2,5 m, Geschoss 3,2 m,
 * Ladengeschoss 4,0 m, Strassentile 12 m, Fahrspur 3,0 m, Gehweg 2,0 m,
 * Bordstein 0,15 m, Gelaender 1,1 m, Stufe 0,16/0,30 m.
 */

export const GRID = 0.5
export const FLOOR_HEIGHT = 3.2
export const SHOP_FLOOR_HEIGHT = 4.0
export const FACADE_MODULE = 2.5
export const CURB_HEIGHT = 0.15
/**
 * Oberkante der Sitzflaeche einer Bank: Gehweg plus 0,45 m Blockhoehe.
 * Als Konstante, weil sie an zwei Stellen gebraucht wird - beim Bauen der Bank
 * und beim Setzen der Sitzanker. Auseinandergelaufen sassen die Figuren daneben.
 */
export const BENCH_SEAT_Y = CURB_HEIGHT + 0.45

export interface DistrictAnchors {
  playerStart: THREE.Vector3
  vehicleStart: { position: THREE.Vector3; heading: number }
  parkourStart: THREE.Vector3
  puzzleValves: THREE.Vector3[]
  puzzleBeamTarget: THREE.Vector3
  transitGate: THREE.Vector3
  garageImpulse: THREE.Vector3
  /** Liegeplaetze des Wassertaxis: Rumpfpose, nicht der Anleger selbst. */
  moorings: { id: string; position: THREE.Vector3; heading: number; label: string }[]
  waterTaxiStart: { position: THREE.Vector3; heading: number }
  /** Liegeplatz des Skyfin am Flugsteg. */
  skyfinDocks: { id: string; position: THREE.Vector3; heading: number; label: string }[]
  skyfinStart: { position: THREE.Vector3; heading: number }
  /** Liegeplatz des Bluefin Scout am Tauchbecken. */
  scoutDocks: { id: string; position: THREE.Vector3; heading: number; label: string }[]
  scoutStart: { position: THREE.Vector3; heading: number }
  researchPlatform: THREE.Vector3
  stationMarineLab: THREE.Vector3
  mira: THREE.Vector3
  fountain: THREE.Vector3
  projectTerrace: THREE.Vector3
  stationCityProject: THREE.Vector3
  stationMakerExchange: THREE.Vector3
  collectibles: THREE.Vector3[]
  npcRoutes: THREE.Vector3[][]
  npcSeats: THREE.Vector3[]
  /** Gruppen, die AmbientMotion bewegt - sie liegen ausserhalb des Batches. */
  motion: MotionParts
  /** Mittelpunkt des Hafenbeckens, Bezugspunkt der Moewenbahnen. */
  basin: THREE.Vector3
}

interface BuildingOptions {
  x0: number
  z0: number
  w: number
  d: number
  floors: number
  wallColor: string
  /** Erdgeschoss mit Schaufenstern (4,0 m) statt Wohngeschoss. */
  shopFront?: boolean
  roofAccessible?: boolean
  /**
   * Balkone und Erker an der Strassenseite. Fuer den Parkourblock aus:
   * dort haengen Markise, Kletterbalkone und Dachkante an derselben Wand,
   * und zwei Balkone auf 4,6 m durchdringen sich sichtbar.
   */
  frontDecor?: boolean
}

function buildingHeight(options: BuildingOptions): number {
  const ground = options.shopFront ? SHOP_FLOOR_HEIGHT : FLOOR_HEIGHT
  return ground + (options.floors - 1) * FLOOR_HEIGHT
}

export function buildDistrict(scene: THREE.Scene, collision: CollisionWorld): DistrictAnchors {
  const b = new WorldBuilder(scene, collision)

  buildTerrain(b)
  buildRoads(b)
  const garage = buildFoxtailGarage(b)
  const blockA = buildFacadeBuilding(b, {
    x0: 4,
    z0: -34,
    w: 10,
    d: 12,
    floors: 2,
    wallColor: COLORS.wallCream,
    shopFront: true,
    roofAccessible: true,
    // An dieser Wand haengt die Kletterlinie der Parkourroute.
    frontDecor: false,
  })
  const blockB = buildFacadeBuilding(b, {
    x0: 20,
    z0: -34,
    w: 10,
    d: 12,
    floors: 2,
    wallColor: COLORS.wallCoral,
    shopFront: true,
    roofAccessible: true,
  })
  const blockC = buildFacadeBuilding(b, {
    x0: 32,
    z0: -34,
    w: 10,
    d: 12,
    floors: 2,
    wallColor: COLORS.wallCream,
    shopFront: false,
    roofAccessible: true,
  })
  buildMetroEntrance(b)
  buildClockPavilion(b)
  const parkour = buildParkourRoute(b, blockA, blockB, blockC)
  const puzzle = buildTransitWorks(b)
  buildPromenade(b)
  const lighthouse = buildLighthouse(b)
  buildWaterTaxiStation(b)
  const windsock = buildHarborDocks(b, scene)
  const platform = buildResearchPlatform(b)
  buildProps(b)
  const canopies: THREE.Group[] = []
  buildStreetDressing(b, { scene, out: canopies })

  b.finish()

  return {
    // Seitlich vom Rolltor: sonst steht die Kamera beim Start in der Garage.
    playerStart: new THREE.Vector3(-26, 0.4, -16),
    vehicleStart: { position: new THREE.Vector3(-24, 0, -13), heading: Math.PI / 2 },
    parkourStart: parkour,
    puzzleValves: puzzle.valves,
    puzzleBeamTarget: puzzle.beamTarget,
    transitGate: puzzle.gate,
    garageImpulse: new THREE.Vector3(-36, 1.2, -20),
    moorings: [
      {
        id: 'mooring_station',
        position: new THREE.Vector3(15.8, 0, 38),
        heading: 0,
        label: 'Wassertaxi-Station',
      },
      {
        id: 'mooring_platform',
        position: new THREE.Vector3(platform.x - 7.4, 0, platform.z),
        heading: Math.PI,
        label: 'Forschungsplattform',
      },
    ],
    waterTaxiStart: { position: new THREE.Vector3(15.8, 0, 38), heading: 0 },
    skyfinDocks: [
      {
        id: 'dock_skyfin',
        position: new THREE.Vector3(-12, 0, 46.5),
        // Backbordseite und damit die Cockpittuer zeigen zum Ponton.
        heading: -Math.PI / 2,
        label: 'Flugsteg',
      },
    ],
    skyfinStart: { position: new THREE.Vector3(-12, 0, 46.5), heading: -Math.PI / 2 },
    scoutDocks: [
      {
        id: 'dock_scout',
        position: new THREE.Vector3(7.2, 0, 43.4),
        heading: 0,
        label: 'Tauchbecken',
      },
    ],
    scoutStart: { position: new THREE.Vector3(7.2, 0, 43.4), heading: 0 },
    researchPlatform: new THREE.Vector3(platform.x, platform.deck, platform.z),
    // Freie Deckflaeche vor der Messhuette, sonst steckt die Station in der Wand.
    stationMarineLab: new THREE.Vector3(platform.x - 2.5, platform.deck, platform.z - 4),
    mira: new THREE.Vector3(11.5, 0.3, 33.5),
    fountain: new THREE.Vector3(10, 0, 18),
    projectTerrace: new THREE.Vector3(-20, 0, 29),
    stationCityProject: new THREE.Vector3(-6, 0, 24),
    stationMakerExchange: new THREE.Vector3(-12, 0, 8),
    collectibles: [
      new THREE.Vector3(-30, 1.2, -22),
      new THREE.Vector3(9, 8.0, -28),
      new THREE.Vector3(25, 8.0, -28),
      new THREE.Vector3(37, 8.0, -28),
      new THREE.Vector3(2, 0.9, 12),
      new THREE.Vector3(-11, 6.0, 18),
      new THREE.Vector3(18, 0.9, 29),
      new THREE.Vector3(lighthouse.x, 1.2, lighthouse.z - 7),
      new THREE.Vector3(10, 1.4, 36),
    ],
    npcRoutes: [
      [new THREE.Vector3(-18, 0, 29), new THREE.Vector3(18, 0, 29), new THREE.Vector3(18, 0, 27)],
      [new THREE.Vector3(-1, 0, -6), new THREE.Vector3(-1, 0, 24), new THREE.Vector3(6, 0, 24)],
      [new THREE.Vector3(-14, 0, 6), new THREE.Vector3(8, 0, 6), new THREE.Vector3(8, 0, 14)],
      [new THREE.Vector3(-38, 0, -16), new THREE.Vector3(-8, 0, -16)],
    ],
    motion: { canopies, windsock },
    // Mitte des Hafenbeckens vor der Kaimauer - hier kreisen die Moewen.
    basin: new THREE.Vector3(4, 0, 52),
    // Hoehe der SITZFLAECHE, nicht der Bank: der Block steht mit Unterkante auf
    // dem Gehweg (0,15 m) und ist 0,45 m hoch. Die 0,45 allein waren die
    // Bauteilhoehe - wer sie als Sitzhoehe liest, setzt die Figur 15 cm zu tief
    // an und, weil unten die Huefthoehe fehlte, am Ende auf die Lehne.
    npcSeats: [
      new THREE.Vector3(-8, BENCH_SEAT_Y, 27.5),
      new THREE.Vector3(-4, BENCH_SEAT_Y, 27.5),
      new THREE.Vector3(14, BENCH_SEAT_Y, 10),
      new THREE.Vector3(garage.x + 6, BENCH_SEAT_Y, -16.2),
    ],
  }
}

function buildTerrain(b: WorldBuilder): void {
  // Landflaeche, Unterkante tief genug, damit man nicht unter die Stadt faellt.
  b.box({ x: 0, y: -4, z: -13, w: 160, h: 4, d: 94, color: COLORS.paving })
  // Hafenbecken: Boden liegt 3 m unter Kaikante.
  b.box({ x: 0, y: -6, z: 72, w: 160, h: 3, d: 80, color: COLORS.navyMid })
  // Kaimauer bei z = 34 (Paket: Kaimauer/Wasserkante als 12-m-Modul).
  b.box({ x: 0, y: -3, z: 34.4, w: 160, h: 3, d: 0.8, color: COLORS.concrete })
  // Mole zum Leuchtturm.
  b.box({ x: 42, y: -3, z: 42, w: 14, h: 3, d: 20, color: COLORS.concrete })
}

function buildRoads(b: WorldBuilder): void {
  const road = COLORS.asphalt
  const walk = COLORS.concrete

  // Hauptstrasse Ost-West: zwei Fahrspuren a 3,0 m bei z = -12.
  // Die Fahrbahn liegt 1 cm ueber dem Gelaende. Vorher lag ihre Oberkante exakt
  // auf 0 und damit koplanar mit der Gelaendeoberflaeche - der Asphalt wurde
  // weggeblendet, die Strasse war schlicht unsichtbar.
  b.box({ x: 0, y: 0, z: -12, w: 160, h: 0.01, d: 6, color: road, collide: false })
  // Randlinien der Fahrbahn; die Mitte bleibt frei, dort liegt das Gleis.
  for (const edge of [-14.88, -9.12]) {
    b.box({ x: 0, y: 0, z: edge, w: 160, h: 0.02, d: 0.14, color: COLORS.cream, collide: false })
  }
  // Gehwege je 2,0 m mit 0,15 m Bordstein.
  b.box({ x: 0, y: 0, z: -16, w: 160, h: CURB_HEIGHT, d: 2, color: walk })
  b.box({ x: 0, y: 0, z: -8, w: 160, h: CURB_HEIGHT, d: 2, color: walk })
  // Strassenbahngleis: 1,5 m visuelle Spurweite, projektweit identisch.
  b.box({ x: 0, y: 0, z: -12.75, w: 160, h: 0.06, d: 0.12, color: COLORS.metal, collide: false })
  b.box({ x: 0, y: 0, z: -11.25, w: 160, h: 0.06, d: 0.12, color: COLORS.metal, collide: false })
  // Zebrastreifen mit abgesenktem Bordstein.
  for (let i = 0; i < 5; i++) {
    b.box({ x: -0.5 + i * 0.9, y: 0, z: -12, w: 0.45, h: 0.02, d: 6, color: COLORS.cream, collide: false })
  }

  // Querstrasse Nord-Sued zum Hafen.
  b.box({ x: 0, y: 0, z: 12, w: 6, h: 0.01, d: 48, color: road, collide: false })
  for (const edge of [-2.88, 2.88]) {
    b.box({ x: edge, y: 0, z: 12, w: 0.14, h: 0.02, d: 48, color: COLORS.cream, collide: false })
  }
  // Gestrichelte Mittellinie, Strich 3 m, Luecke 3 m.
  for (let z = -10; z < 36; z += 6) {
    b.box({ x: 0, y: 0, z, w: 0.14, h: 0.02, d: 3, color: COLORS.cream, collide: false })
  }
  b.box({ x: -4, y: 0, z: 12, w: 2, h: CURB_HEIGHT, d: 48, color: walk })
  b.box({ x: 4, y: 0, z: 12, w: 2, h: CURB_HEIGHT, d: 48, color: walk })

  // Zufahrt zur Foxtail Garage.
  b.box({ x: -30, y: 0, z: -15, w: 8, h: 0.01, d: 8, color: road, collide: false })

  // Platzflaeche zwischen Strasse und Promenade, mit Plattenfugen im 4-m-Raster.
  b.box({ x: 0, y: 0, z: 2, w: 44, h: CURB_HEIGHT, d: 14, color: walk })
  paveJoints(b, { x: 0, z: 2, w: 44, d: 14, y: CURB_HEIGHT, spacing: 4 })
}

/**
 * Plattenfugen als duenne Linien auf einer Bodenflaeche. Ohne sie liest jede
 * grosse Flaeche als eine einzige leere Platte - das ist der Haupteindruck,
 * den die Bildreferenzen gerade nicht haben.
 */
function paveJoints(
  b: WorldBuilder,
  o: { x: number; z: number; w: number; d: number; y: number; spacing: number },
): void {
  const joint = 0.06
  const countX = Math.floor(o.w / o.spacing)
  for (let i = 1; i < countX; i++) {
    const x = o.x - o.w / 2 + i * o.spacing
    b.box({ x, y: o.y, z: o.z, w: joint, h: 0.008, d: o.d, color: COLORS.pavingJoint, collide: false })
  }
  const countZ = Math.floor(o.d / o.spacing)
  for (let i = 1; i < countZ; i++) {
    const z = o.z - o.d / 2 + i * o.spacing
    b.box({ x: o.x, y: o.y, z, w: o.w, h: 0.008, d: joint, color: COLORS.pavingJoint, collide: false })
  }
}

/** Foxtail Garage: 16 x 12 m, 8 m hoch, Rolltor 5,0 x 4,2 m, Loft auf 4,0 m. */
function buildFoxtailGarage(b: WorldBuilder): { x: number; z: number } {
  const x0 = -38
  const z0 = -30
  const w = 16
  const d = 12
  const h = 8
  const t = 0.25
  const cx = x0 + w / 2
  const cz = z0 + d / 2

  // Rueckwand und Seitenwaende. Cremeputz statt Koralle: die Referenz zeigt
  // eine helle Werkhalle, deren Farbe vom tealen Stahlrahmen kommt.
  b.box({ x: cx, y: 0, z: z0 + t / 2, w, h, d: t, color: COLORS.wallCream })
  b.box({ x: x0 + t / 2, y: 0, z: cz, w: t, h, d, color: COLORS.wallCream })
  b.box({ x: x0 + w - t / 2, y: 0, z: cz, w: t, h, d, color: COLORS.wallCream })
  // Front mit 5 m Rolltoroeffnung.
  const doorWidth = 5
  const sideWidth = (w - doorWidth) / 2
  b.box({
    x: x0 + sideWidth / 2,
    y: 0,
    z: z0 + d - t / 2,
    w: sideWidth,
    h,
    d: t,
    color: COLORS.wallCream,
  })
  b.box({
    x: x0 + w - sideWidth / 2,
    y: 0,
    z: z0 + d - t / 2,
    w: sideWidth,
    h,
    d: t,
    color: COLORS.wallCream,
  })
  b.box({ x: cx, y: 4.2, z: z0 + d - t / 2, w: doorWidth, h: h - 4.2, d: t, color: COLORS.wallCream })
  dressFoxtailGarage(b, { x0, z0, w, d, h, doorWidth })
  // Dach und Werkstattboden.
  b.box({ x: cx, y: h, z: cz, w, h: 0.3, d, color: COLORS.roof })
  b.box({ x: cx, y: 0, z: cz, w: w - 2 * t, h: 0.02, d: d - 2 * t, color: COLORS.groundTeal })
  // Loft auf 4,0 m, ueber eine Treppe erreichbar.
  b.box({ x: x0 + 3, y: 4, z: cz, w: 5.5, h: 0.2, d: d - 2 * t, color: COLORS.wood })
  b.stairs({ x: x0 + 6.4, y: 0, z: cz, width: 1.2, steps: 25, color: COLORS.wood, dir: 'east' })
  // Werkbank und Ladestation.
  b.box({ x: x0 + 13, y: 0, z: z0 + 2, w: 4, h: 0.9, d: 0.8, color: COLORS.wood })
  b.box({ x: x0 + 2, y: 0, z: z0 + 10, w: 0.6, h: 1.4, d: 0.6, color: COLORS.cyan })

  return { x: cx, z: cz }
}

/**
 * Fassadengliederung der Foxtail Garage nach
 * 10_Bauwerke_und_Infrastruktur/02_Foxtail_Garage.
 *
 * Das Merkmal der Halle ist nicht ihre Kubatur, sondern das teale Stahlgeruest,
 * das ueber dem Cremeputz liegt: Ecksaeulen, Riegel, Torrahmen mit Rundbogen
 * und darueber ein oranges Traufband. Alles ohne Kollision - die Kollisionsbox
 * der Halle stammt weiterhin von den Waenden.
 */
function dressFoxtailGarage(
  b: WorldBuilder,
  o: { x0: number; z0: number; w: number; d: number; h: number; doorWidth: number },
): void {
  const { x0, z0, w, d, h, doorWidth } = o
  const cx = x0 + w / 2
  const cz = z0 + d / 2
  const front = z0 + d
  const steel = COLORS.taxiKeel
  const wall = (x: number, y: number, z: number, ww: number, hh: number, dd: number, color: string) =>
    b.box({ x, y, z, w: ww, h: hh, d: dd, color, collide: false })

  // Sockelband und Ecksaeulen des Stahlgeruests.
  for (const [sx, sz, sw, sd] of [
    [cx, front + 0.02, w + 0.3, 0.3],
    [cx, z0 - 0.02, w + 0.3, 0.3],
    [x0 - 0.02, cz, 0.3, d + 0.3],
    [x0 + w + 0.02, cz, 0.3, d + 0.3],
  ] as [number, number, number, number][]) {
    wall(sx, 0, sz, sw, 0.55, sd, COLORS.stoneShade)
  }
  for (const [px, pz] of [
    [x0 + 0.15, front - 0.15],
    [x0 + w - 0.15, front - 0.15],
    [x0 + 0.15, z0 + 0.15],
    [x0 + w - 0.15, z0 + 0.15],
  ]) {
    wall(px, 0, pz, 0.62, h, 0.62, steel)
  }
  // Geschossriegel auf 4,0 m - dieselbe Hoehe wie das Loft dahinter.
  for (const [rz, rd] of [
    [front - 0.05, 0.34],
    [z0 + 0.05, 0.34],
  ] as [number, number][]) {
    wall(cx, 3.9, rz, w + 0.1, 0.3, rd, steel)
  }
  for (const rx of [x0 + 0.05, x0 + w - 0.05]) {
    wall(rx, 3.9, cz, 0.34, 0.3, d, steel)
  }

  // Torrahmen mit Rundbogen. Der Bogen ist das Gesicht der Werkstatt.
  const archY = 4.2
  for (const sx of [-1, 1]) {
    wall(cx + sx * (doorWidth / 2 + 0.28), 0, front - 0.02, 0.56, archY, 0.46, steel)
  }
  // Halbtorus statt Zylinder: ein Zylinder mit ausgeschnittener Mitte ist ein
  // ganzer Ring, und dessen untere Haelfte steht mitten in der Toroeffnung.
  b.shape(torus(doorWidth / 2 + 0.29, 0.29, 6, 20, Math.PI), steel, {
    pos: [cx, archY, front - 0.02],
  })
  // Rolltor: waagerechte Lamellen, halb aufgezogen.
  for (let i = 0; i < 5; i++) {
    wall(cx, 2.9 + i * 0.24, front - 0.3, doorWidth - 0.2, 0.2, 0.12, COLORS.metal)
  }
  // Pfotenemblem ueber dem Bogen.
  b.shape(cylinder(0.95, 0.95, 0.2, 18), COLORS.sparkTrim, {
    pos: [cx, 6.3, front + 0.04],
    rot: [Math.PI / 2, 0, 0],
  })
  b.shape(cylinder(0.74, 0.74, 0.26, 18), COLORS.cream, {
    pos: [cx, 6.3, front + 0.02],
    rot: [Math.PI / 2, 0, 0],
  })
  b.shape(sphere(0.26, 8, 6), COLORS.sparkTrim, { pos: [cx, 6.22, front + 0.14], scale: [1, 1, 0.4] })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (0.18 + i * 0.21)
    b.shape(sphere(0.11, 6, 5), COLORS.sparkTrim, {
      pos: [cx - Math.cos(a) * 0.36, 6.56 + Math.sin(a) * 0.1, front + 0.14],
      scale: [1, 1, 0.4],
    })
  }

  /** Rundbogenfenster mit Sprossenkreuz - das zweite Merkmal der Halle. */
  const archWindow = (x: number, z: number, y: number, ww: number, hh: number, sign: number) => {
    const r = ww / 2
    wall(x, y, z, ww + 0.34, hh, 0.3, steel)
    b.shape(cylinder(r + 0.17, r + 0.17, 0.3, 14), steel, {
      pos: [x, y + hh, z],
      rot: [Math.PI / 2, 0, 0],
    })
    wall(x, y, z + sign * 0.06, ww, hh, 0.22, COLORS.glass)
    b.shape(cylinder(r, r, 0.22, 14), COLORS.glass, {
      pos: [x, y + hh, z + sign * 0.06],
      rot: [Math.PI / 2, 0, 0],
    })
    // Sprossen liegen vor der Scheibe. Auf gleicher Tiefe flimmern die beiden
    // Vorderflaechen gegeneinander - im Standbild als gestrichelte Linie, in
    // Bewegung als Rauschen.
    wall(x, y, z + sign * 0.22, 0.09, hh + r, 0.1, steel)
    for (const ry of [y + hh * 0.45, y + hh]) {
      wall(x, ry, z + sign * 0.22, ww, 0.09, 0.1, steel)
    }
  }
  // Front: je ein Fenster neben dem Tor, im Erd- und Obergeschoss.
  for (const sx of [-1, 1]) {
    const wx = cx + sx * (doorWidth / 2 + 2.4)
    archWindow(wx, front - 0.06, 4.55, 2.4, 1.9, 1)
    if (sx < 0) archWindow(wx, front - 0.06, 1.2, 1.8, 1.3, 1)
  }
  // Rueckseite: zwei grosse Bogenfenster.
  for (const sx of [-1, 1]) {
    archWindow(cx + sx * 3.6, z0 + 0.06, 4.55, 2.6, 1.9, -1)
  }

  // Oranges Traufband und Dachaufbauten.
  wall(cx, h - 0.55, cz, w + 0.7, 0.5, d + 0.7, COLORS.sparkTrim)
  wall(cx, h + 0.3, cz, w + 0.5, 0.22, d + 0.5, COLORS.iron)
  for (let i = 0; i < 3; i++) {
    wall(x0 + 3.4 + i * 3.6, h + 0.52, cz - 2.2, 2.9, 0.12, 1.7, COLORS.solarPanel)
  }
  b.shape(cylinder(0.42, 0.42, 2.4, 10), COLORS.metal, { pos: [x0 + 2.2, h + 1.5, cz + 3.4] })
  b.shape(cylinder(0.56, 0.56, 0.28, 10), COLORS.iron, { pos: [x0 + 2.2, h + 2.8, cz + 3.4] })

  // Orange Poller vor der Toreinfahrt, ausserhalb der Durchfahrt.
  for (const px of [cx - doorWidth / 2 - 1.1, cx + doorWidth / 2 + 1.1]) {
    b.shape(cylinder(0.16, 0.19, 1.0, 8), COLORS.sparkTrim, { pos: [px, 0.5, front + 0.9] })
    b.shape(sphere(0.17, 7, 6), COLORS.sparkTrim, { pos: [px, 1.0, front + 0.9] })
  }
}

/**
 * Modulares Wohn-/Geschaeftshaus. Alle vier Seiten werden ausmodelliert,
 * damit die freie Orbit-Kamera das Haus vollstaendig umrunden kann
 * (Abnahmekriterium des Pakets).
 */
function buildFacadeBuilding(
  b: WorldBuilder,
  options: BuildingOptions,
): { x0: number; z0: number; w: number; d: number; height: number } {
  const { x0, z0, w, d, wallColor, shopFront = false } = options
  const height = buildingHeight(options)
  const groundHeight = shopFront ? SHOP_FLOOR_HEIGHT : FLOOR_HEIGHT
  const cx = x0 + w / 2
  const cz = z0 + d / 2

  // Ein solider Collider statt vier Waenden: das Haus ist nicht begehbar,
  // das Dach traegt trotzdem.
  b.collisionAdd(
    new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x0 + w, height, z0 + d)),
  )

  const wall = (x: number, y: number, z: number, ww: number, hh: number, dd: number, color: string) =>
    b.box({ x, y, z, w: ww, h: hh, d: dd, color, collide: false })

  // Erdgeschoss ringsum in Teal (Paket: Erdgeschoss_Teal).
  wall(cx, 0, z0 + 0.125, w, groundHeight, 0.25, COLORS.groundTeal)
  wall(cx, 0, z0 + d - 0.125, w, groundHeight, 0.25, COLORS.groundTeal)
  wall(x0 + 0.125, 0, cz, 0.25, groundHeight, d, COLORS.groundTeal)
  wall(x0 + w - 0.125, 0, cz, 0.25, groundHeight, d, COLORS.groundTeal)
  // Obergeschosse.
  wall(cx, groundHeight, z0 + 0.125, w, height - groundHeight, 0.25, wallColor)
  wall(cx, groundHeight, z0 + d - 0.125, w, height - groundHeight, 0.25, wallColor)
  wall(x0 + 0.125, groundHeight, cz, 0.25, height - groundHeight, d, wallColor)
  wall(x0 + w - 0.125, groundHeight, cz, 0.25, height - groundHeight, d, wallColor)
  // Innenfuellung, damit durch Fenster keine leere Huelle zu sehen ist.
  wall(cx, 0, cz, w - 0.5, height, d - 0.5, COLORS.navyMid)

  // Sockel aus Naturstein: in den Referenzen steht kein Haus ohne Fusspunkt
  // direkt auf dem Pflaster.
  wall(cx, 0, cz, w + 0.24, 0.55, d + 0.24, COLORS.stoneShade)
  // Ecklisenen ueber die volle Hoehe - das Merkmal, an dem die Fassadenmodule
  // des Pakets als eine Fassade und nicht als ein Quader lesen.
  for (const [lx, lz] of [
    [x0 + 0.22, z0 + 0.22],
    [x0 + w - 0.22, z0 + 0.22],
    [x0 + 0.22, z0 + d - 0.22],
    [x0 + w - 0.22, z0 + d - 0.22],
  ]) {
    wall(lx, 0, lz, 0.56, height, 0.56, COLORS.stone)
  }
  // Gesimsband ueber dem Erdgeschoss und Kranzgesims unter der Dachkante.
  wall(cx, groundHeight - 0.18, cz, w + 0.34, 0.34, d + 0.34, COLORS.stone)
  wall(cx, height - 0.5, cz, w + 0.5, 0.5, d + 0.5, COLORS.stone)

  // Fenster im 2,5-m-Fassadenraster, Standardfenster 1,2 x 1,5 m.
  const columns = Math.floor(w / FACADE_MODULE)
  const rows = options.floors - 1
  /**
   * Fenster mit Laibung und Bank. Der Rahmen besteht aus vier Staeben, nicht
   * aus einer Platte: eine Platte vor dem Glas verdeckt das Fenster
   * vollstaendig, eine Platte dahinter ist nicht zu sehen. Nur der Rahmen aus
   * Einzelteilen darf vorstehen und laesst die Oeffnung frei.
   */
  const facadeWindow = (
    x: number,
    y: number,
    z: number,
    ww: number,
    hh: number,
    facing: 'z' | 'x',
    frameColor: string = COLORS.stone,
  ) => {
    const alongZ = facing === 'z'
    const sign = alongZ ? (z > cz ? 1 : -1) : x > cx ? 1 : -1
    const bar = 0.18
    // Rahmenebene steht 4 cm vor der Glasebene.
    const fx = alongZ ? x : x + sign * 0.04
    const fz = alongZ ? z + sign * 0.04 : z
    const put = (px: number, py: number, pz: number, pw: number, ph: number, color: string) =>
      wall(px, py, pz, alongZ ? pw : 0.2, ph, alongZ ? 0.2 : pw, color)

    put(fx, y + hh, fz, ww + 2 * bar, bar, frameColor)
    for (const side of [-1, 1]) {
      const offset = (side * (ww + bar)) / 2
      put(alongZ ? fx + offset : fx, y, alongZ ? fz : fz + offset, bar, hh, frameColor)
    }
    // Fensterbank mit Ueberstand, deutlich tiefer als der Rahmen.
    wall(
      alongZ ? fx : fx + sign * 0.04,
      y - bar,
      alongZ ? fz + sign * 0.04 : fz,
      alongZ ? ww + 2 * bar + 0.24 : 0.3,
      bar,
      alongZ ? 0.3 : ww + 2 * bar + 0.24,
      COLORS.stoneShade,
    )
    wall(x, y, z, alongZ ? ww : 0.12, hh, alongZ ? 0.12 : ww, COLORS.glass)
  }

  for (let c = 0; c < columns; c++) {
    const x = x0 + (w - columns * FACADE_MODULE) / 2 + c * FACADE_MODULE + FACADE_MODULE / 2
    if (shopFront) {
      // Schaufensterfeld 2,2 x 2,6 m im Holzrahmen, mit Sturzband darueber.
      for (const z of [z0 + d - 0.05, z0 + 0.05]) {
        const sign = z > cz ? 1 : -1
        facadeWindow(x, 0.6, z, 2.2, 2.6, 'z', COLORS.wood)
        wall(x, 3.42, z + sign * 0.05, 2.7, 0.26, 0.26, COLORS.stone)
      }
    }
    for (let r = 0; r < rows; r++) {
      const y = groundHeight + r * FLOOR_HEIGHT + 0.9
      facadeWindow(x, y, z0 + d - 0.05, 1.2, 1.5, 'z')
      facadeWindow(x, y, z0 + 0.05, 1.2, 1.5, 'z')
      // Blumenkasten auf der Bank der Strassenseite. In den Referenzen traegt
      // fast jede Fensterbank einen - das ist der Unterschied zwischen
      // bewohnter Fassade und Fassadenmodul.
      windowBox(b, x, y - 0.18, z0 + d + 0.16, 1.3, 'x', c + r * 3)
    }
  }
  const depthColumns = Math.floor(d / FACADE_MODULE)
  for (let c = 0; c < depthColumns; c++) {
    const z = z0 + (d - depthColumns * FACADE_MODULE) / 2 + c * FACADE_MODULE + FACADE_MODULE / 2
    for (let r = 0; r < rows; r++) {
      const y = groundHeight + r * FLOOR_HEIGHT + 0.9
      facadeWindow(x0 + 0.05, y, z, 1.2, 1.5, 'x')
      facadeWindow(x0 + w - 0.05, y, z, 1.2, 1.5, 'x')
    }
  }

  // Balkone und Erker. Die Platte traegt nicht - sie haengt hoch genug, dass
  // niemand darauf laufen will, und die Kollisionsbox bleibt der eine Quader.
  const frontZ = z0 + d
  if (options.frontDecor !== false) {
    const bayX = x0 + w / 2
    for (let r = 0; r < rows; r++) {
      const y = groundHeight + r * FLOOR_HEIGHT
      // Erker ueber alle Obergeschosse, Balkone links und rechts davon.
      wall(bayX, y + 0.1, frontZ + 0.35, 2.6, FLOOR_HEIGHT - 0.5, 0.7, wallColor)
      wall(bayX, y + 0.9, frontZ + 0.4, 2.0, 1.5, 0.14, COLORS.glass)
      wall(bayX, y + 0.02, frontZ + 0.35, 2.9, 0.22, 0.86, COLORS.stone)
      for (const side of [-1, 1]) {
        const bx = bayX + side * 3.2
        if (bx < x0 + 1 || bx > x0 + w - 1) continue
        wall(bx, y + 0.55, frontZ + 0.55, 2.6, 0.18, 1.1, COLORS.stone)
        b.railing({ x: bx, z: frontZ + 1.05, y: y + 0.73, length: 2.6, axis: 'x', color: COLORS.iron, collide: false })
        for (const rail of [-1, 1]) {
          b.railing({ x: bx + rail * 1.25, z: frontZ + 0.6, y: y + 0.73, length: 1.0, axis: 'z', color: COLORS.iron, collide: false })
        }
      }
    }
  } else {
    // Parkourblock: Erker an die Ostseite, damit die Kletterlinie frei bleibt.
    for (let r = 0; r < rows; r++) {
      const y = groundHeight + r * FLOOR_HEIGHT
      wall(x0 + w + 0.35, y + 0.1, cz, 0.7, FLOOR_HEIGHT - 0.5, 2.6, wallColor)
      wall(x0 + w + 0.4, y + 0.9, cz, 0.14, 1.5, 2.0, COLORS.glass)
      wall(x0 + w + 0.35, y + 0.02, cz, 0.86, 0.22, 2.9, COLORS.stone)
    }
  }

  // Fallrohre an den Strassenecken.
  for (const px of [x0 + 0.62, x0 + w - 0.62]) {
    wall(px, 0.55, frontZ - 0.08, 0.16, height - 1.05, 0.16, COLORS.metal)
  }

  // Einzeltuer 1,0 x 2,2 m auf der Strassenseite, mit Gewaende und Sturz.
  const doorX = cx + w / 2 - 1.6
  wall(doorX, 0, frontZ + 0.03, 1.5, 2.5, 0.16, COLORS.stone)
  wall(doorX, 0, frontZ - 0.02, 1.0, 2.2, 0.1, COLORS.wood)

  // Dachplatte, Gesims und Bruestung 1,1 m.
  b.box({ x: cx, y: height, z: cz, w: w + 0.4, h: 0.3, d: d + 0.4, color: COLORS.roof })
  const roofTop = height + 0.3
  // Auf Parkourdaechern bleibt die Bruestung sichtbar, aber durchlaessig -
  // sonst waeren Aufstieg, Dachbruecke und Sprung blockiert.
  const solid = !options.roofAccessible
  b.railing({ x: cx, z: z0 + 0.1, y: roofTop, length: w, axis: 'x', color: COLORS.metal, collide: solid })
  b.railing({ x: cx, z: z0 + d - 0.1, y: roofTop, length: w, axis: 'x', color: COLORS.metal, collide: solid })
  b.railing({ x: x0 + 0.1, z: cz, y: roofTop, length: d, axis: 'z', color: COLORS.metal, collide: solid })
  b.railing({ x: x0 + w - 0.1, z: cz, y: roofTop, length: d, axis: 'z', color: COLORS.metal, collide: solid })
  // Dachaufbau als Landmarke.
  b.box({ x: cx - 2, y: roofTop, z: cz - 3, w: 2.4, h: 1.6, d: 2.4, color: COLORS.metal })
  // Dachgarten nach 11_Modulare_Bausaetze/04_Dachmodule: Schornstein, Pergola
  // mit Berankung und ein Solarfeld. Die mittlere Bahn bei cz bleibt frei -
  // dort laufen Dachbruecke und Sprungluecke der Parkourroute.
  b.box({ x: cx + 3.4, y: roofTop, z: cz - 3.4, w: 0.9, h: 2.1, d: 0.9, color: COLORS.wallCoral })
  b.box({ x: cx + 3.4, y: roofTop + 2.1, z: cz - 3.4, w: 1.1, h: 0.25, d: 1.1, color: COLORS.stoneShade, collide: false })
  const pergolaZ = cz + 3.6
  for (const [px, pz] of [
    [cx - 1.8, pergolaZ - 0.9],
    [cx + 1.8, pergolaZ - 0.9],
    [cx - 1.8, pergolaZ + 0.9],
    [cx + 1.8, pergolaZ + 0.9],
  ]) {
    b.box({ x: px, y: roofTop, z: pz, w: 0.16, h: 2.2, d: 0.16, color: COLORS.wood, collide: false })
  }
  for (let i = 0; i < 5; i++) {
    b.box({
      x: cx - 1.8 + i * 0.9,
      y: roofTop + 2.2,
      z: pergolaZ,
      w: 0.12,
      h: 0.12,
      d: 2.1,
      color: COLORS.wood,
      collide: false,
    })
  }
  b.box({ x: cx, y: roofTop + 2.32, z: pergolaZ, w: 3.9, h: 0.3, d: 2.1, color: COLORS.foliage, collide: false })
  b.box({ x: cx - 3.6, y: roofTop, z: pergolaZ, w: 2.2, h: 0.06, d: 1.6, color: COLORS.solarPanel, collide: false })

  return { x0, z0, w, d, height: roofTop }
}

/**
 * Tideline-Metro-Eingang nach 10_Bauwerke_und_Infrastruktur/03: cremefarbener
 * Baukoerper ueber teal geflieststem Sockel, oranges Trennband, Portalbogen mit
 * Pfotenemblem, glaeserner Aufzugsturm und begruente Dachkante.
 *
 * 14 x 10 m, 6,5 m hoch, Portaloeffnung 5 m. Vorher waren es vier flache
 * Kisten - der Eingang liest jetzt als Bauwerk mit Erdgeschoss und Attika.
 */
function buildMetroEntrance(b: WorldBuilder): void {
  const x0 = -18
  const z0 = -32
  const w = 14
  const d = 10
  const h = 6.5
  const cx = x0 + w / 2
  const cz = z0 + d / 2
  const front = z0 + d
  const socle = 1.9
  const wall = (x: number, y: number, z: number, ww: number, hh: number, dd: number, color: string) =>
    b.box({ x, y, z, w: ww, h: hh, d: dd, color, collide: false })

  // Ein Collider fuer den ganzen Baukoerper; der Abgang ist Kulisse.
  b.collisionAdd(
    new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x0 + w, h, z0 + d)),
  )
  // Podest mit Vorsprung.
  b.box({ x: cx, y: 0, z: cz, w: w + 0.7, h: 0.25, d: d + 0.7, color: COLORS.stoneShade, collide: false })

  // Huelle: unten Fliesenband, darueber Putz. Ringsum, damit die Orbit-Kamera
  // das Haus umrunden kann.
  for (const [wx, wy, wz, ww, wd] of [
    [cx, 0, z0 + 0.15, w, 0.3],
    [x0 + 0.15, 0, cz, 0.3, d],
    [x0 + w - 0.15, 0, cz, 0.3, d],
  ] as [number, number, number, number, number][]) {
    wall(wx, wy, wz, ww, socle, wd, COLORS.groundTeal)
    wall(wx, socle, wz, ww, h - socle, wd, COLORS.wallCream)
  }
  // Front: zwei Wandstuecke neben der 5-m-Oeffnung, darueber der Sturz.
  const openWidth = 5
  const side = (w - openWidth) / 2
  for (const sx of [x0 + side / 2, x0 + w - side / 2]) {
    wall(sx, 0, front - 0.15, side, socle, 0.3, COLORS.groundTeal)
    wall(sx, socle, front - 0.15, side, h - socle, 0.3, COLORS.wallCream)
  }
  wall(cx, 4.3, front - 0.15, openWidth, h - 4.3, 0.3, COLORS.wallCream)
  // Innenschacht mit Rolltreppe, damit das Portal nicht ins Leere sieht.
  wall(cx, 0, cz + 1.2, openWidth - 0.6, h - 1, d - 2.6, COLORS.navy)
  b.stairs({ x: cx, y: 0, z: front - 1.6, width: 3.4, steps: 12, color: COLORS.metal, dir: 'north' })

  // Portalrahmen: Laibung, Bogenschulter und Rundbogen aus einem liegenden
  // Zylinder - eine Kiste als Sturz nimmt dem Eingang genau die Rundung, die
  // ihn in den Referenzen traegt.
  const springLine = 2.6
  // Segmentbogen, kein Halbkreis: ueber 5 m Oeffnung waere ein Halbkreis 2,5 m
  // hoch und stiesse bis unter die Dachkante. Die Referenz zeigt einen flachen
  // Bogen, ueber dem die Wandflaeche das Emblem traegt.
  const archRise = 0.62
  for (const sx of [-1, 1]) {
    wall(cx + sx * (openWidth / 2 + 0.2), 0, front + 0.05, 0.4, springLine, 0.5, COLORS.groundTeal)
  }
  // Halbtorus als Bogenlaibung. Der Scheitel liegt bei 5,5 m und damit unter
  // der Attika - ein Bogen mit voller Portalbreite als Radius stiess vorher
  // durch die Dachkante.
  b.shape(torus(openWidth / 2 + 0.2, 0.25, 6, 22, Math.PI), COLORS.groundTeal, {
    pos: [cx, springLine, front + 0.05],
    scale: [1, archRise, 1],
  })
  // Bogenfeld zwischen Scheitel und Sturz.
  b.shape(cylinder(openWidth / 2 - 0.05, openWidth / 2 - 0.05, 0.34, 20), COLORS.navy, {
    pos: [cx, springLine, front - 0.1],
    rot: [Math.PI / 2, 0, 0],
    scale: [1, 1, archRise],
  })
  // Oranges Trennband oberhalb des Fliesensockels, ringsum.
  for (const [bx, bz, bw, bd] of [
    [cx, z0 + 0.12, w + 0.12, 0.36],
    [cx, front - 0.12, w + 0.12, 0.36],
    [x0 + 0.12, cz, 0.36, d + 0.12],
    [x0 + w - 0.12, cz, 0.36, d + 0.12],
  ] as [number, number, number, number][]) {
    wall(bx, socle, bz, bw, 0.16, bd, COLORS.sparkTrim)
  }
  // Pfotenemblem ueber dem Portal.
  const badgeY = 5.4
  b.shape(cylinder(0.78, 0.78, 0.22, 18), COLORS.groundTeal, {
    pos: [cx, badgeY, front + 0.08],
    rot: [Math.PI / 2, 0, 0],
  })
  b.shape(cylinder(0.61, 0.61, 0.28, 18), COLORS.gold, {
    pos: [cx, badgeY, front + 0.04],
    rot: [Math.PI / 2, 0, 0],
  })
  b.shape(sphere(0.21, 8, 6), COLORS.groundTeal, { pos: [cx, badgeY - 0.06, front + 0.2], scale: [1, 1, 0.4] })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (0.18 + i * 0.21)
    b.shape(sphere(0.087, 6, 5), COLORS.groundTeal, {
      pos: [cx - Math.cos(a) * 0.28, badgeY + 0.21 + Math.sin(a) * 0.075, front + 0.2],
      scale: [1, 1, 0.4],
    })
  }
  // Wandlaternen links und rechts des Portals.
  for (const sx of [-1, 1]) {
    const lx = cx + sx * (openWidth / 2 + 0.9)
    wall(lx, 3.1, front + 0.12, 0.14, 0.5, 0.28, COLORS.iron)
    b.shape(box(0.34, 0.5, 0.34), COLORS.lanternGlow, { pos: [lx, 2.85, front + 0.3] })
    wall(lx, 3.1, front + 0.3, 0.42, 0.12, 0.42, COLORS.iron)
  }

  // Attika mit Gesims, darauf haengendes Gruen wie in den Referenzen.
  b.box({ x: cx, y: h, z: cz, w: w + 0.8, h: 0.45, d: d + 0.8, color: COLORS.stone, collide: false })
  b.box({ x: cx, y: h + 0.45, z: cz, w: w - 0.6, h: 0.5, d: d - 0.6, color: COLORS.wallCream, collide: false })
  // Haengendes Gruen auf der Dachkante. Gleich grosse Kugeln in gleichem
  // Abstand lesen als Perlenkette - Groesse und Hoehe wechseln deshalb.
  for (let i = 0; i < 14; i++) {
    const gx = x0 + 0.8 + i * 0.95
    const wobble = Math.sin(i * 2.3)
    b.shape(sphere(0.3 + Math.abs(wobble) * 0.14, 7, 6), i % 3 ? COLORS.foliage : COLORS.ivy, {
      pos: [gx, h + 0.42 + wobble * 0.12, front + 0.28],
      scale: [1, 0.8 + wobble * 0.25, 0.7],
    })
  }
  // Glasdach ueber dem Abgang: liegender Halbzylinder mit Sprossen.
  b.shape(cylinder(2.6, 2.6, openWidth + 1.2, 12, ), COLORS.glass, {
    pos: [cx, h + 0.3, cz + 1.4],
    rot: [0, 0, Math.PI / 2],
    scale: [1, 1, 0.5],
  })
  for (let i = 0; i <= 4; i++) {
    b.shape(torus(2.62, 0.07, 5, 12, Math.PI), COLORS.metal, {
      pos: [cx - (openWidth + 1.2) / 2 + i * ((openWidth + 1.2) / 4), h + 0.3, cz + 1.4],
      rot: [0, Math.PI / 2, 0],
    })
  }

  // Glaeserner Aufzugsturm an der Ostseite - die auffaelligste Silhouette des
  // Bauwerks und der Grund, warum der Eingang aus der Ferne lesbar ist.
  const tx = x0 + w + 1.4
  const tz = front - 2.6
  b.shape(cylinder(1.5, 1.6, 0.4, 14), COLORS.stoneShade, { pos: [tx, 0.2, tz] })
  b.shape(cylinder(1.3, 1.3, 6.6, 14), COLORS.glass, { pos: [tx, 3.7, tz] })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    b.shape(box(0.14, 6.6, 0.14), COLORS.metal, {
      pos: [tx + Math.cos(a) * 1.32, 3.7, tz + Math.sin(a) * 1.32],
      rot: [0, -a, 0],
    })
    b.shape(box(0.09, 4.4, 0.09), COLORS.cyan, {
      pos: [tx + Math.cos(a + 0.5) * 1.36, 3.7, tz + Math.sin(a + 0.5) * 1.36],
      rot: [0, -a, 0],
    })
  }
  b.shape(cylinder(1.55, 1.7, 0.5, 14), COLORS.metal, { pos: [tx, 7.25, tz] })
  b.shape(cylinder(1.2, 1.45, 0.35, 14), COLORS.groundTeal, { pos: [tx, 7.6, tz] })
  b.collisionAdd(
    new THREE.Box3(new THREE.Vector3(tx - 1.5, 0, tz - 1.5), new THREE.Vector3(tx + 1.5, 7.9, tz + 1.5)),
  )
  // Blumenkasten am Fuss des Turms.
  b.box({ x: tx - 0.2, y: 0.4, z: tz + 1.9, w: 2.2, h: 0.5, d: 0.9, color: COLORS.stoneShade, collide: false })
  for (let i = 0; i < 3; i++) {
    b.shape(sphere(0.42, 7, 6), i === 1 ? COLORS.foliage : COLORS.foliageDark, {
      pos: [tx - 0.9 + i * 0.7, 1.0, tz + 1.9],
      scale: [1, 0.7, 1],
    })
  }
}

/**
 * Maker-Markt-Uhrpavillon nach 10_Bauwerke_und_Infrastruktur/06: Natursteinbau
 * mit Rundbogendurchgang, Bronzegesimsen, vier Zifferblaettern im Uhrgeschoss
 * und einer Patinakuppel mit vergoldeter Spitze.
 *
 * 6 x 6 m, 12 m hoch, Durchgang 2,5 m breit. Vorher: vier Holzpfosten mit zwei
 * Kisten darauf. Die Pfeiler bleiben an ihrer Stelle - dort haengt der Marktplatz.
 */
function buildClockPavilion(b: WorldBuilder): void {
  const x = -12
  const z = 4
  const pierY = 5.4
  const wall = (px: number, py: number, pz: number, w: number, h: number, d: number, color: string) =>
    b.box({ x: px, y: py, z: pz, w, h, d, color, collide: false })

  // Sockelstufen.
  wall(x, 0, z, 7.4, 0.22, 7.4, COLORS.stoneShade)
  wall(x, 0.22, z, 6.9, 0.22, 6.9, COLORS.stone)

  // Vier Natursteinpfeiler mit Basis und Kapitell. Die Kollision bleibt bei den
  // Pfeilern - der Durchgang muss begehbar sein.
  for (const [dx, dz] of [
    [-2.6, -2.6],
    [2.6, -2.6],
    [-2.6, 2.6],
    [2.6, 2.6],
  ]) {
    b.box({ x: x + dx, y: 0.44, z: z + dz, w: 0.86, h: pierY, d: 0.86, color: COLORS.stone })
    wall(x + dx, 0.44, z + dz, 1.04, 0.3, 1.04, COLORS.stoneShade)
    wall(x + dx, 0.44 + pierY - 0.34, z + dz, 1.1, 0.34, 1.1, COLORS.stoneShade)
    // Schlanke Vorlage auf der Pfeilerkante - erst sie macht aus dem Quader
    // einen Pilaster.
    wall(x + dx * 1.16, 0.74, z + dz, 0.28, pierY - 0.7, 0.5, COLORS.stoneShade)
    wall(x + dx, 0.74, z + dz * 1.16, 0.5, pierY - 0.7, 0.28, COLORS.stoneShade)
  }
  // Rundbogen ueber den vier Durchgaengen.
  const archY = 0.44 + pierY - 1.9
  for (const [rot, ax, az] of [
    [0, 0, -2.6],
    [0, 0, 2.6],
    [Math.PI / 2, -2.6, 0],
    [Math.PI / 2, 2.6, 0],
  ] as [number, number, number][]) {
    b.shape(torus(1.62, 0.3, 5, 14, Math.PI), COLORS.stone, {
      pos: [x + ax, archY, z + az],
      rot: [0, rot, 0],
    })
  }

  // Bronzegesims zwischen Durchgang und Uhrgeschoss - das kraeftigste Band des
  // Bauwerks und die Trennung, die es ueberhaupt gliedert.
  const beltY = 0.44 + pierY
  wall(x, beltY, z, 7.2, 0.34, 7.2, COLORS.bronze)
  wall(x, beltY + 0.34, z, 6.6, 0.22, 6.6, COLORS.bronzeDark)

  // Uhrgeschoss: Patinawand zwischen vier Ecksaeulen.
  const clockY = beltY + 0.56
  const clockH = 3.6
  wall(x, clockY, z, 5.2, clockH, 5.2, COLORS.patinaLight)
  for (const [dx, dz] of [
    [-2.6, -2.6],
    [2.6, -2.6],
    [-2.6, 2.6],
    [2.6, 2.6],
  ]) {
    b.shape(cylinder(0.34, 0.38, clockH, 10), COLORS.stone, {
      pos: [x + dx, clockY + clockH / 2, z + dz],
    })
    wall(x + dx, clockY + clockH - 0.28, z + dz, 0.92, 0.28, 0.92, COLORS.stoneShade)
    wall(x + dx, clockY, z + dz, 0.92, 0.24, 0.92, COLORS.stoneShade)
  }
  // Vier Zifferblaetter: Bronzering, cremefarbenes Blatt, Zeiger.
  const faceY = clockY + clockH / 2
  for (const [nx, nz, rot] of [
    [0, 2.62, 0],
    [0, -2.62, 0],
    [2.62, 0, Math.PI / 2],
    [-2.62, 0, Math.PI / 2],
  ] as [number, number, number][]) {
    const out = 0.12
    const px = x + nx + (nx !== 0 ? Math.sign(nx) * out : 0)
    const pz = z + nz + (nz !== 0 ? Math.sign(nz) * out : 0)
    b.shape(cylinder(1.18, 1.18, 0.2, 20), COLORS.gold, {
      pos: [px, faceY, pz],
      rot: [Math.PI / 2, 0, rot],
    })
    b.shape(cylinder(0.98, 0.98, 0.26, 20), COLORS.cream, {
      pos: [px, faceY, pz],
      rot: [Math.PI / 2, 0, rot],
    })
    // Zeiger und Zentrum. Der lange Zeiger steht auf zehn nach zehn wie in der
    // Bildreferenz - eine Uhr ohne Zeiger liest als Fenster.
    const hand = (len: number, angle: number, thick: number) => {
      const dirX = Math.sin(angle) * (len / 2)
      const dirY = Math.cos(angle) * (len / 2)
      b.shape(box(rot === 0 ? thick : 0.09, len, rot === 0 ? 0.09 : thick), COLORS.fynnoxDark, {
        pos: [px + (rot === 0 ? dirX : 0), faceY + dirY, pz + (rot === 0 ? 0 : dirX)],
        rot: [0, 0, rot === 0 ? -angle : 0],
      })
    }
    // Der Zeiger geht vom Zentrum aus, seine Spitze liegt also bei voller
    // Laenge - er muss kuerzer bleiben als der Radius des Blattes (0,98 m).
    hand(0.9, -0.95, 0.09)
    hand(0.62, 0.95, 0.11)
    b.shape(sphere(0.14, 8, 6), COLORS.gold, { pos: [px, faceY, pz] })
  }

  // Kranzgesims und Kuppel.
  const domeY = clockY + clockH
  wall(x, domeY, z, 6.4, 0.42, 6.4, COLORS.bronze)
  b.shape(sphere(3.0, 14, 10), COLORS.patinaLight, {
    pos: [x, domeY + 0.42, z],
    scale: [1, 0.62, 1],
  })
  // Ochsenauge in der Kuppel.
  b.shape(cylinder(0.46, 0.46, 0.3, 12), COLORS.bronze, {
    pos: [x, domeY + 1.3, z + 2.55],
    rot: [Math.PI / 2, 0, 0],
  })
  b.shape(cylinder(0.3, 0.3, 0.36, 12), COLORS.navyMid, {
    pos: [x, domeY + 1.3, z + 2.55],
    rot: [Math.PI / 2, 0, 0],
  })
  b.shape(cylinder(0.24, 0.42, 0.5, 10), COLORS.bronze, { pos: [x, domeY + 2.1, z] })
  b.shape(sphere(0.26, 8, 6), COLORS.gold, { pos: [x, domeY + 2.5, z] })
  b.shape(cylinder(0.03, 0.13, 1.1, 6), COLORS.gold, { pos: [x, domeY + 3.1, z] })

  // Schmiedeeiserne Laternen an den Ecken, auf zwei Hoehen wie in der Referenz.
  for (const [dx, dz] of [
    [-3.5, -3.5],
    [3.5, -3.5],
    [-3.5, 3.5],
    [3.5, 3.5],
  ]) {
    for (const ly of [3.1, beltY + 0.9]) {
      b.shape(box(0.09, 0.09, 0.9), COLORS.iron, {
        pos: [x + dx * 0.86, ly + 0.5, z + dz * 0.86],
        rot: [0, Math.atan2(dx, dz), 0],
      })
      b.shape(box(0.34, 0.5, 0.34), COLORS.lanternGlow, { pos: [x + dx, ly, z + dz] })
      b.shape(cone(0.3, 0.28, 4), COLORS.iron, { pos: [x + dx, ly + 0.38, z + dz] })
    }
  }
  // Steinbaenke am Sockel.
  for (const [bx, bz, bw, bd] of [
    [0, 3.7, 3.2, 0.7],
    [0, -3.7, 3.2, 0.7],
  ] as [number, number, number, number][]) {
    b.box({ x: x + bx, y: 0.44, z: z + bz, w: bw, h: 0.42, d: bd, color: COLORS.stoneShade })
  }

  // Marktstaende (Markise 2,5 m Ausladung).
  for (let i = 0; i < 3; i++) {
    const sx = x + 6 + i * 3.5
    b.box({ x: sx, y: 0, z: z + 1, w: 2.4, h: 0.9, d: 1.6, color: COLORS.wood })
    b.box({ x: sx, y: 2.2, z: z + 1, w: 2.6, h: 0.15, d: 2.5, color: i % 2 ? COLORS.coral : COLORS.cyan, collide: false })
  }
}

/**
 * Dachroute: Kletterkanten liegen 0,8-1,4 m ueber der Standflaeche,
 * Sprungluecken bleiben unter 2,0 m (Paketvorgabe fuer P0-Parkour).
 * Zusaetzlich gibt es eine barrierearme Treppe auf dasselbe Dach.
 */
function buildParkourRoute(
  b: WorldBuilder,
  a: { x0: number; z0: number; w: number; d: number; height: number },
  bb: { x0: number; z0: number; w: number; d: number; height: number },
  c: { x0: number; z0: number; w: number; d: number; height: number },
): THREE.Vector3 {
  const startX = a.x0 + 2
  const frontZ = a.z0 + a.d + 1.4

  // Container-Stapel als Einstieg.
  b.box({ x: startX, y: 0, z: frontZ + 1.2, w: 2.4, h: 1.2, d: 2.4, color: COLORS.cyan })
  b.box({ x: startX + 2.2, y: 0, z: frontZ + 1.2, w: 2.0, h: 2.4, d: 2.0, color: COLORS.coral })
  // Markise auf 3,2 m, dann zwei Balkone (2,5 m breit, 1,5 m tief).
  b.box({ x: startX + 1, y: 3.2, z: a.z0 + a.d + 0.7, w: 3.4, h: 0.2, d: 1.5, color: COLORS.gold })
  b.box({ x: startX + 3.5, y: 4.6, z: a.z0 + a.d + 0.7, w: 2.5, h: 0.2, d: 1.5, color: COLORS.metal })
  b.box({ x: startX + 5, y: 5.9, z: a.z0 + a.d + 0.7, w: 2.5, h: 0.2, d: 1.5, color: COLORS.metal })
  // Letzte Kante auf das Dach von Block A (Dachoberkante 7,5 m).
  b.box({ x: startX + 6, y: 7.0, z: a.z0 + a.d + 0.5, w: 2.0, h: 0.2, d: 1.2, color: COLORS.metal })

  // Dachbruecke ueber die 6-m-Gasse (Paket: Dachbruecke 2 m breit).
  const bridgeZ = a.z0 + a.d / 2
  b.box({
    x: (a.x0 + a.w + bb.x0) / 2,
    y: a.height - 0.2,
    z: bridgeZ,
    w: bb.x0 - (a.x0 + a.w) + 0.6,
    h: 0.2,
    d: 2,
    color: COLORS.wood,
  })
  b.railing({ x: (a.x0 + a.w + bb.x0) / 2, z: bridgeZ - 1, y: a.height, length: 6.6, axis: 'x', color: COLORS.metal, collide: false })
  b.railing({ x: (a.x0 + a.w + bb.x0) / 2, z: bridgeZ + 1, y: a.height, length: 6.6, axis: 'x', color: COLORS.metal, collide: false })

  // 2,0-m-Sprungluecke zwischen Block B und C.
  b.box({ x: bb.x0 + bb.w - 0.4, y: bb.height, z: bridgeZ, w: 1.6, h: 0.12, d: 2.4, color: COLORS.gold })
  b.box({ x: c.x0 + 0.4, y: c.height, z: bridgeZ, w: 1.6, h: 0.12, d: 2.4, color: COLORS.gold })

  // Barrierearme Alternative: Wendetreppenturm in der Gasse westlich von Block A.
  // Stufe 0,16 m, Hauptlauf 1,8 m frei, Podest 1,8 x 1,8 m (Paketmasse).
  const towerX = a.x0 - 2.6
  const flight1Steps = 23 // 3,68 m
  const flight1Base = a.z0 + 11
  b.stairs({ x: towerX, y: 0, z: flight1Base, width: 1.8, steps: flight1Steps, color: COLORS.concrete, dir: 'north' })
  const landingY = flight1Steps * 0.16
  const landingZ = flight1Base - flight1Steps * 0.3 - 1.2
  b.box({ x: towerX, y: landingY, z: landingZ, w: 1.8, h: 0.2, d: 2.4, color: COLORS.concrete })
  const flight2Steps = 24 // weitere 3,84 m -> 7,52 m Gesamthoehe
  b.stairs({
    x: towerX - 2,
    y: landingY + 0.2,
    z: landingZ + 0.6,
    width: 1.8,
    steps: flight2Steps,
    color: COLORS.concrete,
    dir: 'south',
  })
  const topY = landingY + 0.2 + flight2Steps * 0.16
  const topZ = landingZ + 0.6 + flight2Steps * 0.3
  // Steg vom Treppenturm auf das Dach von Block A.
  b.box({ x: (towerX - 2 + a.x0) / 2, y: topY - 0.2, z: topZ, w: a.x0 - towerX + 3, h: 0.2, d: 2, color: COLORS.concrete })

  // Dachabstieg an der Ostseite von Block C: kurze Absaetze statt Sprung ins Nichts.
  for (let i = 0; i < 5; i++) {
    b.box({
      x: c.x0 + c.w + 0.8,
      y: 6.2 - i * 1.3,
      z: c.z0 + 2 + i * 1.6,
      w: 2.2,
      h: 0.2,
      d: 1.6,
      color: COLORS.metal,
    })
  }

  return new THREE.Vector3(startX, 0, frontZ + 1.2)
}

/**
 * Transitwerk: Ort des Licht-/Scanner-Raetsels.
 * Zwei Ventile und ein Lichtstrahl - Beobachtung und Reihenfolge statt Kampf.
 */
function buildTransitWorks(b: WorldBuilder): {
  valves: THREE.Vector3[]
  beamTarget: THREE.Vector3
  gate: THREE.Vector3
} {
  const x0 = -16
  const z0 = 14
  b.box({ x: x0 + 5, y: 0, z: z0 + 4, w: 10, h: 5, d: 8, color: COLORS.navyMid })
  b.box({ x: x0 + 5, y: 5, z: z0 + 4, w: 10.6, h: 0.4, d: 8.6, color: COLORS.roof })
  b.railing({ x: x0 + 5, z: z0 + 8, y: 5.4, length: 10, axis: 'x', color: COLORS.metal, collide: false })
  // Offene Halle zur Promenade hin.
  b.box({ x: x0 + 5, y: 3.4, z: z0 + 8.1, w: 6, h: 1.6, d: 0.3, color: COLORS.navy, collide: false })
  // Rohrleitung als Wegweiser zum Hafen.
  b.box({ x: x0 + 5, y: 3.8, z: z0 + 12, w: 0.6, h: 0.6, d: 8, color: COLORS.metal, collide: false })

  // Der "vierte Weg": Wartungstreppe auf das Dach, hinter einem Tor.
  b.stairs({ x: x0 + 11.2, y: 0, z: z0 + 8, width: 1.4, steps: 34, color: COLORS.metal, dir: 'north' })
  // Podest schwenkt vom Treppenkopf auf die Dachflaeche.
  b.box({ x: x0 + 10.7, y: 5.24, z: z0 - 0.4, w: 3.4, h: 0.2, d: 3.2, color: COLORS.metal })

  const valves = [
    new THREE.Vector3(x0 + 2.2, 1.3, z0 + 8.1),
    new THREE.Vector3(x0 + 7.8, 1.3, z0 + 8.1),
  ]
  return {
    valves,
    beamTarget: new THREE.Vector3(x0 + 5, 3.0, z0 + 4),
    gate: new THREE.Vector3(x0 + 11.2, 0, z0 + 8.4),
  }
}

/** Promenade: 6,0 m freie Hauptbreite, Hafengelaender 1,1 m. */
function buildPromenade(b: WorldBuilder): void {
  b.box({ x: 0, y: 0, z: 29, w: 120, h: CURB_HEIGHT, d: 6, color: COLORS.concrete })
  paveJoints(b, { x: 0, z: 29, w: 120, d: 6, y: CURB_HEIGHT, spacing: 3 })
  // Das Hafengelaender laesst an der Wassertaxi-Station eine 6 m breite Durchfahrt
  // frei - sonst waeren Dock, Werftstege und alle Wasserfahrzeuge zu Fuss
  // unerreichbar und nur per Teleport zu bespielen.
  b.railing({ x: -26.5, z: 32.2, y: CURB_HEIGHT, length: 67, axis: 'x', color: COLORS.metal })
  b.railing({ x: 36.5, z: 32.2, y: CURB_HEIGHT, length: 47, axis: 'x', color: COLORS.metal })
  for (let x = -50; x <= 50; x += 10) {
    b.box({ x, y: CURB_HEIGHT, z: 26.6, w: 0.3, h: 3.2, d: 0.3, color: COLORS.metal })
    b.box({ x, y: 3.35 + CURB_HEIGHT, z: 26.6, w: 0.9, h: 0.25, d: 0.5, color: COLORS.gold, collide: false })
  }
}

/**
 * Hafenleuchtturm nach 10_Bauwerke_und_Infrastruktur/04_Hafen_Leuchtturm:
 * achteckiger Natursteinsockel, runder verjuengter Schaft mit zwei roten
 * Ringbaendern, vorkragende Galerie, verglaste Laterne, Patinakuppel.
 *
 * Er ist die Landmarke des Hafens und war bisher ein Stapel aus fuenf Quadern.
 * Ein Turm steht und faellt mit seiner Silhouette, und die eines Zylinders ist
 * aus Kisten nicht zu bauen - deshalb laeuft der Schaft ueber `shape()`.
 */
function buildLighthouse(b: WorldBuilder): { x: number; z: number } {
  const x = 42
  const z = 40
  const at = (y: number, dx = 0, dz = 0): [number, number, number] => [x + dx, y, z + dz]

  // Sockel: Achteck aus zwei Zylindern mit acht Seiten, oben ein Gesimsring.
  const socleTop = 2.0
  b.shape(cylinder(5.0, 5.3, socleTop, 8), COLORS.stoneShade, { pos: at(socleTop / 2) })
  b.shape(cylinder(5.35, 5.1, 0.28, 8), COLORS.stone, { pos: at(socleTop + 0.14) })
  b.collisionAdd(
    new THREE.Box3(
      new THREE.Vector3(x - 4.9, 0, z - 4.9),
      new THREE.Vector3(x + 4.9, socleTop + 0.28, z + 4.9),
    ),
  )
  // Treppe von der Mole auf den Sockel, an der Landseite. `north` steigt in
  // Richtung -z an und liefe damit vom Turm weg; 14 Stufen a 0,16 m ergeben
  // genau die 2,24 m Sockelhoehe, die Lauflaenge von 4,2 m endet auf der
  // Sockelkante bei z - 4,9.
  b.stairs({ x, y: 0, z: z - 9.0, width: 2.6, steps: 14, color: COLORS.stoneShade, dir: 'south' })
  // Sockelgelaender: acht Pfosten mit goldenem Knauf und zwei Ringen.
  const railR = 4.6
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const px = Math.cos(a) * railR
    const pz = Math.sin(a) * railR
    b.shape(cylinder(0.07, 0.09, 1.0, 6), COLORS.patina, { pos: at(socleTop + 0.78, px, pz) })
    b.shape(sphere(0.11, 6, 5), COLORS.gold, { pos: at(socleTop + 1.3, px, pz) })
  }
  for (const ry of [socleTop + 0.72, socleTop + 1.18]) {
    b.shape(torus(railR, 0.045, 5, 16), COLORS.patina, { pos: at(ry), rot: [Math.PI / 2, 0, 0] })
  }

  // Schaft: ein Kegelstumpf von 3,2 m auf 2,2 m Radius ueber 17 m.
  const shaftBottom = socleTop + 0.28
  const shaftHeight = 17
  const rLow = 3.2
  const rHigh = 2.2
  const radiusAt = (y: number) => rLow + ((rHigh - rLow) * (y - shaftBottom)) / shaftHeight
  b.shape(cylinder(rHigh, rLow, shaftHeight, 16), COLORS.cream, {
    pos: at(shaftBottom + shaftHeight / 2),
  })
  b.collisionAdd(
    new THREE.Box3(
      new THREE.Vector3(x - rLow, shaftBottom, z - rLow),
      new THREE.Vector3(x + rLow, shaftBottom + shaftHeight, z + rLow),
    ),
  )
  // Zwei rote Ringbaender - das Erkennungszeichen. Sie folgen der Verjuengung,
  // sonst stehen sie am oberen Rand vom Schaft ab.
  for (const [y0, h] of [
    [shaftBottom + 4.6, 2.4],
    [shaftBottom + 10.4, 1.3],
  ]) {
    b.shape(cylinder(radiusAt(y0 + h) + 0.05, radiusAt(y0) + 0.05, h, 16), COLORS.coral, {
      pos: at(y0 + h / 2),
    })
  }
  // Rundbogentuer zur Landseite, mit Natursteingewaende.
  const doorR = radiusAt(shaftBottom + 1.2)
  b.shape(box(1.5, 2.6, 0.3), COLORS.stone, { pos: at(shaftBottom + 1.3, 0, -doorR) })
  b.shape(box(1.1, 2.1, 0.2), COLORS.patina, { pos: at(shaftBottom + 1.05, 0, -doorR - 0.1) })
  b.shape(cylinder(0.55, 0.55, 0.2, 12), COLORS.patina, {
    pos: at(shaftBottom + 2.1, 0, -doorR - 0.1),
    rot: [Math.PI / 2, 0, 0],
  })
  // Uhrmedaillon ueber der Tuer.
  b.shape(cylinder(0.62, 0.62, 0.16, 14), COLORS.gold, {
    pos: at(shaftBottom + 4.0, 0, -radiusAt(shaftBottom + 4.0) - 0.02),
    rot: [Math.PI / 2, 0, 0],
  })
  b.shape(cylinder(0.46, 0.46, 0.2, 14), COLORS.cream, {
    pos: at(shaftBottom + 4.0, 0, -radiusAt(shaftBottom + 4.0) - 0.06),
    rot: [Math.PI / 2, 0, 0],
  })
  // Kleine Rundbogenfenster, versetzt um den Schaft.
  for (const [wy, wa] of [
    [shaftBottom + 3.4, Math.PI * 0.62],
    [shaftBottom + 7.8, Math.PI * 1.15],
    [shaftBottom + 8.2, Math.PI * 0.05],
    [shaftBottom + 12.4, Math.PI * 1.55],
    [shaftBottom + 13.0, Math.PI * 0.75],
  ]) {
    const r = radiusAt(wy) + 0.02
    b.shape(box(0.62, 0.9, 0.24), COLORS.stone, {
      pos: at(wy, Math.cos(wa) * r, Math.sin(wa) * r),
      rot: [0, -wa, 0],
    })
    b.shape(box(0.4, 0.66, 0.3), COLORS.navyMid, {
      pos: at(wy, Math.cos(wa) * r, Math.sin(wa) * r),
      rot: [0, -wa, 0],
    })
  }

  // Galerie: Kragsteine, Plattform und umlaufendes Gelaender.
  const galleryY = shaftBottom + shaftHeight
  const galleryR = rHigh + 1.5
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    b.shape(box(0.24, 0.5, 1.5), COLORS.stone, {
      pos: at(galleryY - 0.42, Math.cos(a) * (rHigh + 0.6), Math.sin(a) * (rHigh + 0.6)),
      rot: [0, -a, 0],
    })
  }
  b.shape(cylinder(galleryR, galleryR - 0.25, 0.34, 16), COLORS.stone, { pos: at(galleryY + 0.17) })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    b.shape(cylinder(0.06, 0.07, 0.95, 5), COLORS.patina, {
      pos: at(galleryY + 0.81, Math.cos(a) * (galleryR - 0.2), Math.sin(a) * (galleryR - 0.2)),
    })
  }
  for (const ry of [galleryY + 0.72, galleryY + 1.24]) {
    b.shape(torus(galleryR - 0.2, 0.04, 5, 20), COLORS.patina, {
      pos: at(ry),
      rot: [Math.PI / 2, 0, 0],
    })
  }

  // Laternenhaus: Glaszylinder mit Sprossen, darin das Feuer.
  const lanternY = galleryY + 0.34
  const lanternH = 2.5
  // Das Feuer steht offen zwischen den Sprossen. Ein geschlossener Glaszylinder
  // davor waere im Batch undurchsichtig und verdeckte genau das, was leuchten
  // soll - die Laterne bliebe eine graue Dose.
  b.shape(cylinder(1.6, 1.7, lanternH - 0.3, 12), COLORS.lanternGlow, {
    pos: at(lanternY + lanternH / 2),
  })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    b.shape(box(0.11, lanternH, 0.11), COLORS.patina, {
      pos: at(lanternY + lanternH / 2, Math.cos(a) * 1.78, Math.sin(a) * 1.78),
      rot: [0, -a, 0],
    })
  }
  b.shape(cylinder(1.95, 1.8, 0.22, 12), COLORS.patina, { pos: at(lanternY + 0.11) })

  // Kuppel, Knauf und Spitze.
  const domeY = lanternY + lanternH
  b.shape(cylinder(1.9, 2.05, 0.26, 12), COLORS.patina, { pos: at(domeY + 0.13) })
  b.shape(sphere(1.75, 12, 8), COLORS.patina, { pos: at(domeY + 0.26), scale: [1, 0.78, 1] })
  b.shape(sphere(0.28, 8, 6), COLORS.gold, { pos: at(domeY + 1.7) })
  b.shape(cylinder(0.02, 0.06, 1.5, 5), COLORS.gold, { pos: at(domeY + 2.6) })

  return { x, z }
}

/** Bluefin-Wassertaxi-Station: 12 x 8 m, 4,5 m hoch, Dock 8 x 6 m, Rampe 1,8 m. */
function buildWaterTaxiStation(b: WorldBuilder): void {
  const x = 10
  // Bahnsteig auf 0,30 m - ein 0,15-m-Absatz zum schwimmenden Dock.
  b.box({ x, y: 0, z: 30, w: 12, h: 0.3, d: 8, color: COLORS.wood })
  for (const dx of [-5.5, 5.5]) {
    b.box({ x: x + dx, y: 0.3, z: 30, w: 0.4, h: 4.2, d: 8, color: COLORS.wood, collide: false })
  }
  b.box({ x, y: 4.5, z: 30, w: 12.6, h: 0.4, d: 8.6, color: COLORS.cyan })
  // Schwimmendes Dock 8 x 7,5 m, Oberkante auf Promenadenniveau.
  b.box({ x, y: -0.45, z: 37.75, w: 8, h: 0.6, d: 7.5, color: COLORS.wood })
  b.railing({ x, z: 41.3, y: 0.15, length: 8, axis: 'x', color: COLORS.metal })
  b.box({ x: x - 3, y: 0.15, z: 36, w: 0.4, h: 1.2, d: 0.4, color: COLORS.coral })
}

/**
 * Werftstege westlich der Wassertaxi-Station: Flugsteg fuer das Skyfin und
 * Tauchbecken fuer den Bluefin Scout. Beide Pontons liegen auf 0,15 m wie das
 * schwimmende Dock, damit man ohne Stufe hinueberlaeuft.
 */
function buildHarborDocks(b: WorldBuilder, scene: THREE.Scene): THREE.Group {
  const top = -0.45
  const thickness = 0.6
  // Laengssteg vom schwimmenden Dock (x = 6) nach Westen.
  b.box({ x: -5, y: top, z: 37.5, w: 22, h: thickness, d: 3, color: COLORS.wood })
  // Flugsteg-Ponton, Nordkante bei z = 44: davor liegt das Skyfin.
  b.box({ x: -12, y: top, z: 41.5, w: 10, h: thickness, d: 5, color: COLORS.wood })
  b.railing({ x: -16.9, z: 41.5, y: 0.15, length: 5, axis: 'z', color: COLORS.metal })
  // Windsack als Landmarke fuer den Anflug. Der Mast bleibt statisch, der Sack
  // wird eine eigene Gruppe - er soll sich in den Wind drehen.
  b.box({ x: -16.4, y: 0.15, z: 39.6, w: 0.25, h: 4.2, d: 0.25, color: COLORS.metal })
  b.shape(torus(0.34, 0.05, 5, 12), COLORS.metal, {
    pos: [-16.4, 4.25, 39.6],
    rot: [Math.PI / 2, 0, 0],
  })
  const windsock = buildWindsock(scene, -16.4, 4.25, 39.6)
  // Tauchbecken-Ponton, Ostkante bei x = 5: daneben liegt der Scout.
  b.box({ x: 0.5, y: top, z: 42, w: 9, h: thickness, d: 6, color: COLORS.wood })
  b.railing({ x: 0.5, z: 44.9, y: 0.15, length: 9, axis: 'x', color: COLORS.metal })
  b.railing({ x: -3.9, z: 42, y: 0.15, length: 6, axis: 'z', color: COLORS.metal })
  // Poller und Geraeteschuppen der Werft.
  for (const [px, pz] of [
    [-7.4, 39.6],
    [4.4, 39.6],
  ]) {
    b.box({ x: px, y: 0.15, z: pz, w: 0.4, h: 1.0, d: 0.4, color: COLORS.coral })
  }
  b.box({ x: -2.5, y: 0.15, z: 43.4, w: 2.4, h: 2.4, d: 2.4, color: COLORS.cream })
  b.box({ x: -2.5, y: 2.55, z: 43.4, w: 2.8, h: 0.3, d: 2.8, color: COLORS.roof })

  // Werftmoeblierung. Alles bleibt ausserhalb der Einstiegsanker der drei
  // Wasserfahrzeuge: der Skyfin steigt bei etwa (-11,6 / 43,9) ein, der Scout
  // bei (4,2 / 42,8). Steht dort etwas, verweigert die Kette den Einstieg -
  // richtig, aber aus dem falschen Grund.
  // Dalben mit Tauen entlang der Nordkante des Laengsstegs.
  const pileX = [-15, -10, -5, 0, 5]
  for (const px of pileX) {
    b.box({ x: px, y: 0.15, z: 38.6, w: 0.3, h: 1.7, d: 0.3, color: COLORS.wood })
    b.box({ x: px, y: 1.85, z: 38.6, w: 0.42, h: 0.14, d: 0.42, color: COLORS.stoneShade, collide: false })
  }
  for (let i = 0; i < pileX.length - 1; i++) {
    const from = pileX[i]
    b.box({
      x: from + 2.5,
      y: 1.28,
      z: 38.6,
      w: 5,
      h: 0.07,
      d: 0.07,
      color: COLORS.fynnoxLeather,
      collide: false,
    })
  }
  // Fender an der Stegkante - dieselbe Rolle wie am Wassertaxi.
  for (const fx of [-12.5, -7.5, -2.5, 2.5]) {
    b.box({ x: fx, y: -0.5, z: 39.1, w: 0.34, h: 0.5, d: 0.16, color: COLORS.tyre, collide: false })
  }
  // Ladekran am Westende: Mast, Ausleger, Hubseil, Haken.
  b.box({ x: -15.4, y: 0.15, z: 36.6, w: 1.1, h: 0.35, d: 1.1, color: COLORS.metal })
  b.box({ x: -15.4, y: 0.5, z: 36.6, w: 0.34, h: 3.9, d: 0.34, color: COLORS.coral })
  b.box({ x: -14.1, y: 4.15, z: 36.6, w: 3.0, h: 0.26, d: 0.26, color: COLORS.coral, collide: false })
  b.box({ x: -12.8, y: 2.3, z: 36.6, w: 0.06, h: 1.85, d: 0.06, color: COLORS.metal, collide: false })
  b.box({ x: -12.8, y: 2.0, z: 36.6, w: 0.26, h: 0.32, d: 0.26, color: COLORS.metal, collide: false })
  // Kisten und Fassware neben dem Geraeteschuppen.
  // Die Kisten stehen auf dem Ponton (x -4 bis 5, z 39 bis 45), nicht daneben
  // im Wasser, und westlich des Geraeteschuppens bei z 42,2.
  for (const [kx, ky, kz, kh, color] of [
    [-3.0, 0.15, 40.5, 0.9, COLORS.wood],
    [-1.7, 0.15, 40.4, 0.9, COLORS.gold],
    // Zweite Lage auf der ersten Kiste.
    [-3.0, 1.05, 40.5, 0.7, COLORS.coral],
    [-0.6, 0.15, 44.0, 0.8, COLORS.wood],
  ] as [number, number, number, number, string][]) {
    b.box({ x: kx, y: ky, z: kz, w: 1.0, h: kh, d: 1.0, color })
  }
  // Aufgeschossenes Tau und Rettungsringkasten auf dem Steg.
  b.box({ x: -8.6, y: 0.15, z: 37.6, w: 0.9, h: 0.16, d: 0.9, color: COLORS.fynnoxLeather, collide: false })
  b.box({ x: -8.6, y: 0.31, z: 37.6, w: 0.6, h: 0.12, d: 0.6, color: COLORS.fynnoxLeather, collide: false })
  b.box({ x: -6.2, y: 0.15, z: 38.4, w: 0.7, h: 0.9, d: 0.3, color: COLORS.coral })
  b.box({ x: -6.2, y: 1.05, z: 38.4, w: 0.8, h: 0.12, d: 0.36, color: COLORS.cream, collide: false })

  return windsock
}

/**
 * Forschungsplattform im Hafenbecken. Nur ueber das Wassertaxi erreichbar -
 * damit hat das zweite Fahrzeug ein echtes Ziel und keinen Selbstzweck.
 */
function buildResearchPlatform(b: WorldBuilder): { x: number; z: number; deck: number } {
  const x = 34
  const z = 62
  const deck = 0.6

  // Stelzen bis auf den Beckenboden.
  for (const [dx, dz] of [
    [-5, -5],
    [5, -5],
    [-5, 5],
    [5, 5],
  ]) {
    b.box({ x: x + dx, y: -3, z: z + dz, w: 0.6, h: 3.6, d: 0.6, color: COLORS.metal, collide: false })
  }
  b.box({ x, y: deck - 0.3, z, w: 12, h: 0.3, d: 12, color: COLORS.wood })
  b.railing({ x, z: z + 5.9, y: deck, length: 12, axis: 'x', color: COLORS.metal })
  b.railing({ x, z: z - 5.9, y: deck, length: 12, axis: 'x', color: COLORS.metal })
  b.railing({ x: x + 5.9, z, y: deck, length: 12, axis: 'z', color: COLORS.metal })
  // Backbordseite bleibt offen: dort legt das Wassertaxi an.
  b.railing({ x: x - 5.9, z: z + 4, y: deck, length: 3.6, axis: 'z', color: COLORS.metal })
  b.railing({ x: x - 5.9, z: z - 4, y: deck, length: 3.6, axis: 'z', color: COLORS.metal })

  // Messhuette und Sonarmast.
  b.box({ x: x + 3, y: deck, z: z - 3, w: 4, h: 2.8, d: 4, color: COLORS.cream })
  b.box({ x: x + 3, y: deck + 2.8, z: z - 3, w: 4.4, h: 0.3, d: 4.4, color: COLORS.roof })
  b.box({ x: x - 2, y: deck, z: z + 3, w: 0.3, h: 6, d: 0.3, color: COLORS.metal, collide: false })
  b.box({ x: x - 2, y: deck + 6, z: z + 3, w: 1.6, h: 0.2, d: 1.6, color: COLORS.cyan, collide: false })
  // Kisten mit Forschungsproben.
  b.box({ x: x - 3.5, y: deck, z: z - 2, w: 1.2, h: 0.8, d: 1.2, color: COLORS.gold })
  b.box({ x: x - 3.5, y: deck + 0.8, z: z - 2, w: 0.9, h: 0.6, d: 0.9, color: COLORS.coral })

  return { x, z, deck }
}

/** Strassenlaterne: Sockel und Mast tragen, Ausleger und Leuchte nicht. */
function streetLamp(b: WorldBuilder, x: number, z: number): void {
  const base = CURB_HEIGHT
  b.box({ x, y: base, z, w: 0.34, h: 0.3, d: 0.34, color: COLORS.navy })
  b.box({ x, y: base + 0.3, z, w: 0.16, h: 3.5, d: 0.16, color: COLORS.navy })
  b.box({ x, y: base + 3.8, z, w: 0.46, h: 0.1, d: 0.46, color: COLORS.navy, collide: false })
  b.box({ x, y: base + 3.9, z, w: 0.36, h: 0.32, d: 0.36, color: COLORS.gold, collide: false })
  b.box({ x, y: base + 4.22, z, w: 0.44, h: 0.1, d: 0.44, color: COLORS.navy, collide: false })
}

/**
 * Windsack als eigene Gruppe: gestreifter Kegelstumpf entlang der lokalen
 * +Z-Achse, damit `rotation.y` direkt die Windrichtung ist.
 */
function buildWindsock(scene: THREE.Scene, x: number, y: number, z: number): THREE.Group {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  const b = new PartBatcher()
  const rings = 5
  for (let i = 0; i < rings; i++) {
    const t0 = i / rings
    const t1 = (i + 1) / rings
    const r0 = 0.32 - t0 * 0.16
    const r1 = 0.32 - t1 * 0.16
    b.add(cylinder(r1, r0, 0.38, 10), i % 2 ? COLORS.cream : COLORS.coral, {
      pos: [0, 0, 0.19 + i * 0.38],
      rot: [Math.PI / 2, 0, 0],
    })
  }
  b.finish(group)
  scene.add(group)
  return group
}

/**
 * Pflanzbeet mit Randstein und Blueten. Gemeinsamer Fuss aller Baumarten -
 * in den Referenzen steht kaum ein Baum nackt auf dem Pflaster.
 *
 * Nur der Randstein traegt Kollision; Erde, Blueten und Krone sind Kulisse.
 */
function plantingBed(b: WorldBuilder, x: number, z: number, radius = 0.8): number {
  const base = CURB_HEIGHT
  b.shape(
    cylinder(radius, radius + 0.04, 0.34, 10),
    COLORS.stoneShade,
    { pos: [x, base + 0.17, z] },
    { collide: true },
  )
  b.shape(cylinder(radius - 0.1, radius - 0.1, 0.1, 10), COLORS.barkDark, {
    pos: [x, base + 0.36, z],
  })
  // Blueten am Beetrand, ungleich verteilt - ein Kranz aus gleichen Abstaenden
  // liest als Zierrat, nicht als Bepflanzung.
  for (let i = 0; i < 6; i++) {
    const a = i * 1.9 + Math.sin(i * 3.1)
    const r = (radius - 0.22) * (0.7 + 0.3 * Math.abs(Math.cos(i * 2.2)))
    b.shape(sphere(0.15 + 0.05 * Math.abs(Math.sin(i * 1.7)), 6, 5), i % 3 ? COLORS.bloom : COLORS.gold, {
      pos: [x + Math.cos(a) * r, base + 0.44, z + Math.sin(a) * r],
      scale: [1, 0.7, 1],
    })
  }
  return base + 0.36
}

/**
 * Krone aus versetzten, unterschiedlich skalierten Kugeln.
 *
 * Zwei gestapelte Quader waren der letzte Rest der Graybox. Eine Krone traegt
 * ihre Wirkung ueber die zerklueftete Silhouette gegen den Himmel; dafuer
 * reichen drei Ballen nicht, sieben schon. `seed` verschiebt sie, damit
 * nebeneinanderstehende Baeume nicht als Kopie lesen.
 */
interface Blob {
  pos: [number, number, number]
  radius: number
  color: string
}

/** Die Ballen einer Krone, relativ zu ihrem Ansatzpunkt. */
function canopyBlobs(radius: number, seed: number, light: string, dark: string): Blob[] {
  const layout: [number, number, number, number][] = [
    [0, radius * 0.72, 0, 1.0],
    [-0.62, radius * 0.34, 0.24, 0.72],
    [0.58, radius * 0.4, -0.3, 0.68],
    [0.16, radius * 0.3, 0.66, 0.63],
    [-0.3, radius * 0.28, -0.6, 0.6],
    [0.34, radius * 1.06, 0.2, 0.62],
    [-0.36, radius * 0.98, -0.24, 0.56],
  ]
  return layout.map(([bx, by, bz, scale], i) => {
    const jitter = Math.sin(seed * 2.7 + i * 1.9) * 0.18
    return {
      pos: [(bx + jitter) * radius, by, (bz - jitter * 0.6) * radius],
      radius: radius * scale,
      // Obere Ballen zur Sonne hin heller, untere im Kernschatten dunkler. Das
      // traegt mehr als jede zusaetzliche Kugel.
      color: by > radius * 0.6 ? light : dark,
    }
  })
}

function canopy(
  b: WorldBuilder,
  x: number,
  y: number,
  z: number,
  radius: number,
  seed: number,
  light: string,
  dark: string,
): void {
  for (const blob of canopyBlobs(radius, seed, light, dark)) {
    b.shape(sphere(blob.radius, 8, 6), blob.color, {
      pos: [x + blob.pos[0], y + blob.pos[1], z + blob.pos[2]],
      scale: [1, 0.86, 1],
    })
  }
}

/**
 * Krone als eigene Gruppe statt im statischen Batch.
 *
 * Der WorldBuilder verschmilzt alles pro Material zu einem Mesh - eine Krone
 * darin liesse sich nicht mehr einzeln bewegen. Jede bewegte Krone kostet
 * deshalb zwei Draw-Calls, einen je Blattfarbe. Das ist der Grund, warum nur
 * eine Auswahl wiegt und nicht jeder Baum der Stadt.
 */
function swayingCanopy(
  scene: THREE.Scene,
  x: number,
  y: number,
  z: number,
  radius: number,
  seed: number,
  light: string,
  dark: string,
): THREE.Group {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  const batcher = new PartBatcher()
  for (const blob of canopyBlobs(radius, seed, light, dark)) {
    batcher.add(sphere(blob.radius, 8, 6), blob.color, { pos: blob.pos, scale: [1, 0.86, 1] })
  }
  batcher.finish(group)
  scene.add(group)
  return group
}

/**
 * Stadtbaum nach 23_Natur_und_Kleinobjekte/01_Vegetation/01_Stadtbaum:
 * heller Platanenstamm mit Astansaetzen und dichter Rundkrone.
 */
function plantedTree(
  b: WorldBuilder,
  x: number,
  z: number,
  seed = 0,
  sway?: { scene: THREE.Scene; out: THREE.Group[] },
): void {
  const top = plantingBed(b, x, z)
  const trunkH = 2.4
  b.shape(
    cylinder(0.15, 0.24, trunkH, 8),
    COLORS.barkPale,
    { pos: [x, top + trunkH / 2, z] },
    { collide: true },
  )
  // Zwei Astansaetze in die Krone - ohne sie schwebt die Krone auf einem Stab.
  for (const side of [-1, 1]) {
    b.shape(cylinder(0.07, 0.12, 1.1, 6), COLORS.barkPale, {
      pos: [x + side * 0.3, top + trunkH + 0.2, z + side * 0.14],
      rot: [side * 0.16, 0, -side * 0.42],
    })
  }
  const crownY = top + trunkH + 0.9
  if (sway) {
    sway.out.push(
      swayingCanopy(sway.scene, x, crownY, z, 1.35, seed, COLORS.foliageLight, COLORS.foliage),
    )
  } else {
    canopy(b, x, crownY, z, 1.35, seed, COLORS.foliageLight, COLORS.foliage)
  }
}

/**
 * Bluetenbaum nach 03_Bluetenbaum: schlanker dunkler Stamm, lockere Krone,
 * rosa Bluetenballen zwischen dem Laub.
 */
function blossomTree(b: WorldBuilder, x: number, z: number, seed = 0): void {
  const top = plantingBed(b, x, z, 0.7)
  const trunkH = 2.0
  b.shape(
    cylinder(0.11, 0.18, trunkH, 7),
    COLORS.barkDark,
    { pos: [x, top + trunkH / 2, z] },
    { collide: true },
  )
  for (const side of [-1, 1]) {
    b.shape(cylinder(0.06, 0.1, 1.2, 5), COLORS.barkDark, {
      pos: [x + side * 0.34, top + trunkH + 0.25, z - side * 0.2],
      rot: [-side * 0.22, 0, -side * 0.5],
    })
  }
  canopy(b, x, top + trunkH + 0.75, z, 1.1, seed + 4, COLORS.blossom, COLORS.foliage)
}

/**
 * Kuestenkiefer nach 02_Kuestenkiefer: geschwungener Stamm und drei flache,
 * gestaffelte Nadelpolster. Sie steht am Wasser, wo der Wind die Form macht.
 */
function coastalPine(b: WorldBuilder, x: number, z: number, lean = 0.22): void {
  const top = plantingBed(b, x, z, 0.75)
  // Der Stamm wird aus drei geneigten Abschnitten gebogen; ein gerader Zylinder
  // waere wieder ein Mast.
  const segments: [number, number, number, number][] = [
    [0, 0.0, 1.4, lean],
    [Math.sin(lean) * 1.3, 1.35, 1.2, -lean * 0.7],
    [Math.sin(lean) * 1.3 - Math.sin(lean * 0.7) * 1.1, 2.5, 1.0, lean * 0.5],
  ]
  let tipX = x
  for (const [dx, dy, len, tilt] of segments) {
    b.shape(cylinder(0.11, 0.17, len, 7), COLORS.barkDark, {
      pos: [x + dx, top + dy + len / 2, z],
      rot: [0, 0, tilt],
    })
    tipX = x + dx
  }
  // Drei Polster, das oberste am kleinsten - die Staffelung macht die Kiefer.
  const cushions: [number, number, number, number][] = [
    [tipX - 0.9, 2.5, 0.5, 1.15],
    [tipX + 0.75, 3.15, -0.35, 0.95],
    [tipX - 0.15, 3.85, 0.1, 1.3],
  ]
  for (const [px, py, pz, r] of cushions) {
    b.shape(sphere(r, 9, 6), COLORS.pineNeedle, {
      pos: [px, top + py, z + pz],
      scale: [1, 0.34, 1],
    })
    b.shape(sphere(r * 0.72, 8, 5), COLORS.foliageDark, {
      pos: [px, top + py + 0.18, z + pz],
      scale: [1, 0.3, 1],
    })
  }
}

/**
 * Faecherpalme nach 04_Faecherpalme: schuppiger konischer Stamm, Wedel
 * sternfoermig um den Schopf. Steht auf der Promenade zur Wasserseite.
 */
function fanPalm(b: WorldBuilder, x: number, z: number, seed = 0): void {
  const top = plantingBed(b, x, z, 0.85)
  const trunkH = 2.8
  b.shape(
    cylinder(0.24, 0.44, trunkH, 8),
    COLORS.barkDark,
    { pos: [x, top + trunkH / 2, z] },
    { collide: true },
  )
  // Schuppenkranz: der Stamm einer Palme ist nie glatt.
  for (let i = 0; i < 5; i++) {
    b.shape(cylinder(0.28 + i * 0.03, 0.32 + i * 0.03, 0.16, 8), COLORS.wood, {
      pos: [x, top + trunkH - 0.3 - i * 0.5, z],
    })
  }
  const crownY = top + trunkH
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + seed
    const droop = 0.5 + 0.25 * Math.sin(i * 2.3)
    b.shape(sphere(0.86, 7, 5), i % 2 ? COLORS.palmFrond : COLORS.foliage, {
      pos: [x + Math.cos(a) * 0.78, crownY + 0.32 - droop * 0.3, z + Math.sin(a) * 0.78],
      rot: [0, -a, droop],
      scale: [1.25, 0.14, 0.6],
    })
  }
  b.shape(sphere(0.34, 8, 6), COLORS.foliageDark, { pos: [x, crownY + 0.24, z] })
}

/** Heckenbusch nach 05_Heckenbusch: dichter Block mit unruhiger Oberkante. */
function hedge(b: WorldBuilder, x: number, z: number, length: number, axis: 'x' | 'z'): void {
  const y = CURB_HEIGHT
  const h = 0.95
  const w = axis === 'x' ? length : 0.9
  const d = axis === 'x' ? 0.9 : length
  b.box({ x, y, z, w, h: h - 0.25, d, color: COLORS.foliageDark })
  const count = Math.max(3, Math.round(length / 0.7))
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1) - 0.5) * (length - 0.5)
    b.shape(sphere(0.52, 7, 5), i % 2 ? COLORS.foliage : COLORS.foliageDark, {
      pos: [x + (axis === 'x' ? t : 0), y + h - 0.32, z + (axis === 'z' ? t : 0)],
      scale: [0.9, 0.66, 0.9],
    })
  }
}

/**
 * Kletterefeu nach 08_Kletterefeu: eine Bahn Blattwerk an einer Gebaeudekante.
 * Nach oben duenner werdend - Efeu waechst von unten und laeuft oben aus.
 */
function ivyStrip(
  b: WorldBuilder,
  x: number,
  z: number,
  fromY: number,
  toY: number,
  width: number,
  axis: 'x' | 'z',
  seed = 0,
): void {
  const rows = Math.max(3, Math.round((toY - fromY) / 0.55))
  for (let r = 0; r < rows; r++) {
    const y = fromY + (r / (rows - 1)) * (toY - fromY)
    const density = 1 - (r / rows) * 0.45
    const perRow = Math.max(2, Math.round((width / 0.6) * density))
    for (let i = 0; i < perRow; i++) {
      const t = (i / Math.max(1, perRow - 1) - 0.5) * width
      const wob = Math.sin(seed * 3.3 + r * 1.7 + i * 2.1)
      b.shape(sphere(0.3 + Math.abs(wob) * 0.12, 6, 5), wob > 0 ? COLORS.ivy : COLORS.foliageDark, {
        pos: [
          x + (axis === 'x' ? t : 0) + (axis === 'z' ? wob * 0.05 : 0),
          y + wob * 0.14,
          z + (axis === 'z' ? t : 0) + (axis === 'x' ? wob * 0.05 : 0),
        ],
        scale: axis === 'x' ? [1, 0.8, 0.42] : [0.42, 0.8, 1],
      })
    }
  }
}

/** Blumenkasten auf einer Fensterbank. */
function windowBox(
  b: WorldBuilder,
  x: number,
  y: number,
  z: number,
  width: number,
  axis: 'x' | 'z',
  seed = 0,
): void {
  const w = axis === 'x' ? width : 0.34
  const d = axis === 'x' ? 0.34 : width
  b.box({ x, y, z, w, h: 0.24, d, color: COLORS.wood, collide: false })
  const count = Math.max(2, Math.round(width / 0.42))
  for (let i = 0; i < count; i++) {
    const t = (i / Math.max(1, count - 1) - 0.5) * (width - 0.24)
    const pick = Math.sin(seed * 2.1 + i * 1.6)
    const color = pick > 0.3 ? COLORS.bloom : pick > -0.3 ? COLORS.foliage : COLORS.gold
    b.shape(sphere(0.19 + Math.abs(pick) * 0.06, 6, 5), color, {
      pos: [x + (axis === 'x' ? t : 0), y + 0.28, z + (axis === 'z' ? t : 0)],
      scale: [1, 0.8, 1],
    })
  }
}

/** Gestreifte Markise ueber einem Schaufenster. */
function awning(b: WorldBuilder, cx: number, z: number, width: number, faceSouth: boolean): void {
  const depth = 2.0
  const dz = faceSouth ? depth / 2 : -depth / 2
  const segments = 6
  for (let i = 0; i < segments; i++) {
    b.box({
      x: cx - width / 2 + (width / segments) * (i + 0.5),
      y: 3.15,
      z: z + dz,
      w: width / segments,
      h: 0.14,
      d: depth,
      color: i % 2 === 0 ? COLORS.coral : COLORS.cream,
      collide: false,
    })
  }
  // Bordkante und zwei Streben.
  b.box({ x: cx, y: 2.95, z: z + dz * 2, w: width, h: 0.22, d: 0.1, color: COLORS.cream, collide: false })
  for (const side of [-1, 1]) {
    b.box({
      x: cx + (side * width) / 2,
      y: 3.15,
      z: z + dz,
      w: 0.08,
      h: 0.1,
      d: depth,
      color: COLORS.metal,
      collide: false,
    })
  }
}

/** Segelboot im Hafenbecken - reine Kulisse, kein Hindernis fuer die Boote. */
function sailBoat(b: WorldBuilder, x: number, z: number, rot: number): void {
  const y = -0.55
  b.box({ x, y, z, w: 1.8, h: 0.55, d: 5.2, color: COLORS.cream, rotY: rot, collide: false })
  b.box({ x, y: y + 0.55, z, w: 1.3, h: 0.18, d: 3.6, color: COLORS.navyMid, rotY: rot, collide: false })
  b.box({ x, y: y + 0.7, z, w: 0.14, h: 5.2, d: 0.14, color: COLORS.metal, rotY: rot, collide: false })
  b.box({ x, y: y + 1.3, z, w: 0.1, h: 3.4, d: 2.2, color: COLORS.cream, rotY: rot, collide: false })
}

/** Abgestelltes Rad am Bordstein. */
function bicycle(b: WorldBuilder, x: number, z: number, rot: number): void {
  const y = CURB_HEIGHT
  for (const dz of [-0.55, 0.55]) {
    b.box({ x, y, z: z + dz, w: 0.08, h: 0.66, d: 0.66, color: COLORS.navy, rotY: rot, collide: false })
  }
  b.box({ x, y: y + 0.45, z, w: 0.08, h: 0.1, d: 1.2, color: COLORS.coral, rotY: rot, collide: false })
  b.box({ x, y: y + 0.55, z: z - 0.5, w: 0.5, h: 0.08, d: 0.08, color: COLORS.navy, rotY: rot, collide: false })
  b.box({ x, y: y + 0.62, z: z + 0.35, w: 0.22, h: 0.08, d: 0.34, color: COLORS.navy, rotY: rot, collide: false })
}

/**
 * Strassenmoeblierung. Die Bildreferenzen zeigen keine leeren Flaechen -
 * Laternen, Baumbeete, Markisen und Kuebel fuellen jeden Gehweg. Alles laeuft
 * ueber WorldBuilder und landet damit in den bestehenden Material-Batches;
 * nur Masten und Stammbeete tragen Kollision, der Rest ist reine Kulisse.
 */
function buildStreetDressing(b: WorldBuilder, sway: { scene: THREE.Scene; out: THREE.Group[] }): void {
  // Laternen stehen an der Aussenkante der 2-m-Gehwege: schlank genug, dass der
  // Gehweg begehbar bleibt, und weit genug von den NPC-Routen entfernt - die
  // Ambient-NPCs laufen ohne Kollision, wuerden also mitten durch ein Beet gehen.
  for (let x = -56; x <= 56; x += 16) {
    for (const z of [-16.7, -7.3]) streetLamp(b, x, z)
  }
  for (let z = -2; z <= 30; z += 11) {
    for (const x of [-4.7, 4.7]) streetLamp(b, x, z)
  }
  // Baumreihe auf der Promenade, drei Arten im Wechsel und im halben Abstand
  // wie zuvor. In 05_Orte_und_Landschaften ist die Promenade durchgaengig
  // begruent - eine Reihe gleicher Baeume alle 15 m liest als Allee-Attrappe.
  // Die Beete bleiben 1,6 m breit und damit ausserhalb der NPC-Route bei z=29.
  const promenadeZ = 30.6
  let seed = 0
  for (let x = -45; x <= 45; x += 7.5) {
    const step = Math.abs(Math.round(x / 7.5))
    const kind = step % 3
    if (kind === 0) {
      // Nur jeder zweite Stadtbaum der Promenade wiegt. Jede bewegte Krone
      // kostet zwei Draw-Calls; die Bewegung liest man ohnehin an wenigen.
      plantedTree(b, x, promenadeZ, seed++, step % 6 === 0 ? sway : undefined)
    } else if (kind === 1) fanPalm(b, x, promenadeZ, seed++)
    else blossomTree(b, x, promenadeZ, seed++)
  }
  // Kuestenkiefern an der Kaikante, wo der Wind die Form macht. Sie stehen
  // zwischen den Pollern, die Durchfahrt an der Station bleibt frei.
  for (const x of [-30, -13, 27, 39]) coastalPine(b, x, 32.5, x < 0 ? 0.26 : -0.24)
  // Bluetenkuebel jetzt an der Wasserseite - auf 30,8 m stuenden sie in der
  // dichteren Baumreihe.
  for (let x = -37.5; x <= 37.5; x += 15) {
    b.shape(cylinder(0.72, 0.78, 0.62, 12), COLORS.stoneShade, { pos: [x, CURB_HEIGHT + 0.31, 32.4] }, { collide: true })
    for (let i = 0; i < 5; i++) {
      const a = i * 1.4 + x * 0.3
      b.shape(sphere(0.3, 7, 5), i % 2 ? COLORS.bloom : COLORS.gold, {
        pos: [x + Math.cos(a) * 0.34, CURB_HEIGHT + 0.72, 32.4 + Math.sin(a) * 0.34],
        scale: [1, 0.75, 1],
      })
    }
  }
  // Platz: Stadtbaeume und Bluetenbaeume im Wechsel. Route 3 laeuft bei z=6,
  // die Beete bleiben mit 7,6 m klar daneben.
  for (const x of [-16, -10, 12, 18]) plantedTree(b, x, 7.6, seed++, x < 0 ? sway : undefined)
  for (const x of [-19, -13, 15, 21]) blossomTree(b, x, 7.6, seed++)
  // Hecken vor den Schaufenstern von Block B und C. Block A bleibt frei -
  // dort steht der Containerstapel der Parkourroute.
  hedge(b, 25, -20.4, 8, 'x')
  hedge(b, 37, -20.4, 8, 'x')
  // Efeubahnen an je einer Gebaeudekante. In den Referenzen traegt fast jede
  // Fassade Gruen; eine Kante pro Haus reicht, um den Eindruck zu setzen.
  ivyStrip(b, 30.2, -28, 0.4, 6.6, 5.5, 'z', 1)
  ivyStrip(b, 43.9, -28, 0.4, 6.6, 5.5, 'z', 2)
  ivyStrip(b, 8, -34.2, 0.4, 5.4, 4.0, 'x', 3)
  // Markisen ueber den Schaufenstern von Block A und B (Strassenseite z = -22).
  awning(b, 9, -22, 7.5, true)
  awning(b, 25, -22, 7.5, true)
  // Poller entlang der Kaikante, die Durchfahrt an der Station bleibt frei.
  for (let x = -40; x <= 40; x += 5) {
    if (x > 5 && x < 15) continue
    b.box({ x, y: 0, z: 33.6, w: 0.32, h: 0.75, d: 0.32, color: COLORS.coral, collide: false })
  }
  // Abgestellte Raeder am Platz und an der Metro.
  bicycle(b, -9.2, -9.4, 0)
  bicycle(b, -8.2, -9.4, 0)
  bicycle(b, 12.5, 3.2, Math.PI / 2)
  // Segelboote im Becken, abseits der Fahrrinnen und Liegeplaetze.
  sailBoat(b, -34, 52, 0.5)
  sailBoat(b, -46, 71, -0.3)
  sailBoat(b, 54, 64, 1.1)
}

function buildProps(b: WorldBuilder): void {
  // Baenke auf Promenade und Platz: Sitzblock 0,45 m hoch auf dem Gehweg.
  for (const [x, z] of [
    [-8, 27.5],
    [-4, 27.5],
    [14, 10],
    [-24, -16.2],
  ]) {
    b.box({ x, y: CURB_HEIGHT, z, w: 1.8, h: 0.45, d: 0.6, color: COLORS.wood })
    b.box({
      x,
      y: BENCH_SEAT_Y,
      z: z - 0.25,
      w: 1.8,
      h: 0.5,
      d: 0.12,
      color: COLORS.wood,
      collide: false,
    })
  }
  // Baeume auf Platz und Terrasse. Die drei Kisten pro Kuebel waren dieselbe
  // Graybox wie beim Strassenbaum - hier steht jetzt derselbe Baukasten.
  const spots: [number, number][] = [
    [-20, 24],
    [6, 24],
    [-6, 6],
    [8, 6],
    [20, 27],
  ]
  for (let i = 0; i < spots.length; i++) {
    const [x, z] = spots[i]
    if (i % 2 === 0) plantedTree(b, x, z, 20 + i)
    else blossomTree(b, x, z, 20 + i)
  }
  // Ladestation aus dem Interaktionsmanifest (charging_station).
  b.box({ x: -22, y: CURB_HEIGHT, z: -15.5, w: 0.5, h: 1.5, d: 0.5, color: COLORS.cyan })
}
