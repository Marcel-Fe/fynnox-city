import * as THREE from 'three'
import { tokens } from '../contracts/manifests'

/**
 * "Graphic Adventure 3D": klare Farbflaechen, weiche PBR-Materialien mit
 * kontrollierter Toon-Abstufung. Basisfarben stammen aus ONBOARDING_TOKENS.json,
 * die Fassadenfarben aus 11_Modulare_Bausaetze/01_Fassadenmodule.
 */
export const COLORS = {
  navy: tokens.navy,
  navyMid: tokens.navy_mid,
  cyan: tokens.cyan,
  coral: tokens.coral,
  cream: tokens.cream,
  gold: tokens.gold,
  wallCream: '#F3E3C8',
  wallCoral: '#E4784F',
  groundTeal: '#2E8C93',
  concrete: '#C6C7BC',
  asphalt: '#3B4652',
  roof: '#2A3B4C',
  wood: '#B98A52',
  glass: '#9FD8E0',
  water: '#1C7E93',
  foliage: '#5C9E63',
  metal: '#8E9AA6',
  fynnoxFur: '#E07A3C',
  fynnoxBelly: '#F7E4CB',
  fynnoxOutfit: '#2C6E7F',
  sparkBody: '#F2B441',
} as const

export type MaterialKey = keyof typeof COLORS

const cache = new Map<string, THREE.MeshLambertMaterial>()

/** Lambert + flat lighting liest sich wie ein weicher Toon-Hybrid und ist mobil guenstig. */
export function mat(key: MaterialKey | string, options?: { transparent?: number }): THREE.MeshLambertMaterial {
  const color = (COLORS as Record<string, string>)[key] ?? key
  const id = `${color}|${options?.transparent ?? 1}`
  let material = cache.get(id)
  if (!material) {
    material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      transparent: (options?.transparent ?? 1) < 1,
      opacity: options?.transparent ?? 1,
    })
    cache.set(id, material)
  }
  return material
}
