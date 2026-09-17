import { COLORS } from '../core/Palette'
import { cone, sphere } from '../core/Shapes'
import type { WorldBuilder } from '../world/WorldBuilder'
import { CITY, rand } from './CityPlan'

/**
 * Horizont rund um die grosse Stadt.
 *
 * Er ersetzt die Kulisse vom 09.09.2026. Die stand 70 bis 450 m weit weg - fuer
 * ein Hafenviertel von 160 m richtig, fuer eine Stadt von 1,1 km lag sie mitten
 * in den neuen Vierteln. Die Staffelung bleibt dieselbe Idee, nur im Massstab
 * der Stadt: nichts naeher als 150 m hinter der Stadtgrenze, je weiter hinten,
 * desto heller und blauer.
 *
 * Drei Seiten nach 03_Bildreferenzen/05_Orte_und_Landschaften/01_Hafenpromenade:
 *   Sueden  - gegenueberliegende Kueste mit Hochhaus-Skyline ueber dem Wasser
 *   Seiten  - bewaldete Kuestenhuegel, die die Bucht einfassen
 *   Norden  - Bergkette mit Schnee; dort ist die Bergregion geplant
 */
export function buildHorizon(b: WorldBuilder): void {
  b.withDetail('far', () => {
    buildOppositeShore(b)
    buildBayHills(b)
    buildMountains(b)
  })
}

function hill(b: WorldBuilder, x: number, z: number, radius: number, height: number, color: string, seed: number, base = 0): void {
  const sink = radius * 0.35
  b.shape(
    sphere(radius, 16, 9),
    color,
    {
      pos: [x, base - sink, z],
      scale: [1, (height + sink) / radius, 0.55 + rand(seed) * 0.5],
      rot: [0, rand(seed + 7) * Math.PI, 0],
    },
    { collide: false },
  )
}

function buildOppositeShore(b: WorldBuilder): void {
  const shoreZ = 1250
  b.box({ x: 0, y: -1, z: shoreZ + 400, w: 5200, h: 3, d: 800, color: COLORS.coastFar, collide: false })
  // Skyline in drei Gruppen, die mittlere am hoechsten.
  const clusters = [
    { x: -700, count: 22, peak: 140 },
    { x: 150, count: 34, peak: 260 },
    { x: 1000, count: 18, peak: 110 },
  ]
  let seed = 9000
  for (const c of clusters) {
    for (let i = 0; i < c.count; i++) {
      seed += 3
      const dx = (rand(seed) - 0.5) * 520
      const dz = rand(seed + 1) * 180
      const falloff = 1 - Math.min(1, Math.abs(dx) / 270)
      const height = 30 + falloff * c.peak * (0.4 + rand(seed + 2) * 0.7)
      const width = 22 + rand(seed + 3) * 30
      const color = rand(seed + 4) > 0.5 ? COLORS.cityFar : COLORS.cityFarShade
      b.box({ x: c.x + dx, y: 0, z: shoreZ + 60 + dz, w: width, h: height, d: width * (0.7 + rand(seed + 5) * 0.5), color, collide: false })
      if (height > 150) {
        b.shape(cone(width * 0.35, 40, 6), COLORS.cityFar, { pos: [c.x + dx, height + 20, shoreZ + 60 + dz] }, { collide: false })
      }
    }
    // Wahrzeichen: ein schlanker Turm je Gruppe.
    b.box({ x: c.x, y: 0, z: shoreZ + 100, w: 30, h: c.peak * 1.6, d: 30, color: COLORS.cityFar, collide: false })
    b.shape(cone(12, 70, 8), COLORS.cityFar, { pos: [c.x, c.peak * 1.6 + 35, shoreZ + 100] }, { collide: false })
  }
  for (let i = 0; i < 26; i++) {
    hill(b, -2400 + i * 190, shoreZ + 420 + rand(i + 50) * 160, 180 + rand(i + 60) * 90, 70 + rand(i + 70) * 90, COLORS.hillMid, i + 50)
  }
}

function buildBayHills(b: WorldBuilder): void {
  for (const side of [-1, 1]) {
    // Die Kueste biegt hinter der Stadtgrenze nach Sueden und schliesst die Bucht.
    for (let i = 0; i < 16; i++) {
      const t = i / 15
      const x = side * (CITY.east + 220 + t * 700 + rand(i * 3 + side) * 80)
      const z = 60 + t * 1150
      hill(b, x, z, 140 + rand(i + 20) * 80, 40 + rand(i + 30) * 70 + t * 40, i % 2 ? COLORS.hillNear : COLORS.woodFar, i + 20)
    }
    // Waldhuegel hinter der seitlichen Stadtgrenze.
    for (let i = 0; i < 14; i++) {
      const z = 40 - i * 120
      const x = side * (CITY.east + 200 + rand(i + 90) * 160)
      hill(b, x, z, 110 + rand(i + 100) * 60, 30 + rand(i + 110) * 40, i % 2 ? COLORS.woodFar : COLORS.woodFarDark, i + 90, i > 0 ? CITY.upperY : 0)
    }
  }
}

function buildMountains(b: WorldBuilder): void {
  // Vorberge direkt hinter dem Nordrand, bewaldet.
  for (let i = 0; i < 18; i++) {
    const x = -1100 + i * 130 + rand(i + 300) * 60
    hill(b, x, CITY.north - 220 - rand(i + 310) * 120, 120 + rand(i + 320) * 60, 50 + rand(i + 330) * 50, i % 2 ? COLORS.woodFar : COLORS.hillNear, i + 300, CITY.upperY)
  }
  // Hauptkamm mit Schneekappen. Kegel, weil ein Berg seine Wirkung ueber die
  // Spitze traegt; die Kappe ist ein kleinerer Kegel in derselben Achse.
  let seed = 400
  for (const row of [
    { count: 16, z: CITY.north - 700, height: 260, spread: 2600 },
    { count: 13, z: CITY.north - 1050, height: 420, spread: 3000 },
  ]) {
    for (let i = 0; i < row.count; i++) {
      seed += 5
      const x = -row.spread / 2 + (i / (row.count - 1)) * row.spread + (rand(seed) - 0.5) * 140
      const z = row.z - rand(seed + 1) * 180
      const h = row.height * (0.6 + rand(seed + 2) * 0.6)
      const r = h * (0.9 + rand(seed + 3) * 0.5)
      const rot: [number, number, number] = [0, rand(seed + 4) * Math.PI, 0]
      const squash: [number, number, number] = [1, 1, 0.7 + rand(seed + 5) * 0.4]
      b.shape(cone(r, h, 9), COLORS.mountainFar, { pos: [x, CITY.upperY + h / 2 - 2, z], rot, scale: squash }, { collide: false })
      const cap = h * 0.32
      b.shape(cone(r * 0.32 + 1, cap, 9), COLORS.snow, { pos: [x, CITY.upperY + h - cap / 2 - 2 + 0.6, z], rot, scale: squash }, { collide: false })
    }
  }
}
