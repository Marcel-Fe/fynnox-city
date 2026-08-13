import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
import { WorldBuilder } from './WorldBuilder'

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
  buildHarborDocks(b)
  const platform = buildResearchPlatform(b)
  buildProps(b)

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
    npcSeats: [
      new THREE.Vector3(-8, 0.45, 27.5),
      new THREE.Vector3(-4, 0.45, 27.5),
      new THREE.Vector3(14, 0.45, 10),
      new THREE.Vector3(garage.x + 6, 0.45, -16.2),
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

  // Rueckwand und Seitenwaende.
  b.box({ x: cx, y: 0, z: z0 + t / 2, w, h, d: t, color: COLORS.wallCoral })
  b.box({ x: x0 + t / 2, y: 0, z: cz, w: t, h, d, color: COLORS.wallCoral })
  b.box({ x: x0 + w - t / 2, y: 0, z: cz, w: t, h, d, color: COLORS.wallCoral })
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
    color: COLORS.wallCoral,
  })
  b.box({
    x: x0 + w - sideWidth / 2,
    y: 0,
    z: z0 + d - t / 2,
    w: sideWidth,
    h,
    d: t,
    color: COLORS.wallCoral,
  })
  b.box({ x: cx, y: 4.2, z: z0 + d - t / 2, w: doorWidth, h: h - 4.2, d: t, color: COLORS.wallCoral })
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

  // Fenster im 2,5-m-Fassadenraster, Standardfenster 1,2 x 1,5 m.
  const columns = Math.floor(w / FACADE_MODULE)
  const rows = options.floors - 1
  for (let c = 0; c < columns; c++) {
    const x = x0 + (w - columns * FACADE_MODULE) / 2 + c * FACADE_MODULE + FACADE_MODULE / 2
    if (shopFront) {
      // Schaufensterfeld 2,5 x 2,6 m.
      wall(x, 0.6, z0 + d - 0.05, 2.2, 2.6, 0.12, COLORS.glass)
      wall(x, 0.6, z0 + 0.05, 2.2, 2.6, 0.12, COLORS.glass)
    }
    for (let r = 0; r < rows; r++) {
      const y = groundHeight + r * FLOOR_HEIGHT + 0.9
      wall(x, y, z0 + d - 0.05, 1.2, 1.5, 0.12, COLORS.glass)
      wall(x, y, z0 + 0.05, 1.2, 1.5, 0.12, COLORS.glass)
    }
  }
  const depthColumns = Math.floor(d / FACADE_MODULE)
  for (let c = 0; c < depthColumns; c++) {
    const z = z0 + (d - depthColumns * FACADE_MODULE) / 2 + c * FACADE_MODULE + FACADE_MODULE / 2
    for (let r = 0; r < rows; r++) {
      const y = groundHeight + r * FLOOR_HEIGHT + 0.9
      wall(x0 + 0.05, y, z, 0.12, 1.5, 1.2, COLORS.glass)
      wall(x0 + w - 0.05, y, z, 0.12, 1.5, 1.2, COLORS.glass)
    }
  }

  // Einzeltuer 1,0 x 2,2 m auf der Strassenseite.
  wall(cx + w / 2 - 1.6, 0, z0 + d - 0.02, 1.0, 2.2, 0.1, COLORS.wood)

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

  return { x0, z0, w, d, height: roofTop }
}

/** Tideline-Metro-Eingang: 14 x 10 m, 6,5 m hoch, Eingang 4 m frei. */
function buildMetroEntrance(b: WorldBuilder): void {
  const x0 = -18
  const z0 = -32
  b.box({ x: x0 + 7, y: 0, z: z0 + 5, w: 14, h: 6.5, d: 10, color: COLORS.navyMid })
  b.box({ x: x0 + 7, y: 6.5, z: z0 + 5, w: 15, h: 0.4, d: 11, color: COLORS.roof })
  b.box({ x: x0 + 7, y: 0, z: z0 + 10.2, w: 4, h: 4, d: 0.4, color: COLORS.cyan, collide: false })
  b.box({ x: x0 + 7, y: 4.4, z: z0 + 10.4, w: 6, h: 1.2, d: 0.3, color: COLORS.coral, collide: false })
}

/** Maker-Markt-Uhrpavillon: 6 x 6 m, 12 m hoch, Durchgang 2,5 m. */
function buildClockPavilion(b: WorldBuilder): void {
  const x = -12
  const z = 4
  for (const [dx, dz] of [
    [-2.6, -2.6],
    [2.6, -2.6],
    [-2.6, 2.6],
    [2.6, 2.6],
  ]) {
    b.box({ x: x + dx, y: 0, z: z + dz, w: 0.5, h: 9, d: 0.5, color: COLORS.wood })
  }
  b.box({ x, y: 9, z, w: 6.4, h: 1.6, d: 6.4, color: COLORS.wallCoral })
  b.box({ x, y: 10.6, z, w: 4.4, h: 1.4, d: 4.4, color: COLORS.roof })
  b.box({ x, y: 9.4, z: z + 3.3, w: 2.2, h: 0.9, d: 0.2, color: COLORS.cream, collide: false })
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

/** Hafenleuchtturm: Basis ca. 10 m, 24 m hoch. */
function buildLighthouse(b: WorldBuilder): { x: number; z: number } {
  const x = 42
  const z = 40
  b.box({ x, y: 0, z, w: 10, h: 2, d: 10, color: COLORS.concrete })
  b.box({ x, y: 2, z, w: 6.5, h: 18, d: 6.5, color: COLORS.cream })
  b.box({ x, y: 20, z, w: 7.6, h: 1, d: 7.6, color: COLORS.coral })
  b.box({ x, y: 21, z, w: 4.5, h: 2.4, d: 4.5, color: COLORS.glass })
  b.box({ x, y: 23.4, z, w: 5.4, h: 0.6, d: 5.4, color: COLORS.roof })
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
function buildHarborDocks(b: WorldBuilder): void {
  const top = -0.45
  const thickness = 0.6
  // Laengssteg vom schwimmenden Dock (x = 6) nach Westen.
  b.box({ x: -5, y: top, z: 37.5, w: 22, h: thickness, d: 3, color: COLORS.wood })
  // Flugsteg-Ponton, Nordkante bei z = 44: davor liegt das Skyfin.
  b.box({ x: -12, y: top, z: 41.5, w: 10, h: thickness, d: 5, color: COLORS.wood })
  b.railing({ x: -16.9, z: 41.5, y: 0.15, length: 5, axis: 'z', color: COLORS.metal })
  // Windsack als Landmarke fuer den Anflug.
  b.box({ x: -16.4, y: 0.15, z: 39.6, w: 0.25, h: 4.2, d: 0.25, color: COLORS.metal })
  b.box({ x: -15.6, y: 4.05, z: 39.6, w: 1.6, h: 0.5, d: 0.5, color: COLORS.coral, collide: false })
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

function buildProps(b: WorldBuilder): void {
  // Baenke auf Promenade und Platz (Sitzhoehe 0,45 m).
  for (const [x, z] of [
    [-8, 27.5],
    [-4, 27.5],
    [14, 10],
    [-24, -16.2],
  ]) {
    b.box({ x, y: 0.15, z, w: 1.8, h: 0.45, d: 0.6, color: COLORS.wood })
    b.box({ x, y: 0.6, z: z - 0.25, w: 1.8, h: 0.5, d: 0.12, color: COLORS.wood, collide: false })
  }
  // Pflanzkuebel und Baeume.
  for (const [x, z] of [
    [-20, 24],
    [6, 24],
    [-6, 6],
    [8, 6],
    [20, 27],
  ]) {
    b.box({ x, y: 0.15, z, w: 1.6, h: 0.6, d: 1.6, color: COLORS.concrete })
    b.box({ x, y: 0.75, z, w: 0.3, h: 2.2, d: 0.3, color: COLORS.wood, collide: false })
    b.box({ x, y: 2.6, z, w: 2.8, h: 2.2, d: 2.8, color: COLORS.foliage, collide: false })
  }
  // Ladestation aus dem Interaktionsmanifest (charging_station).
  b.box({ x: -22, y: CURB_HEIGHT, z: -15.5, w: 0.5, h: 1.5, d: 0.5, color: COLORS.cyan })
}
