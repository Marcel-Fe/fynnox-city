import * as THREE from 'three'
import { COLORS } from '../core/Palette'
import { PartBatcher, box, capsule, cone, sphere } from '../core/Shapes'

/**
 * Teile der Welt, die sich bewegen sollen und deshalb nicht im statischen
 * Batch liegen duerfen. Der WorldBuilder verschmilzt alles pro Material zu
 * einem Mesh - was danach noch wackeln soll, muss vorher heraus.
 */
export interface MotionParts {
  /** Baumkronen, die im Wind wiegen. Bewusst wenige. */
  canopies: THREE.Group[]
  /** Windsack am Flugsteg, dreht sich in den Wind. */
  windsock: THREE.Group
}

/**
 * Kleine Bewegungen, die eine Stadt lebendig machen.
 *
 * Bisher bewegten sich nur Wasser, NPCs und Fahrzeuge - alles andere stand
 * still. Der Eindruck einer lebendigen Welt entsteht aber nicht aus der Zahl
 * der Objekte, sondern daraus, dass etwas davon in Bewegung ist. Deshalb
 * wenige, gut sichtbare Gruppen statt tausend Einzelteile: drei Moewen ueber
 * dem Becken, ein schwenkender Windsack, ein paar wiegende Kronen.
 *
 * Die Windrichtung ist eine gemeinsame, langsam wandernde Groesse. Kronen und
 * Windsack lesen sie beide - ohne das wehte der Windsack nach Sueden, waehrend
 * die Baeume sich nach Norden neigen, und die Bewegung liest als Zufall.
 */
export class AmbientMotion {
  private readonly gulls: { root: THREE.Group; wingL: THREE.Group; wingR: THREE.Group; radius: number; height: number; speed: number; phase: number }[] = []
  private readonly canopies: { group: THREE.Group; phase: number; rest: THREE.Euler }[] = []
  private readonly windsock: THREE.Group
  private readonly basin: THREE.Vector3
  private clock = 0
  /** Windrichtung in Bogenmass, wandert langsam um eine Grundrichtung. */
  private windAngle = 0
  private windStrength = 1

  constructor(scene: THREE.Scene, parts: MotionParts, basin: THREE.Vector3) {
    this.basin = basin.clone()
    this.windsock = parts.windsock

    for (const group of parts.canopies) {
      this.canopies.push({
        group,
        // Versatz aus der Position: benachbarte Kronen sollen nicht im Gleichtakt
        // schwingen, aber auch nicht voellig unabhaengig - eine Boe laeuft durch.
        phase: group.position.x * 0.12 + group.position.z * 0.08,
        rest: group.rotation.clone(),
      })
    }

    // Bahnradius, Flughoehe, Winkelgeschwindigkeit. Die Hoehen liegen bewusst
    // niedrig: ueber 15 m sind die Moewen aus Spielersicht nur noch Punkte am
    // oberen Bildrand, und die Bewegung, die sie tragen sollen, sieht niemand.
    const orbits: [number, number, number][] = [
      [16, 9.5, 0.22],
      [23, 12.0, -0.16],
      [11, 7.0, 0.3],
    ]
    for (let i = 0; i < orbits.length; i++) {
      const [radius, height, speed] = orbits[i]
      const gull = this.buildGull()
      scene.add(gull.root)
      this.gulls.push({ ...gull, radius, height, speed, phase: i * 2.1 })
    }
  }

  /**
   * Moewe: Rumpf, Kopf, Schwanz und zwei Fluegel als eigene Gruppen.
   *
   * Die Fluegel muessen sich gegen den Rumpf drehen, also bleiben sie eigene
   * Gruppen - der Rest faellt pro Farbe zusammen.
   */
  private buildGull(): { root: THREE.Group; wingL: THREE.Group; wingR: THREE.Group } {
    const root = new THREE.Group()
    const body = new PartBatcher()
    body.add(capsule(0.16, 0.42, 8), COLORS.cream, { rot: [Math.PI / 2, 0, 0] })
    body.add(sphere(0.14, 8, 6), COLORS.cream, { pos: [0, 0.06, 0.32] })
    body.add(cone(0.05, 0.2, 5), COLORS.gold, { pos: [0, 0.02, 0.46], rot: [Math.PI / 2, 0, 0] })
    body.add(sphere(0.03, 5, 4), COLORS.fynnoxDark, { pos: [0.07, 0.1, 0.38] })
    body.add(sphere(0.03, 5, 4), COLORS.fynnoxDark, { pos: [-0.07, 0.1, 0.38] })
    // Schwanz und Ruecken dunkler - eine ganz weisse Moewe verschwindet vor
    // dem hellen Himmel.
    body.add(box(0.26, 0.04, 0.24), COLORS.metal, { pos: [0, 0.02, -0.34] })
    body.add(capsule(0.1, 0.3, 6), COLORS.metal, { pos: [0, 0.09, -0.08], rot: [Math.PI / 2, 0, 0] })
    body.finish(root, { castShadow: false })

    const wing = (side: number): THREE.Group => {
      const group = new THREE.Group()
      const b = new PartBatcher()
      // Der Fluegel setzt am Ursprung der Gruppe an, damit die Drehung um die
      // Schulter laeuft und nicht um die Fluegelmitte.
      b.add(box(0.62, 0.04, 0.22), COLORS.cream, { pos: [(side * 0.62) / 2, 0, 0.02] })
      b.add(box(0.3, 0.035, 0.14), COLORS.metal, { pos: [side * 0.76, -0.01, -0.02] })
      b.finish(group, { castShadow: false })
      group.position.set(side * 0.12, 0.08, 0.02)
      return group
    }
    const wingL = wing(-1)
    const wingR = wing(1)
    root.add(wingL, wingR)
    return { root, wingL, wingR }
  }

  update(delta: number): void {
    this.clock += delta
    // Wind: eine Grundrichtung aus Nordwest mit langsamer Drift und einer
    // Boenkomponente. Beides bewusst traege - schnelle Aenderungen lesen als
    // Fehler, nicht als Wetter.
    this.windAngle = -0.7 + Math.sin(this.clock * 0.09) * 0.55
    this.windStrength = 0.65 + Math.sin(this.clock * 0.23 + 1.4) * 0.35

    for (const gull of this.gulls) {
      const a = this.clock * gull.speed + gull.phase
      const x = this.basin.x + Math.cos(a) * gull.radius
      const z = this.basin.z + Math.sin(a) * gull.radius * 0.72
      // Die Hoehe schwingt langsamer als die Bahn - sonst sieht der Flug aus
      // wie eine Achterbahn statt wie Kreisen.
      const y = gull.height + Math.sin(a * 0.6 + gull.phase) * 1.6
      gull.root.position.set(x, y, z)
      // Blickrichtung ist die Tangente der Bahn. Das Modell schaut nach +Z.
      const tangent = Math.atan2(-Math.sin(a) * gull.radius, Math.cos(a) * gull.radius * 0.72)
      gull.root.rotation.y = tangent
      // Kurvenlage: in der Kurve haengt der innere Fluegel tiefer.
      gull.root.rotation.z = -Math.sign(gull.speed) * 0.26
      const flap = Math.sin(this.clock * 3.4 + gull.phase)
      gull.wingL.rotation.z = -flap * 0.55
      gull.wingR.rotation.z = flap * 0.55
    }

    // Kronen neigen sich mit dem Wind. Der Ausschlag bleibt klein: eine Krone,
    // die sichtbar kippt, reisst den Stamm optisch mit, und der steht fest im
    // statischen Batch.
    const sway = this.windStrength * 0.035
    for (const canopy of this.canopies) {
      const t = this.clock * 1.15 + canopy.phase
      const gust = Math.sin(t) * 0.7 + Math.sin(t * 0.43 + 1.1) * 0.3
      canopy.group.rotation.x = canopy.rest.x + Math.cos(this.windAngle) * gust * sway
      canopy.group.rotation.z = canopy.rest.z - Math.sin(this.windAngle) * gust * sway
      canopy.group.rotation.y = canopy.rest.y + gust * sway * 0.4
    }

    // Windsack: dreht sich in den Wind und haengt bei schwachem Wind ab. Der
    // Sack liegt entlang der lokalen +Z-Achse, das Abhaengen ist deshalb eine
    // Drehung um X - eine um Z rollte ihn nur um die eigene Achse.
    this.windsock.rotation.y = this.windAngle + Math.sin(this.clock * 0.8) * 0.12
    this.windsock.rotation.x = 0.1 + (1 - this.windStrength) * 0.75
  }

  /**
   * Lesbarer Zustand fuer die Abnahme. Bewegung laesst sich im Standbild nicht
   * pruefen, und headless rechnet nur rund ein Bild pro Sekunde - ueber Zahlen
   * zwischen zwei Frames ist sie dagegen eindeutig nachweisbar.
   */
  debugState(): {
    gulls: number[][]
    canopyTilt: number[]
    windsock: [number, number]
    wind: [number, number]
  } {
    return {
      gulls: this.gulls.map((g) => g.root.position.toArray()),
      canopyTilt: this.canopies.map((c) => c.group.rotation.x),
      windsock: [this.windsock.rotation.y, this.windsock.rotation.x],
      wind: [this.windAngle, this.windStrength],
    }
  }
}
