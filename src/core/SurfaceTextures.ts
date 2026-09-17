import * as THREE from 'three'
import layers from './surfaceLayers.json'

/**
 * Oberflaechentexturen der grossen Stadt.
 *
 * Bis 17.09.2026 war jede Flaeche eine reine Farbe - Putz, Pflaster und Asphalt
 * unterschieden sich nur im Farbton, und die Stadt las "wie eine Zeichnung".
 * Die Texturen ersetzen die Farbe nicht, sie legen Helligkeitsstruktur und
 * Relief darueber. Die Palette bleibt damit der Stil; dazu kommt, woraus eine
 * Oberflaeche erst als Material liest.
 *
 * Alle Layer liegen in EINEM Texturarray. Die Stadt buendelt Farben je Kachel
 * und Oberflaechenklasse zu einem Mesh - eine Textur je Material haette diese
 * Buendel wieder aufgesprengt. Welcher Layer gilt, steht deshalb wie die Farbe
 * im Vertex (`fynnoxLayer`, 0 = keine Textur).
 */

export type SurfaceLayerId = (typeof layers)[number]['id']

const SIZE = 512
const DETAIL_URL = 'textures/surfaces-detail.jpg'
const NORMAL_URL = 'textures/surfaces-normal.jpg'

/** Layernummer im Vertex: Position in `surfaceLayers.json` plus eins. */
export function layerIndex(id: SurfaceLayerId): number {
  return layers.findIndex((layer) => layer.id === id) + 1
}

/** Neutraler Platzhalter: Struktur 0,5 (= Faktor 1) und flache Normale. */
function placeholder(value: [number, number, number]): THREE.DataArrayTexture {
  const texture = new THREE.DataArrayTexture(new Uint8Array([...value, 255]), 1, 1, 1)
  texture.needsUpdate = true
  return texture
}

export const surfaceUniforms = {
  uSurfaceDetail: { value: placeholder([128, 128, 128]) },
  uSurfaceNormal: { value: placeholder([128, 128, 255]) },
  /** Je Layer: Kachelgroesse in Metern, Kontrast der Struktur, Reliefstaerke. */
  uSurfaceLayer: { value: layers.map((layer) => new THREE.Vector3(layer.scale, layer.contrast, layer.bump)) },
  /** 0 bis die Texturen geladen sind - bis dahin wird gar nicht abgetastet. */
  uSurfaceReady: { value: 0 },
}

export const SURFACE_LAYER_COUNT = layers.length

/**
 * Laedt beide Streifen und schaltet die Texturen ein.
 *
 * Laeuft NICHT vor dem ersten Bild: das Spiel hat genau einen asynchronen
 * Startschritt (die Spielfigur), und eine Stadt ohne Texturen ist ein gueltiger
 * Zustand. Schlaegt das Laden fehl, bleibt es bei den reinen Farben.
 */
export async function loadSurfaceTextures(renderer: THREE.WebGLRenderer): Promise<string | null> {
  try {
    const base = import.meta.env.BASE_URL
    const [detail, normal] = await Promise.all([strip(base + DETAIL_URL), strip(base + NORMAL_URL)])
    const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    for (const [texture, colorSpace] of [
      [detail, THREE.NoColorSpace],
      [normal, THREE.NoColorSpace],
    ] as const) {
      texture.colorSpace = colorSpace
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = true
      // Strassen sieht man fast immer unter flachem Winkel. Ohne anisotrope
      // Filterung verschwimmt der Asphalt schon nach zehn Metern zu Grau.
      texture.anisotropy = anisotropy
      texture.needsUpdate = true
    }
    surfaceUniforms.uSurfaceDetail.value.dispose()
    surfaceUniforms.uSurfaceNormal.value.dispose()
    surfaceUniforms.uSurfaceDetail.value = detail
    surfaceUniforms.uSurfaceNormal.value = normal
    surfaceUniforms.uSurfaceReady.value = 1
    return null
  } catch (error) {
    const problem = error instanceof Error ? error.message : String(error)
    console.warn('Oberflaechentexturen nicht geladen, Stadt bleibt einfarbig:', problem)
    return problem
  }
}

/** Ein senkrechter Streifen mit einer 512er-Kachel je Layer als Texturarray. */
async function strip(url: string): Promise<THREE.DataArrayTexture> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob())
  if (bitmap.width !== SIZE || bitmap.height !== SIZE * layers.length) {
    throw new Error(`${url}: ${bitmap.width}x${bitmap.height}, erwartet ${SIZE}x${SIZE * layers.length}`)
  }
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Kein 2D-Kontext')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const data = new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer)
  return new THREE.DataArrayTexture(data, SIZE, SIZE, layers.length)
}
