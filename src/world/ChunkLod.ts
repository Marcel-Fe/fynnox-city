import type * as THREE from 'three'
import { NEAR_CHUNK, type NearChunk } from './WorldBuilder'

/**
 * Blendet die Details der grossen Stadt nach Entfernung ein und aus.
 *
 * Gemessen wird der Abstand zur KANTE der Kachel, nicht zu ihrer Mitte: steht
 * die Kamera am Rand einer Kachel, liegt deren Mitte 68 m weg, das Haus direkt
 * daneben aber 2 m. Mit der Mitte gerechnet ploppten Fassaden vor der Nase auf.
 */
export class ChunkLod {
  /** Bis zu dieser Entfernung stehen die Details. Dahinter nur die Umrisse. */
  range = 160
  /**
   * Bis zu dieser Entfernung werfen Kacheln Schatten.
   *
   * Die Schattenkamera der Sonne ist ein schraeger Quader von 96 x 96 x 220 m.
   * Three schneidet dagegen ganze Kacheln - und so ein Quader streift quer
   * durch die Stadt. Gemessen fielen 285 von 545 Draw-Calls auf den
   * Schattenpass, fast zehn Bilder pro Sekunde. Schatten zeichnet die Karte
   * ohnehin nur im Umkreis von 48 m um Fynnox.
   */
  shadowRange = 60
  private frame = 0
  private visibleCount = 0
  /** Was urspruenglich Schatten warf - Fenster etwa bleiben immer aus. */
  private readonly casters = new WeakSet<THREE.Object3D>()

  constructor(private readonly chunks: NearChunk[]) {
    for (const chunk of chunks) {
      for (const object of chunk.objects) if (object.castShadow) this.casters.add(object)
    }
  }

  update(camera: THREE.Vector3, force = false): void {
    // Alle sechs Bilder reicht: bei Laufgeschwindigkeit sind das 60 cm.
    if (!force && this.frame++ % 6 !== 0) return
    let visible = 0
    for (const chunk of this.chunks) {
      const dx = Math.max(chunk.minX - camera.x, 0, camera.x - (chunk.minX + NEAR_CHUNK))
      const dz = Math.max(chunk.minZ - camera.z, 0, camera.z - (chunk.minZ + NEAR_CHUNK))
      const distance = dx * dx + dz * dz
      const show = distance < this.range * this.range
      const shadow = distance < this.shadowRange * this.shadowRange
      if (show) visible++
      for (const object of chunk.objects) {
        object.visible = show
        if (this.casters.has(object)) object.castShadow = shadow
      }
    }
    this.visibleCount = visible
  }

  get stats(): { chunks: number; visible: number } {
    return { chunks: this.chunks.length, visible: this.visibleCount }
  }
}
