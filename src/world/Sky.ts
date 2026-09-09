import * as THREE from 'three'
import { COLORS, lookUniforms } from '../core/Palette'

/**
 * Tageszeit, Licht und Himmel. Sechs Lichtzustaende aus
 * 15_Welt_Systemreferenzen/01_Licht_und_Wetter dienen als Zielrichtung;
 * der Slice faehrt sie als weichen Zyklus von Morgen bis Abend.
 */
export class SkySystem {
  readonly sun: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  private readonly dome: THREE.Mesh
  private readonly uniforms = {
    uTop: { value: new THREE.Color('#7FC7E8') },
    uBottom: { value: new THREE.Color('#FFE6C4') },
  }
  /** 0 = Morgen, 0.5 = Mittag, 1 = Abend. */
  private phase = 0.28
  /** PawLink-Scan faerbt die Welt kuehl ein, damit Signale lesbar werden. */
  private scannerMode = false

  constructor(private readonly scene: THREE.Scene) {
    // Zwei Fuellichter statt einem: von oben der kuehle Himmel, von unten das
    // warme Rueckstrahllicht des Sandsteinbodens. Vorher war die Bodenfarbe ein
    // dunkles Blaugrau - damit lief jede nach unten zeigende Flaeche ins
    // Schmutzige, und genau die machen in einer Stadt den halben Anblick aus.
    this.hemi = new THREE.HemisphereLight('#BFE4F5', '#A08F6E', 1.15)
    scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight('#FFF0D2', 1.5)
    this.sun.castShadow = true
    // 1536er Map reicht fuer die Graybox-Silhouetten und haelt die
    // Bildrate auf schwaecheren Geraeten stabil.
    this.sun.shadow.mapSize.set(1536, 1536)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 220
    // Engerer Ausschnitt bei gleicher Kartengroesse: dieselben 1536 Pixel
    // verteilen sich auf 96 statt 140 Meter, der Schatten wird entsprechend
    // schaerfer. Er folgt ohnehin dem Spieler, weiter reicht die Sicht nicht.
    const size = 48
    this.sun.shadow.camera.left = -size
    this.sun.shadow.camera.right = size
    this.sun.shadow.camera.top = size
    this.sun.shadow.camera.bottom = -size
    this.sun.shadow.bias = -0.0004
    // normalBias schiebt den Vergleichspunkt entlang der Normalen statt entlang
    // der Blickrichtung. Das loest die Streifen auf schraegen Flaechen, ohne den
    // Schatten wie ein grosser bias vom Objekt abzuloesen.
    this.sun.shadow.normalBias = 0.03
    scene.add(this.sun)
    scene.add(this.sun.target)

    const geometry = new THREE.SphereGeometry(320, 24, 16)
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying float vH;
        void main() {
          vH = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        varying float vH;
        void main() {
          gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(-0.1, 0.6, vH)), 1.0);
        }
      `,
    })
    this.dome = new THREE.Mesh(geometry, material)
    this.dome.frustumCulled = false
    scene.add(this.dome)

    // Nebel erst spaet einsetzen lassen: vorher lag schon das Hafenbecken darin
    // und verlor seine Farbe.
    //
    // Das hintere Ende richtet sich nach der Kulisse. Der Bergkamm steht seit
    // der Tiefenstaffelung bei 366 bis 458 m; bei einem Nebelende von 330 m
    // waere er vollstaendig in Horizontfarbe getaucht und damit gar nicht
    // gebaut. Der Himmelsdom (Radius 320) folgt der Kamera und verdeckt nichts,
    // er schreibt keine Tiefe.
    scene.fog = new THREE.Fog(new THREE.Color(COLORS.cream), 150, 500)
    this.apply()
  }

  /** Tageszeit direkt setzen (0..1) - genutzt von Savegame und Einstellungen. */
  setPhase(phase: number): void {
    this.phase = THREE.MathUtils.clamp(phase, 0, 1)
    this.apply()
  }

  get timeOfDay(): number {
    return this.phase
  }

  setScannerMode(active: boolean): void {
    this.scannerMode = active
    this.apply()
  }

  update(delta: number, focus: THREE.Vector3): void {
    // Ein voller Tagbogen dauert acht Minuten - lang genug, um nicht zu stoeren.
    this.phase = (this.phase + delta / 480) % 1
    this.apply()
    this.sun.target.position.copy(focus)
    this.sun.position.copy(focus).add(this.sunOffset)
    this.dome.position.copy(focus)
  }

  private readonly sunOffset = new THREE.Vector3()

  private apply(): void {
    const angle = Math.PI * this.phase
    const height = Math.sin(angle)
    this.sunOffset.set(Math.cos(angle) * 90, 20 + height * 80, 45)

    const warm = new THREE.Color('#FFC489')
    const noon = new THREE.Color('#FFF6E0')
    const sunColor = warm.clone().lerp(noon, THREE.MathUtils.smoothstep(height, 0.15, 0.7))
    this.sun.color.copy(sunColor)
    this.sun.intensity = 0.5 + height * 0.85
    // Mehr Fuelllicht als zuvor. Der Kontrast zwischen besonnt und beschattet
    // liegt damit bei rund 2:1 statt 3:1 - in den Bildreferenzen ist keine
    // Schattenflaeche tot, sie ist nur kuehler und etwas dunkler. Der Verlust an
    // Helligkeitskontrast wird im Material durch den Warm-Kalt-Kontrast ersetzt.
    this.hemi.intensity = 0.45 + height * 0.5

    this.uniforms.uTop.value.set('#2F6D9E').lerp(new THREE.Color('#7FC7E8'), height)
    this.uniforms.uBottom.value.set('#FFB27A').lerp(new THREE.Color('#FFF3D8'), height)
    const fog = this.scene.fog as THREE.Fog
    if (this.scannerMode) {
      this.uniforms.uTop.value.set('#062A38')
      this.uniforms.uBottom.value.set('#0B3B4A')
      fog.color.set('#0B3B4A')
      this.sun.intensity *= 0.45
      this.hemi.intensity *= 0.5
      this.hemi.color.set('#7FE3F5')
    } else {
      this.hemi.color.set('#BFE4F5')
      this.hemi.groundColor.set('#A08F6E')
      fog.color.copy(this.uniforms.uBottom.value)
    }
    // Das Streiflicht kommt aus dem Himmel, nicht von der Sonne - es zeichnet
    // die Silhouette gegen den Hintergrund, in den die Figur gestellt ist.
    lookUniforms.uRimColor.value.copy(this.uniforms.uTop.value)
  }
}
