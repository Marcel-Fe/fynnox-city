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
  /** Naturstein des Stadtbodens - waermer als der Gehwegbeton, damit sich
   *  Platzflaeche, Gehweg und Fahrbahn ueberhaupt voneinander abheben. */
  paving: '#CFC5AC',
  pavingJoint: '#AFA791',
  asphalt: '#3B4652',
  roof: '#2A3B4C',
  wood: '#B98A52',
  glass: '#9FD8E0',
  water: '#1C7E93',
  foliage: '#5C9E63',
  metal: '#8E9AA6',
  // Fynnox: Fell, Gesicht und Outfit sind gesperrte Designvorgaben des Pakets
  // (03_Bildreferenzen/03_Fynnox_Turnaround). Werte hier abgelesen, nicht erfunden.
  fynnoxFur: '#E0703A',
  fynnoxFurDark: '#B04E23',
  fynnoxBelly: '#F7E4CB',
  fynnoxOutfit: '#2C6E7F',
  fynnoxJacket: '#33465C',
  fynnoxJacketDark: '#253445',
  fynnoxShirt: '#EFE4CE',
  fynnoxScarf: '#1E7FC2',
  fynnoxPants: '#3C4249',
  fynnoxLeather: '#7A4526',
  fynnoxBrass: '#C08A3E',
  fynnoxKnit: '#8A8F96',
  fynnoxEye: '#2E9BD8',
  fynnoxDark: '#241A16',
  fynnoxGlass: '#BFE0EA',
  sparkBody: '#F2B441',
} as const

export type MaterialKey = keyof typeof COLORS

/**
 * Gemeinsame Uniforms aller Weltmaterialien. Ein einziges Objekt, das in jedes
 * Material eingehaengt wird - so faerbt SkySystem das Streiflicht mit der
 * Tageszeit um, ohne durch die Szene laufen zu muessen.
 */
export const lookUniforms = {
  uRimColor: { value: new THREE.Color('#BFE4F5') },
  uRimStrength: { value: 0.32 },
  /** 0 = reines Lambert, 1 = volle Abstufung. Das Paket verlangt "kontrolliert". */
  uToonMix: { value: 0.7 },
}

/**
 * "Kontrollierte Toon-Abstufung" plus Streiflicht an der Silhouette.
 *
 * Der Anteil des Lichts wird von der Materialfarbe getrennt, in weiche Stufen
 * gerundet und wieder aufmultipliziert - dadurch bleibt der Farbton erhalten und
 * nur die Helligkeit staffelt sich. Das Streiflicht wird mit der Lichtmenge
 * multipliziert, damit im Schatten stehende Kanten nicht leuchten.
 */
const TOON_CHUNK = /* glsl */ `
  float fynnoxToon( float x ) {
    float s = x * 4.0;
    float base = floor( s );
    return ( base + smoothstep( 0.25, 0.75, s - base ) ) / 4.0;
  }
`

const TOON_OUTPUT = /* glsl */ `
  {
    vec3 albedo = max( diffuseColor.rgb, vec3( 1e-4 ) );
    vec3 lightAmount = outgoingLight / albedo;
    float lum = dot( lightAmount, vec3( 0.2126, 0.7152, 0.0722 ) );
    float scale = fynnoxToon( lum ) / max( lum, 1e-4 );
    outgoingLight = albedo * lightAmount * mix( 1.0, scale, uToonMix );
    float facing = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
    outgoingLight += smoothstep( 0.62, 1.0, 1.0 - facing ) * uRimStrength * uRimColor * lum;
  }
`

const cache = new Map<string, THREE.MeshLambertMaterial>()

/** Lambert als Basis - mobil guenstig - mit aufgesetzter Toon-Stufung und Streiflicht. */
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
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = lookUniforms.uRimColor
      shader.uniforms.uRimStrength = lookUniforms.uRimStrength
      shader.uniforms.uToonMix = lookUniforms.uToonMix
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uToonMix;\n${TOON_CHUNK}\nvoid main() {`,
        )
        .replace('#include <opaque_fragment>', `${TOON_OUTPUT}\n#include <opaque_fragment>`)
    }
    // Alle Materialien teilen denselben Patch, also auch dasselbe Programm -
    // sonst kompilierte Three fuer jede Farbe einen eigenen Shader.
    material.customProgramCacheKey = () => 'fynnox-toon-rim'
    cache.set(id, material)
  }
  return material
}
