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
  buildHarborDocks(b)
  const platform = buildResearchPlatform(b)
  buildProps(b)
  buildStreetDressing(b)

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

/** Strassenbaum im Pflanzbeet - in den Referenzen steht kaum ein Baum nackt. */
function plantedTree(b: WorldBuilder, x: number, z: number): void {
  const base = CURB_HEIGHT
  b.box({ x, y: base, z, w: 1.5, h: 0.32, d: 1.5, color: COLORS.concrete })
  b.box({ x, y: base + 0.32, z, w: 1.25, h: 0.1, d: 1.25, color: COLORS.foliageDark, collide: false })
  for (const [dx, dz] of [
    [-0.4, -0.36],
    [0.36, -0.4],
    [-0.36, 0.4],
    [0.4, 0.33],
  ]) {
    b.box({ x: x + dx, y: base + 0.42, z: z + dz, w: 0.32, h: 0.14, d: 0.32, color: COLORS.bloom, collide: false })
  }
  b.box({ x, y: base + 0.32, z, w: 0.3, h: 2.5, d: 0.3, color: COLORS.wood })
  b.box({ x, y: base + 2.6, z, w: 3.0, h: 1.5, d: 3.0, color: COLORS.foliage, collide: false })
  b.box({ x, y: base + 3.7, z, w: 2.1, h: 1.1, d: 2.1, color: COLORS.foliageDark, collide: false })
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
function buildStreetDressing(b: WorldBuilder): void {
  // Laternen stehen an der Aussenkante der 2-m-Gehwege: schlank genug, dass der
  // Gehweg begehbar bleibt, und weit genug von den NPC-Routen entfernt - die
  // Ambient-NPCs laufen ohne Kollision, wuerden also mitten durch ein Beet gehen.
  for (let x = -56; x <= 56; x += 16) {
    for (const z of [-16.7, -7.3]) streetLamp(b, x, z)
  }
  for (let z = -2; z <= 30; z += 11) {
    for (const x of [-4.7, 4.7]) streetLamp(b, x, z)
  }
  // Baeume nur auf den breiten Flaechen: Promenade und Platz.
  for (let x = -45; x <= 45; x += 15) plantedTree(b, x, 30.6)
  for (const x of [-16, -10, 12, 18]) plantedTree(b, x, 7.6)
  // Blumenkuebel zwischen den Baeumen auf der Promenade.
  for (let x = -37.5; x <= 37.5; x += 15) {
    b.box({ x, y: CURB_HEIGHT, z: 30.8, w: 1.2, h: 0.7, d: 1.2, color: COLORS.wood })
    b.box({
      x,
      y: CURB_HEIGHT + 0.7,
      z: 30.8,
      w: 1.4,
      h: 0.5,
      d: 1.4,
      color: COLORS.bloom,
      collide: false,
    })
  }
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
