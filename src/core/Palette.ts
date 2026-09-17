import * as THREE from 'three'
import { tokens } from '../contracts/manifests'
import { SURFACE_LAYER_COUNT, layerIndex, surfaceUniforms, type SurfaceLayerId } from './SurfaceTextures'

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
  // Bauwerke nach 10_Bauwerke_und_Infrastruktur. Leuchtturm und Uhrpavillon
  // tragen gruene Kupferpatina, der Pavillon zusaetzlich Bronzegesimse.
  patina: '#2E5A52',
  patinaLight: '#8FA893',
  bronze: '#A9743C',
  bronzeDark: '#7E522A',
  /** Laternenfeuer des Leuchtturms. Hell genug, um in den Blueten zu stehen. */
  lanternGlow: '#FFEDB4',
  // Ferne Kulisse. Die Staffelung ist Luftperspektive: je weiter weg, desto
  // heller, blauer und entsaettigter. Der Nebel blendet zusaetzlich zur
  // Horizontfarbe hin, deshalb sind schon die Grundtoene angehoben - eine
  // saftig gruene Kuppe in 200 m Entfernung liest als Fehler, nicht als Huegel.
  hillNear: '#8FA98A',
  hillMid: '#94ADAD',
  ridgeFar: '#AEC2C8',
  coastFar: '#A8B7AE',
  /** Wald- und Wiesenland hinter der Stadt, auf dem die Huegelketten stehen. */
  hinterland: '#7E9479',
  woodFar: '#6C8869',
  woodFarDark: '#5C7A5C',
  /**
   * Kulissenstadt hinter der Spielflaeche. Dieselben Fassadenfarben wie in der
   * begehbaren Stadt, nur eine Spur blasser - sie steht 70 bis 170 m weit weg,
   * wo der Nebel noch nicht greift, und wuerde in voller Saettigung naeher
   * wirken als die Haeuser davor.
   */
  townFarCream: '#E7DCC6',
  townFarCoral: '#D28F72',
  townFarTeal: '#5F959A',
  townFarBlue: '#8AA0AF',
  townFarWindow: '#7FA8B4',
  townFarRoof: '#43566A',
  townFarGround: '#B9B3A2',
  cityFar: '#B4BEC0',
  cityFarShade: '#98A5AC',
  // Grosse Stadt (17.09.2026): Rasen, Sportbelaege, Strand und Gebirge. Rasen
  // ist heller und gelber als das Laub - sonst verschmelzen Baum und Wiese.
  lawn: '#7DB860',
  lawnStripe: '#6FAB54',
  courtBlue: '#3F7FB5',
  courtGreen: '#4E9A6B',
  tartan: '#C45A3F',
  sand: '#E9D6A6',
  skateConcrete: '#BDBDB6',
  seatCoral: '#D9674A',
  seatTeal: '#2F8E96',
  domeRoof: '#DCE7EA',
  towerBody: '#5E7F99',
  towerGlass: '#7FB3CC',
  snow: '#F4F7FA',
  rock: '#8C949A',
  mountainFar: '#A9B8C4',
  // Vegetation nach 23_Natur_und_Kleinobjekte/01_Vegetation. Die Kronen sind
  // dort nie einfarbig - Sonnenseite hell, Kern dunkel.
  foliageLight: '#7FBB6A',
  pineNeedle: '#3C6B45',
  palmFrond: '#6FA95C',
  ivy: '#4C7F42',
  /** Bluetenbaum: zartrosa. Das kraeftige `bloom` gehoert an kleine Akzente -
   *  ueber eine ganze Krone gelegt liest es als Magenta, nicht als Bluete. */
  blossom: '#F0A9BE',
  /** Platanenstamm: hell und gefleckt, nicht braun wie ein Balken. */
  barkPale: '#D6CBAE',
  barkDark: '#7C5330',
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
  /**
   * Regler auf dem Spiegelanteil.
   *
   * 1 ist physikalisch richtig, sieht in diesem Stil aber nass aus. 0,8 laesst
   * Glanzlichter deutlich stehen, ohne die Vollfarbflaechen zu ueberstrahlen,
   * von denen der Stil lebt.
   */
  uSpecular: { value: 0.8 },
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

/**
 * Struktur aus dem Texturarray, vor der Variation auf die Grundfarbe gelegt.
 *
 * Projiziert wird entlang der Achse, in die die Flaeche zeigt - die
 * verschmolzene Stadtgeometrie hat keine brauchbaren UVs (siehe Kommentar am
 * Rauschen), die Position dagegen ist in Metern und damit massstabstreu. Eine
 * volle Triplanar-Mischung kostete drei Abtastungen je Pixel; fuer eine Stadt
 * aus achsparallelen Kisten reicht die eine, in deren Richtung die Flaeche
 * schaut. Die Zwischenwerte liegen ausserhalb des Blocks, weil das Relief sie
 * weiter unten noch einmal braucht.
 */
const SURFACE_TEXTURE_DECL = /* glsl */ `
  #ifdef FYNNOX_SURFACES
  precision highp sampler2DArray;
  uniform sampler2DArray uSurfaceDetail;
  uniform sampler2DArray uSurfaceNormal;
  uniform vec3 uSurfaceLayer[ ${SURFACE_LAYER_COUNT} ];
  uniform float uSurfaceReady;
  varying float vFynnoxLayer;
  varying vec3 vFynnoxNormal;
  #endif
`

const SURFACE_TEXTURE_CHUNK = /* glsl */ `
  #ifdef FYNNOX_SURFACES
  int surfaceLayer = int( vFynnoxLayer + 0.5 ) - 1;
  bool surfaceOn = surfaceLayer >= 0 && uSurfaceReady > 0.5;
  vec3 surfaceAxis = abs( vFynnoxNormal );
  vec2 surfaceUv = vec2( 0.0 );
  vec3 surfaceT = vec3( 1.0, 0.0, 0.0 );
  vec3 surfaceB = vec3( 0.0, 1.0, 0.0 );
  vec3 surfaceParams = vec3( 1.0 );
  if ( surfaceOn ) {
    surfaceParams = uSurfaceLayer[ surfaceLayer ];
    if ( surfaceAxis.y >= surfaceAxis.x && surfaceAxis.y >= surfaceAxis.z ) {
      surfaceUv = vFynnoxSurface.xz;
      surfaceT = vec3( 1.0, 0.0, 0.0 );
      surfaceB = vec3( 0.0, 0.0, -1.0 );
    } else if ( surfaceAxis.x >= surfaceAxis.z ) {
      surfaceUv = vFynnoxSurface.zy;
      surfaceT = vec3( 0.0, 0.0, -sign( vFynnoxNormal.x ) );
    } else {
      surfaceUv = vFynnoxSurface.xy;
      surfaceT = vec3( sign( vFynnoxNormal.z ), 0.0, 0.0 );
    }
    surfaceUv /= surfaceParams.x;
    float detail = texture( uSurfaceDetail, vec3( surfaceUv, float( surfaceLayer ) ) ).r * 2.0;
    diffuseColor.rgb = clamp( diffuseColor.rgb * mix( 1.0, detail, surfaceParams.y ), 0.0, 1.0 );
  }
  #endif
`

/**
 * Relief aus der Normalenkarte.
 *
 * Gerechnet in Weltachsen und mit der Blickmatrix in den Sichtraum gedreht.
 * Das stimmt nur fuer Geometrie ohne eigene Modellmatrix - und genau die traegt
 * Layer: die verschmolzenen Stadtkacheln liegen fest im Weltraum. Instanzen
 * (Fenster, Baeume) tragen Layer 0 und kommen hier nicht vorbei.
 */
const SURFACE_NORMAL_CHUNK = /* glsl */ `
  #ifdef FYNNOX_SURFACES
  if ( surfaceOn && surfaceParams.z > 0.0 ) {
    vec2 bump = texture( uSurfaceNormal, vec3( surfaceUv, float( surfaceLayer ) ) ).xy * 2.0 - 1.0;
    vec3 base = normalize( vFynnoxNormal );
    vec3 worldNormal = normalize( base + ( surfaceT * bump.x + surfaceB * bump.y ) * surfaceParams.z );
    normal = normalize( mat3( viewMatrix ) * worldNormal );
  }
  #endif
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
    // GESTUFT WIRD NUR DER DIFFUSE ANTEIL.
    //
    // Bis 09.09.2026 lief die ganze Welt auf MeshLambertMaterial, und Lambert
    // kennt keinen Spiegelanteil - kein Glanzlicht auf Asphalt, kein Schimmer
    // auf Glas, kein Metall. Genau daran liest sich der Unterschied zu einem
    // modernen Spiel ab, nicht an der Geometrie. Auf PBR umgestellt liegt der
    // Glanz jetzt in totalSpecular und wird NICHT abgestuft: er ist die
    // Spiegelung der Lichtquelle, keine Materialfarbe, und eine Treppung darin
    // sieht nach Fehler aus. Der diffuse Anteil dagegen traegt die Farbe und
    // behaelt seine kontrollierte Abstufung.
    vec3 lightAmount = totalDiffuse / albedo;
    float lum = dot( lightAmount, vec3( 0.2126, 0.7152, 0.0722 ) );
    float scale = fynnoxToon( lum ) / max( lum, 1e-4 );
    vec3 tint = mix( uShadowTint, uLightTint, smoothstep( 0.12, 0.72, lum ) );
    tint = mix( vec3( 1.0 ), tint, uTintStrength );
    vec3 shaded = albedo * lightAmount * mix( 1.0, scale, uToonMix ) * tint;
    float facing = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
    vec3 rim = smoothstep( 0.62, 1.0, 1.0 - facing ) * uRimStrength * uRimColor * lum;
    outgoingLight = shaded + totalSpecular * uSpecular + totalEmissiveRadiance + rim;
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

/**
 * Haengt den Look-Patch in ein Material.
 *
 * Herausgezogen, weil der Patch nicht nur die Weltfarben tragen muss: die
 * geladene Fynnox-Figur bringt eine Textur mit und braucht denselben Shader,
 * sonst steht sie wie ausgeschnitten in der Stadt. Der Patch wird dafuer
 * angewendet, nicht kopiert - eine zweite Fassung wuerde beim naechsten
 * Look-Eingriff auseinanderlaufen.
 *
 * Er setzt hinter `color_fragment` an, arbeitet also auf der bereits
 * texturierten und mit Vertexfarben multiplizierten Grundfarbe. Eine Textur wird
 * dadurch abgestuft und ueberstrahlt, nicht ersetzt. Bis 17.09.2026 sass er
 * hinter `map_fragment` - fuer Materialien ohne Vertexfarben ist das dasselbe,
 * die Stadtkacheln tragen ihre Farbe aber im Vertex, und davor gerechnet haette
 * die Saettigungsvariation auf Weiss gearbeitet.
 */
export function applyLookPatch(material: THREE.Material, options: { surfaces?: boolean } = {}): void {
  if (options.surfaces) {
    const withDefines = material as THREE.Material & { defines?: Record<string, string> }
    withDefines.defines = { ...withDefines.defines, FYNNOX_SURFACES: '' }
  }
  material.onBeforeCompile = (shader) => {
    for (const [name, uniform] of Object.entries(lookUniforms)) {
      shader.uniforms[name] = uniform as THREE.IUniform
    }
    if (options.surfaces) {
      for (const [name, uniform] of Object.entries(surfaceUniforms)) {
        shader.uniforms[name] = uniform as THREE.IUniform
      }
    }
    // Objektraum-Position als Varying. Sie kommt aus `transformed`, also vor
    // der Modellmatrix - nur so klebt das Muster am bewegten Objekt, statt
    // beim Fahren durch den Rumpf zu wandern.
    shader.vertexShader = injectOnce(
      injectOnce(
        injectOnce(
          shader.vertexShader,
          'void main() {',
          `varying vec3 vFynnoxSurface;
#ifdef FYNNOX_SURFACES
attribute float fynnoxLayer;
varying float vFynnoxLayer;
varying vec3 vFynnoxNormal;
#endif
void main() {`,
        ),
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvFynnoxSurface = transformed;',
      ),
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
#ifdef FYNNOX_SURFACES
\tvFynnoxLayer = fynnoxLayer;
\tvFynnoxNormal = objectNormal;
#endif`,
    )
    shader.fragmentShader = injectOnce(
      injectOnce(
        injectOnce(
          shader.fragmentShader,
          'void main() {',
          `varying vec3 vFynnoxSurface;
${SURFACE_TEXTURE_DECL}
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uToonMix;
uniform float uMottle;
uniform float uGrain;
uniform vec3 uShadowTint;
uniform vec3 uLightTint;
uniform float uTintStrength;
uniform float uSpecular;
${NOISE_CHUNK}
${TOON_CHUNK}
void main() {`,
        ),
        '#include <color_fragment>',
        `#include <color_fragment>\n${SURFACE_TEXTURE_CHUNK}\n${SURFACE_CHUNK}`,
      ),
      '#include <opaque_fragment>',
      `${TOON_OUTPUT}\n#include <opaque_fragment>`,
    )
    shader.fragmentShader = injectOnce(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n${SURFACE_NORMAL_CHUNK}`,
    )
  }
  // Alle Materialien teilen denselben Patch, also auch dasselbe Programm -
  // sonst kompilierte Three fuer jede Farbe einen eigenen Shader. Three haengt
  // Materialtyp und Texturbelegung von sich aus an den Schluessel an, die
  // texturierte Figur bekommt deshalb trotzdem ihr eigenes Programm.
  const key = options.surfaces ? 'fynnox-toon-rim-surfaces' : 'fynnox-toon-rim'
  material.customProgramCacheKey = () => key
}

/**
 * Textur je Palettenfarbe. Nachgeschlagen ueber den Farbwert wie `SURFACE` -
 * der `WorldBuilder` kennt nur Farben. Was fehlt, bleibt reine Farbe: Glas,
 * Metall, Laub und die kleinen Akzentfarben tragen keine Struktur, die man auf
 * Spielentfernung sehen koennte.
 */
const LAYER_OF: Partial<Record<MaterialKey, SurfaceLayerId>> = {
  asphalt: 'asphalt',
  paving: 'flagstone',
  pavingJoint: 'flagstone',
  townFarGround: 'flagstone',
  concrete: 'slab',
  skateConcrete: 'slab',
  wallCream: 'plaster',
  wallCoral: 'plaster',
  groundTeal: 'plaster',
  townFarBlue: 'plaster',
  townFarCream: 'plaster',
  townFarCoral: 'plaster',
  townFarTeal: 'plaster',
  stone: 'ashlar',
  stoneShade: 'brick',
  roof: 'roof',
  townFarRoof: 'roof',
  wood: 'wood',
  lawn: 'grass',
  lawnStripe: 'grass',
  hinterland: 'grass',
  rock: 'rock',
  mountainFar: 'rock',
}

/** Layernummer fuer den Vertex, 0 = keine Textur. */
export function surfaceLayerOf(color: string): number {
  const name = KEY_BY_HEX.get(color)
  const layer = name && LAYER_OF[name]
  return layer ? layerIndex(layer) : 0
}

/**
 * Oberflaecheneigenschaften je Material.
 *
 * Rauheit und Metallanteil sind das, was PBR ueberhaupt erst sichtbar macht.
 * Ohne diese Tabelle bekaeme jede Flaeche denselben Glanz - Asphalt wie Glas,
 * Putz wie Messing -, und das laese als Plastik, nur eben glaenzendes.
 *
 * Nachgeschlagen wird ueber die FARBE, nicht ueber den Namen: `WorldBuilder`
 * reicht `COLORS.paving` weiter, also den Farbwert, nicht den Schluessel.
 */
const SURFACE: Partial<Record<MaterialKey, { roughness: number; metalness?: number }>> = {
  glass: { roughness: 0.06 },
  fynnoxGlass: { roughness: 0.08 },
  water: { roughness: 0.1 },
  metal: { roughness: 0.32, metalness: 0.85 },
  iron: { roughness: 0.42, metalness: 0.7 },
  gold: { roughness: 0.26, metalness: 0.9 },
  bronze: { roughness: 0.3, metalness: 0.85 },
  bronzeDark: { roughness: 0.36, metalness: 0.85 },
  fynnoxBrass: { roughness: 0.28, metalness: 0.9 },
  patina: { roughness: 0.55, metalness: 0.5 },
  patinaLight: { roughness: 0.6, metalness: 0.4 },
  solarPanel: { roughness: 0.12, metalness: 0.4 },
  // Nasser Hafenasphalt: die Fahrbahn ist die groesste zusammenhaengende
  // Flaeche der Stadt und damit die, auf der ein Glanzstreifen am meisten traegt.
  asphalt: { roughness: 0.55 },
  roof: { roughness: 0.5 },
  paving: { roughness: 0.82 },
  concrete: { roughness: 0.9 },
  stone: { roughness: 0.88 },
  stoneShade: { roughness: 0.88 },
  wood: { roughness: 0.72 },
  barkPale: { roughness: 0.92 },
  barkDark: { roughness: 0.92 },
  foliage: { roughness: 0.95 },
  foliageDark: { roughness: 0.95 },
  foliageLight: { roughness: 0.95 },
  tyre: { roughness: 0.95 },
  towerGlass: { roughness: 0.08, metalness: 0.3 },
  towerBody: { roughness: 0.35, metalness: 0.5 },
  domeRoof: { roughness: 0.3, metalness: 0.6 },
  lawn: { roughness: 0.95 },
  lawnStripe: { roughness: 0.95 },
  snow: { roughness: 0.6 },
  lanternGlow: { roughness: 0.4 },
}

/** Farbwert zurueck auf den Materialnamen. Gleiche Farbe heisst gleiche Oberflaeche. */
const KEY_BY_HEX = new Map<string, MaterialKey>()
for (const [key, hex] of Object.entries(COLORS)) {
  if (!KEY_BY_HEX.has(hex)) KEY_BY_HEX.set(hex, key as MaterialKey)
}

const cache = new Map<string, THREE.MeshStandardMaterial>()

/**
 * Weltmaterial: PBR mit aufgesetzter Toon-Stufung, Warm-Kalt-Kontrast und
 * Streiflicht.
 *
 * Die Basis war bis 09.09.2026 Lambert - guenstig, aber ohne jeden
 * Spiegelanteil. Der Nutzer hat gemeldet, die Welt wirke nicht wie ein
 * modernes Spiel, "wo die Welt schoen glaenzend gestaltet ist"; das war keine
 * Frage der Farbe, sondern des Beleuchtungsmodells.
 */
export function mat(key: MaterialKey | string, options?: { transparent?: number }): THREE.MeshStandardMaterial {
  const color = (COLORS as Record<string, string>)[key] ?? key
  const id = `${color}|${options?.transparent ?? 1}`
  let material = cache.get(id)
  if (!material) {
    const name = KEY_BY_HEX.get(color)
    const surface = (name && SURFACE[name]) ?? { roughness: 0.85 }
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: surface.roughness,
      metalness: surface.metalness ?? 0,
      envMapIntensity: ENV_INTENSITY,
      transparent: (options?.transparent ?? 1) < 1,
      opacity: options?.transparent ?? 1,
    })
    // Einzelmeshes ohne `fynnoxLayer` (Fahrzeuge, Stationen, Tor) lesen den
    // Standardwert 0 und bleiben reine Farbe - bewegte Teile duerfen keine
    // Weltraumtextur tragen, sie liefe beim Fahren durch den Rumpf.
    applyLookPatch(material, { surfaces: true })
    cache.set(id, material)
    worldMaterials.push(material)
  }
  return material
}

/** Rauheit und Metallanteil einer Farbe - dieselbe Tabelle wie in `mat()`. */
export function surfaceOf(color: string): { roughness: number; metalness: number } {
  const name = KEY_BY_HEX.get(color)
  const surface = (name && SURFACE[name]) ?? { roughness: 0.85 }
  return { roughness: surface.roughness, metalness: surface.metalness ?? 0 }
}

const vertexCache = new Map<string, THREE.MeshStandardMaterial>()

/**
 * Material fuer Geometrie, die ihre Farbe im Vertex traegt.
 *
 * Die grosse Stadt verschmilzt je Kachel ALLE Farben einer Oberflaechenart zu
 * einem Mesh. Mit einem Material je Farbe waeren es rund vierzig Draw-Calls je
 * Kachel und bei hundertfuenfzig Kacheln weit ueber das hinaus, was eine
 * Onboard-Grafik schafft. Getrennt wird nur noch nach dem, was sich nicht in
 * den Vertex legen laesst: Rauheit und Metallanteil.
 */
export function vertexColorMat(color: string): THREE.MeshStandardMaterial {
  const { roughness, metalness } = surfaceClass(color)
  const id = `${roughness}|${metalness}`
  let material = vertexCache.get(id)
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness,
      metalness,
      envMapIntensity: ENV_INTENSITY,
    })
    applyLookPatch(material, { surfaces: true })
    vertexCache.set(id, material)
  }
  return material
}

/**
 * Oberflaechenklasse fuer Vertexfarben: Rauheit und Metall auf wenige Stufen
 * gerundet. Jede Stufe ist ein eigenes Material und damit ein eigener
 * Draw-Call je Kachel - mit den feinen Werten der Tabelle waren es ueber
 * tausend Draw-Calls im Bild.
 */
function surfaceClass(color: string): { roughness: number; metalness: number } {
  const { roughness, metalness } = surfaceOf(color)
  const r = roughness < 0.2 ? 0.1 : roughness < 0.65 ? 0.45 : 0.88
  const m = metalness < 0.2 ? 0 : metalness < 0.6 ? 0.45 : 0.85
  return { roughness: r, metalness: m }
}

/** Schluessel der Oberflaechenart - gleiche Schluessel teilen ein Material. */
export function surfaceKey(color: string): string {
  const { roughness, metalness } = surfaceClass(color)
  return `${roughness}|${metalness}`
}

/**
 * Staerke der Umgebungsspiegelung. Sie kommt aus `scene.environment`, also aus
 * dem Himmel - deshalb faerbt sie Glas und Metall mit der Tageszeit um.
 */
const ENV_INTENSITY = 0.75
const worldMaterials: THREE.MeshStandardMaterial[] = []

/**
 * Material fuer eine texturierte Figur im Stadtlook.
 *
 * Das geladene GLB bringt ein `MeshStandardMaterial` mit Metall- und
 * Rauheitskarte mit. Bis 09.09.2026 wurde beides weggeworfen und die Figur auf
 * Lambert heruntergestuft, damit sie sich nicht vom Rest der Stadt abhebt.
 * Seit die Stadt selbst PBR ist, gilt das Gegenteil: die Karten bleiben, und
 * die Figur bekommt denselben Look-Patch wie jede Wand.
 */
export function characterMaterial(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: source.map,
    normalMap: source.normalMap,
    roughnessMap: source.roughnessMap,
    metalnessMap: source.metalnessMap,
    color: source.color,
    roughness: source.roughnessMap ? 1 : 0.7,
    metalness: source.metalnessMap ? 1 : 0.05,
    envMapIntensity: ENV_INTENSITY,
  })
  if (source.normalScale) material.normalScale.copy(source.normalScale)
  applyLookPatch(material)
  return material
}
