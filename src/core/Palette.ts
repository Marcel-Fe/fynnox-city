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
  // Fassadengliederung nach 11_Modulare_Bausaetze/01_Fassadenmodule: heller
  // Naturstein fuer Ecklisenen, Gesimse, Fensterlaibungen und Balkonplatten,
  // dunkles Schmiedeeisen fuer Balkongelaender.
  stone: '#E7D9B5',
  stoneShade: '#CFBF98',
  iron: '#39404A',
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
  foliageDark: '#3F7A4B',
  bloom: '#E4708F',
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
  // City Spark nach 09_Fahrzeuge/01_City_Spark_Elektrobuggy: Teal-Karosserie mit
  // orangem Zierstreifen und orangen Felgen, nicht gelb.
  sparkBody: '#2C868F',
  sparkBodyDark: '#1F646D',
  sparkTrim: '#E8842E',
  tyre: '#2B3138',
  // Bluefin Wassertaxi nach 09_Fahrzeuge/02: cremefarbener Aufbau ueber tealem
  // Unterrumpf, orange Scheuerleiste und Dachkante, dunkle Fensterrahmen.
  taxiHull: '#F0E1BF',
  taxiKeel: '#2F7E8B',
  taxiKeelDark: '#245F6A',
  taxiTrim: '#E2842F',
  taxiFrame: '#4A5560',
  // Skyfin nach 09_Fahrzeuge/05: cremefarbener Rumpf mit tealem Bauch und
  // tealen Schwimmern, orange Leitwerk und Fluegelspitzen, dunkelblaue Solarfelder.
  skyfinBody: '#EFE3C9',
  skyfinTeal: '#2C7F8C',
  skyfinTealDark: '#215F6A',
  skyfinTrim: '#E58A2E',
  solarPanel: '#243A63',
  // Bluefin Scout nach 24_Bluefin_Scout_U_Boot: dunkelblauer Druckkoerper,
  // sandfarbener Bauch, orange Buegel, cyan Leuchtstreifen.
  scoutHull: '#33477A',
  scoutHullDark: '#26355C',
  scoutBelly: '#D8C9A9',
  scoutTrim: '#E4772C',
  scoutGlow: '#4FD4E8',
  // Ambient-NPCs nach 12_Charakter_Turnarounds. Mira (Rotpanda-Mechanikerin),
  // Boro (Baer) und Tavi (Otter) sind benannte Figuren des Pakets.
  miraFur: '#D4602C',
  miraCream: '#F6E3CB',
  miraJacket: '#7C9285',
  miraShirt: '#E8A93A',
  miraPants: '#3B3F45',
  boroFur: '#B0722F',
  boroFurDark: '#8A551F',
  boroJacket: '#2E3D5C',
  boroShirt: '#5E8577',
  boroPants: '#C9A66B',
  taviFur: '#8A5E33',
  taviCream: '#EBD9BC',
  taviJacket: '#2A55A8',
  taviBag: '#E07C2A',
  taviPants: '#2E3550',
} as const

export type MaterialKey = keyof typeof COLORS

/**
 * Farbe auf Leuchtdichte 1 normiert.
 *
 * Ein Farbstich soll den Ton verschieben, nicht die Helligkeit. Multipliziert
 * man ungefiltert mit einem Blauton, wird jede Schattenflaeche zusaetzlich um
 * ein Drittel dunkler - die Szene sackt ab und wirkt schmutzig statt kuehl.
 */
function tintColor(hex: string): THREE.Color {
  const color = new THREE.Color(hex)
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
  return color.multiplyScalar(1 / Math.max(luminance, 1e-3))
}

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
  /** Grobe Fleckigkeit der Oberflaeche - Putz, Patina, Verwitterung. */
  uMottle: { value: 0.6 },
  /** Feines Korn. Auf schwachen Geraeten 0, dann entfaellt die zweite Oktave. */
  uGrain: { value: 0.3 },
  /** Farbe des Lichts im Schatten und im Licht - der Warm-Kalt-Kontrast. */
  uShadowTint: { value: tintColor('#8FA8CC') },
  uLightTint: { value: tintColor('#FFF4E0') },
  /** Staerke der Einfaerbung. 0 = neutral wie vorher. */
  uTintStrength: { value: 0.45 },
}

/**
 * Erkennt schwache Geraete. Zielbild sind Desktop und Tablet; ein Telefon
 * bekommt dieselbe Welt, aber ohne die zweite Rauschoktave. Entschieden wird an
 * der Kernzahl und an der Kombination grober Zeiger plus kleines Display - nicht
 * am User-Agent, der bei Tablets regelmaessig luegt.
 */
export function detectHighDetail(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return true
  if ((navigator.hardwareConcurrency ?? 8) <= 4) return false
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const shortSide = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080)
  return !(coarse && shortSide < 820)
}

/**
 * Detailstufe umschalten - haengt an der Einstellung "Hohe Detailstufe".
 * Die grobe Fleckigkeit bleibt auf beiden Stufen erhalten; sie kostet eine
 * Oktave und traegt den groessten Teil der Wirkung. Nur das feine Korn faellt
 * weg, weil es die zweite Oktave und damit acht weitere Hashes bedeutet.
 */
export function setLookDetail(high: boolean): void {
  lookUniforms.uMottle.value = high ? 0.17 : 0.14
  lookUniforms.uGrain.value = high ? 0.1 : 0
}

/**
 * Wertrauschen aus einer Hashfunktion statt aus einer Textur.
 *
 * Eine Textur waere hier der falsche Weg: die Weltgeometrie wird pro Material
 * verschmolzen, danach hat eine 12-m-Wand denselben UV-Bereich 0..1 wie eine
 * 10-cm-Zierleiste - jede Kachelung liefe aus dem Massstab. Das Rauschen wird
 * deshalb aus der Position gerechnet, und zwar im OBJEKTRAUM: im Weltraum
 * wanderte das Muster durch ein fahrendes Boot hindurch.
 */
const NOISE_CHUNK = /* glsl */ `
  // Zwischenwerte bleiben klein. Die verbreitete Variante mit p *= 17.0 erzeugt
  // Produkte im Hunderttausenderbereich - auf einem Telefon mit mediump ist das
  // ausserhalb des darstellbaren Bereichs und liefert weisse Flecken.
  float fynnoxHash( vec3 p ) {
    p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
    p += dot( p, p.yxz + 33.33 );
    return fract( ( p.x + p.y ) * p.z );
  }
  float fynnoxNoise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( mix( fynnoxHash( i ), fynnoxHash( i + vec3( 1, 0, 0 ) ), f.x ),
           mix( fynnoxHash( i + vec3( 0, 1, 0 ) ), fynnoxHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
      mix( mix( fynnoxHash( i + vec3( 0, 0, 1 ) ), fynnoxHash( i + vec3( 1, 0, 1 ) ), f.x ),
           mix( fynnoxHash( i + vec3( 0, 1, 1 ) ), fynnoxHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
      f.z );
  }
`

/**
 * Oberflaechenvariation auf der Grundfarbe, bevor das Licht gerechnet wird.
 *
 * Eine Flaeche aus genau einer Farbe liest als Plastik, egal wie rund die
 * Geometrie darunter ist - das ist der eigentliche Abstand zu den Referenz-
 * bildern, nicht die Kantenzahl. Zwei Massstaebe: Flecken mit rund 2,4 m
 * Zellweite und ein Korn mit rund 33 cm.
 */
const SURFACE_CHUNK = /* glsl */ `
  {
    float variation = ( fynnoxNoise( vFynnoxSurface * 0.42 ) - 0.5 ) * uMottle;
    if ( uGrain > 0.0 ) {
      // Das feine Korn verschwindet mit der Entfernung. Hochfrequentes Rauschen
      // ohne Mipmaps faellt sonst unter Pixelgroesse und flimmert in Bewegung -
      // im Standbild unsichtbar, im Spiel der auffaelligste Fehler.
      float near = 1.0 - smoothstep( 16.0, 42.0, length( vViewPosition ) );
      variation += ( fynnoxNoise( vFynnoxSurface * 3.0 ) - 0.5 ) * uGrain * near;
    }
    // Dunklere Stellen zugleich etwas satter: verwitterter Putz verliert
    // Helligkeit, nicht Farbe. Ohne das wirkt die Variation wie grauer Schmutz.
    float luma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    diffuseColor.rgb = mix( vec3( luma ), diffuseColor.rgb, 1.0 - variation * 0.9 );
    // Der Klemmschritt ist Pflicht, keine Vorsicht: die Saettigung wird hier
    // extrapoliert, und bei kraeftigen Farben kann ein Kanal dabei unter null
    // rutschen. Weiter unten wird durch die Grundfarbe geteilt - aus einem
    // negativen Kanal wird dort ein weisser Fleck auf dem Objekt.
    diffuseColor.rgb = clamp( diffuseColor.rgb * ( 1.0 + variation ), 0.0, 1.0 );
  }
`

const TOON_CHUNK = /* glsl */ `
  float fynnoxToon( float x ) {
    float s = x * 4.0;
    float base = floor( s );
    return ( base + smoothstep( 0.25, 0.75, s - base ) ) / 4.0;
  }
`

/**
 * "Kontrollierte Toon-Abstufung" plus Warm-Kalt-Kontrast und Streiflicht.
 *
 * Der Anteil des Lichts wird von der Materialfarbe getrennt, in weiche Stufen
 * gerundet und wieder aufmultipliziert - dadurch bleibt der Farbton erhalten und
 * nur die Helligkeit staffelt sich. Danach wird das Licht selbst eingefaerbt:
 * besonnte Flaechen warm, beschattete kuehl. Dieser Farbkontrast - nicht der
 * Helligkeitsunterschied allein - traegt den Look der Bildreferenzen. Das
 * Streiflicht wird mit der Lichtmenge multipliziert, damit im Schatten stehende
 * Kanten nicht leuchten.
 */
const TOON_OUTPUT = /* glsl */ `
  {
    vec3 albedo = max( diffuseColor.rgb, vec3( 1e-4 ) );
    vec3 lightAmount = outgoingLight / albedo;
    float lum = dot( lightAmount, vec3( 0.2126, 0.7152, 0.0722 ) );
    float scale = fynnoxToon( lum ) / max( lum, 1e-4 );
    vec3 tint = mix( uShadowTint, uLightTint, smoothstep( 0.12, 0.72, lum ) );
    tint = mix( vec3( 1.0 ), tint, uTintStrength );
    outgoingLight = albedo * lightAmount * mix( 1.0, scale, uToonMix ) * tint;
    float facing = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
    outgoingLight += smoothstep( 0.62, 1.0, 1.0 - facing ) * uRimStrength * uRimColor * lum;
  }
`

/**
 * Ersetzt eine Ankerstelle im Shader und bricht ab, wenn es sie nicht gibt.
 *
 * String.replace ohne Treffer tut still gar nichts. Ein Anker, den ein
 * Three-Update umbenennt, wuerde den Patch also lautlos abschalten - sichtbar
 * erst als "irgendwie flacher" und praktisch nicht zu finden. Deshalb bricht
 * der Start ab, statt das Bild schleichend zu verlieren.
 */
function injectOnce(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) {
    throw new Error(`Shader-Anker fehlt: ${anchor}`)
  }
  return source.replace(anchor, replacement)
}

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
      for (const [name, uniform] of Object.entries(lookUniforms)) {
        shader.uniforms[name] = uniform as THREE.IUniform
      }
      // Objektraum-Position als Varying. Sie kommt aus `transformed`, also vor
      // der Modellmatrix - nur so klebt das Muster am bewegten Objekt, statt
      // beim Fahren durch den Rumpf zu wandern.
      shader.vertexShader = injectOnce(
        injectOnce(
          shader.vertexShader,
          'void main() {',
          'varying vec3 vFynnoxSurface;\nvoid main() {',
        ),
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvFynnoxSurface = transformed;',
      )
      shader.fragmentShader = injectOnce(
        injectOnce(
          injectOnce(
            shader.fragmentShader,
            'void main() {',
            `varying vec3 vFynnoxSurface;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uToonMix;
uniform float uMottle;
uniform float uGrain;
uniform vec3 uShadowTint;
uniform vec3 uLightTint;
uniform float uTintStrength;
${NOISE_CHUNK}
${TOON_CHUNK}
void main() {`,
          ),
          '#include <map_fragment>',
          `#include <map_fragment>\n${SURFACE_CHUNK}`,
        ),
        '#include <opaque_fragment>',
        `${TOON_OUTPUT}\n#include <opaque_fragment>`,
      )
    }
    // Alle Materialien teilen denselben Patch, also auch dasselbe Programm -
    // sonst kompilierte Three fuer jede Farbe einen eigenen Shader.
    material.customProgramCacheKey = () => 'fynnox-toon-rim'
    cache.set(id, material)
  }
  return material
}
