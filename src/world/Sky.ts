import * as THREE from 'three'
import { COLORS, lookUniforms } from '../core/Palette'

/** Anteil des Hemisphaerenlichts, seit die Umgebungskarte das Fuelllicht traegt. */
const HEMI_SHARE = 0.33

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
    /** Besonnte Oberseite und beschattete Unterseite der Wolken. */
    uCloudLight: { value: new THREE.Color('#FFFFFF') },
    uCloudShade: { value: new THREE.Color('#C4CFE0') },
    /** Verschiebung der Wolkenbahn - der Himmel steht sonst wie gemalt. */
    uCloudDrift: { value: new THREE.Vector2() },
    /** 0 = klarer Himmel, 1 = geschlossene Decke. */
    uCloudCover: { value: 0.66 },
  }
  /** 0 = Morgen, 0.5 = Mittag, 1 = Abend. */
  private phase = 0.28
  /** PawLink-Scan faerbt die Welt kuehl ein, damit Signale lesbar werden. */
  private scannerMode = false

  /**
   * Quelle der Umgebungsspiegelung.
   *
   * Seit die Welt auf PBR laeuft, hat jedes Material einen Spiegelanteil - und
   * der braucht etwas zum Spiegeln. Ohne `scene.environment` spiegelt Glas
   * Schwarz und Metall sieht aus wie Kohle. Gerechnet wird eine kleine
   * Equirect-Karte aus denselben Himmelsfarben wie die Kuppel; damit faerbt
   * sich jede Spiegelung mit der Tageszeit um, ohne dass die Szene ein zweites
   * Mal gerendert werden muss.
   */
  private readonly pmrem: THREE.PMREMGenerator
  private readonly envSource: THREE.DataTexture
  private envTarget: THREE.WebGLRenderTarget | null = null
  /** Tageszeit, zu der die Karte zuletzt gerechnet wurde. */
  private envPhase = -1

  constructor(
    private readonly scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.pmrem.compileEquirectangularShader()
    // 64 x 32 reicht: die Karte traegt nur den Verlauf, keine Struktur. Die
    // PMREM-Stufen weichen ohnehin alles auf, was kleiner ist.
    this.envSource = new THREE.DataTexture(new Uint8Array(64 * 32 * 4), 64, 32)
    this.envSource.mapping = THREE.EquirectangularReflectionMapping
    this.envSource.colorSpace = THREE.SRGBColorSpace

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
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      /**
       * Wolken auf einer gedachten Ebene ueber dem Kopf.
       *
       * Der Blickstrahl wird durch seine Hoehe geteilt - das ist der
       * Durchstosspunkt durch eine waagerechte Ebene. Dadurch werden die Wolken
       * zum Horizont hin von selbst flacher und dichter, so wie eine echte
       * Wolkendecke. Eine Kugelprojektion haette sie ueberall gleich gross
       * gelassen und den Himmel wie eine Tapete aussehen lassen.
       *
       * Direkt am Horizont wird der Term unendlich; deshalb wird die Deckung
       * dort ausgeblendet. Ohne das steht ein flimmernder Streifen auf der
       * Kimm - im Standbild kaum zu sehen, in Bewegung sofort.
       */
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uCloudLight;
        uniform vec3 uCloudShade;
        uniform vec2 uCloudDrift;
        uniform float uCloudCover;
        varying vec3 vDir;

        float skyHash(vec2 p) {
          p = fract(p * vec2(0.1031, 0.1030));
          p += dot(p, p.yx + 33.33);
          return fract((p.x + p.y) * p.x);
        }
        float skyNoise(vec2 x) {
          vec2 i = floor(x);
          vec2 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
            mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x),
            f.y);
        }
        float skyFbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * skyNoise(p);
            p *= 2.03;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          float h = vDir.y;
          vec3 sky = mix(uBottom, uTop, smoothstep(-0.1, 0.6, h));
          if (h > 0.015) {
            // Der Faktor ist die Wolkengroesse. Bei 0,34 lagen ueber dem ganzen
            // sichtbaren Himmel keine drei Rauschzellen - das las als
            // gleichmaessiger Schleier, nicht als Wolken. 1,6 ergibt ueber dem
            // Blickfeld rund ein Dutzend Ballen, so wie in der Bildreferenz.
            vec2 p = vDir.xz / max(h, 0.015) * 1.6 + uCloudDrift;
            float n = skyFbm(p);
            // Zwei Schwellen statt einer harten Kante: dazwischen liegt der
            // ausgefranste Rand, der eine Wolke ueberhaupt als Wolke lesen laesst.
            float cover = smoothstep(0.56 - uCloudCover * 0.34, 0.70 - uCloudCover * 0.14, n);
            // Zum Horizont hin ausblenden. Dort laeuft die Projektion gegen
            // unendlich; ohne das Ausblenden flimmert auf der Kimm ein Streifen,
            // im Standbild kaum zu sehen und in Bewegung sofort.
            cover *= smoothstep(0.015, 0.11, h);
            // Die Unterseite liegt im Eigenschatten. Gerechnet wird sie aus
            // demselben Rauschen mit Versatz - eine zweite Oktave waere teurer
            // und im Ergebnis nicht zu unterscheiden.
            float lift = smoothstep(0.42, 0.86, skyFbm(p + vec2(0.6, -0.4)));
            vec3 cloud = mix(uCloudShade, uCloudLight, lift);
            sky = mix(sky, cloud, cover);
          }
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    })
    this.dome = new THREE.Mesh(geometry, material)
    this.dome.frustumCulled = false
    // Immer zuerst zeichnen. Die Kuppel schreibt keine Tiefe, prueft sie aber:
    // sortiert Three sie hinter ein Stadtmesh, uebermalt sie alles, was weiter
    // als ihr Radius entfernt ist - seit der grossen Stadt also Berge und Skyline.
    this.dome.renderOrder = -1000
    scene.add(this.dome)

    // Nebel erst spaet einsetzen lassen: vorher lag schon das Hafenbecken darin
    // und verlor seine Farbe.
    //
    // Das hintere Ende richtet sich nach der Kulisse. Der Bergkamm steht seit
    // der Tiefenstaffelung bei 366 bis 458 m; bei einem Nebelende von 330 m
    // waere er vollstaendig in Horizontfarbe getaucht und damit gar nicht
    // gebaut. Der Himmelsdom (Radius 320) folgt der Kamera und verdeckt nichts,
    // er schreibt keine Tiefe.
    //
    // Seit 17.09.2026 steht die Stadt auf 1,1 km und der Horizont bis 2,3 km
    // entfernt. Der Nebel beginnt deshalb spaeter und endet erst hinter den
    // Bergen - er soll Ferne erzaehlen, nicht die Stadt abschneiden.
    scene.fog = new THREE.Fog(new THREE.Color(COLORS.cream), 260, 2400)
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
    // Die Karte haengt an den Himmelsfarben, und die schaltet der Scan um.
    // Ohne das spiegelte die kuehle Scanwelt weiter den Tageshimmel.
    this.envPhase = -1
  }

  update(delta: number, focus: THREE.Vector3): void {
    // Ein voller Tagbogen dauert acht Minuten - lang genug, um nicht zu stoeren.
    this.phase = (this.phase + delta / 480) % 1
    // Wolkenzug. Langsam genug, dass er nicht auffaellt, wenn man hinsieht -
    // und schnell genug, dass der Himmel nach einer Minute ein anderer ist.
    this.uniforms.uCloudDrift.value.x += delta * 0.004
    this.uniforms.uCloudDrift.value.y += delta * 0.0016
    this.apply()
    this.sun.target.position.copy(focus)
    this.sun.position.copy(focus).add(this.sunOffset)
    this.dome.position.copy(focus)
    this.refreshEnvironment()
  }

  /**
   * Rechnet die Umgebungskarte neu, wenn sich die Tageszeit merklich geaendert
   * hat. 0,012 sind rund fuenf Sekunden Spielzeit - haeufiger waere Arbeit fuer
   * einen Unterschied, den niemand sieht.
   */
  private refreshEnvironment(): void {
    if (this.envPhase >= 0 && Math.abs(this.phase - this.envPhase) < 0.012) return
    this.envPhase = this.phase

    const data = this.envSource.image.data as Uint8Array
    const top = this.uniforms.uTop.value
    const bottom = this.uniforms.uBottom.value
    const ground = this.hemi.groundColor
    for (let row = 0; row < 32; row++) {
      // Equirect: Zeile 0 ist der Zenit, die letzte der Nadir.
      const h = Math.cos((Math.PI * (row + 0.5)) / 32)
      const t = THREE.MathUtils.smoothstep(h, -0.1, 0.6)
      const sky = bottom.clone().lerp(top, t)
      // Unter dem Horizont spiegelt nicht der Himmel, sondern der Boden. Ohne
      // das bekaemen nach unten zeigende Flaechen Himmelsblau von unten.
      if (h < 0) sky.lerp(ground, Math.min(1, -h * 2.2))
      const r = Math.round(THREE.MathUtils.clamp(sky.r, 0, 1) * 255)
      const g = Math.round(THREE.MathUtils.clamp(sky.g, 0, 1) * 255)
      const b = Math.round(THREE.MathUtils.clamp(sky.b, 0, 1) * 255)
      for (let col = 0; col < 64; col++) {
        const i = (row * 64 + col) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = 255
      }
    }
    this.envSource.needsUpdate = true

    const previous = this.envTarget
    this.envTarget = this.pmrem.fromEquirectangular(this.envSource)
    this.scene.environment = this.envTarget.texture
    previous?.dispose()
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
    //
    // Seit PBR speist `scene.environment` den diffusen Anteil zusaetzlich - mit
    // ungefaehr derselben Menge, die das Hemisphaerenlicht allein lieferte.
    // Beide voll zusammen waren doppeltes Fuelllicht, der Kontrast fiel auf
    // rund 1,5:1 und die Schatten verschwanden. Das Hemisphaerenlicht bleibt nur
    // noch als Rest fuer die Richtungsfaerbung Himmel oben / Boden unten.
    this.hemi.intensity = (0.45 + height * 0.5) * HEMI_SHARE

    // Der Zenit war mit #7FC7E8 deutlich blasser als in den Bildreferenzen -
    // dort steht ueber der Stadt ein kraeftiges Blau, gegen das die Wolken
    // ueberhaupt erst als Wolken lesen. Der Horizont bleibt warm, den Uebergang
    // macht der Nebel.
    this.uniforms.uTop.value.set('#255C8C').lerp(new THREE.Color('#4E9FD8'), height)
    this.uniforms.uBottom.value.set('#FFB27A').lerp(new THREE.Color('#FFF3D8'), height)
    // Wolken tragen die Sonnenfarbe. Am Morgen und am Abend sind sie warm, am
    // Mittag weiss; ihre Unterseite bleibt immer eine Spur kuehler als der
    // Himmel darum, sonst verschwinden sie darin.
    this.uniforms.uCloudLight.value.set('#FFD9AE').lerp(new THREE.Color('#FFFFFF'), height)
    this.uniforms.uCloudShade.value.set('#B79BA6').lerp(new THREE.Color('#BFCDE2'), height)
    const fog = this.scene.fog as THREE.Fog
    if (this.scannerMode) {
      this.uniforms.uTop.value.set('#062A38')
      this.uniforms.uBottom.value.set('#0B3B4A')
      fog.color.set('#0B3B4A')
      this.uniforms.uCloudLight.value.set('#12556B')
      this.uniforms.uCloudShade.value.set('#0A3444')
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
