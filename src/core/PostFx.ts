import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

/**
 * Bildveredelung: Lichtblueten und Farbgraduierung.
 *
 * Der Stil lebt von Vollfarbflaechen, und genau die machen Bloom gefaehrlich:
 * eine cremefarbene Fassade steht im Sonnenlicht schon bei Leuchtdichte 1,3,
 * eine zu tiefe Schwelle laesst also die halbe Stadt glimmen statt der Lampen.
 * Deshalb liegt die Schwelle ueber dem hellsten normal beleuchteten Ton und die
 * Staerke niedrig - blueten sollen nur Fensterlicht, Gold und Wasserglitzer.
 *
 * Die Kette laeuft bewusst im linearen Raum und endet mit dem OutputPass; der
 * traegt die Tonwertkurve des Renderers (NeutralToneMapping) und die
 * sRGB-Wandlung. Ohne ihn faende beides gar nicht mehr statt - der Composer
 * rendert in ein Zwischenziel, und dort wendet Three keines von beidem an.
 */

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.17 },
    uSaturation: { value: 1.06 },
    uLift: { value: new THREE.Color('#1D3550') },
    uLiftAmount: { value: 0.02 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform vec3 uLift;
    uniform float uLiftAmount;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec3 color = texel.rgb;

      // Saettigung leicht anheben. Die Tonwertkurve nimmt kraeftigen Farben in
      // den Lichtern etwas Farbe; hier kommt genau so viel zurueck, dass Teal
      // und Koralle wieder so stehen wie in den Bildreferenzen.
      float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = mix( vec3( luma ), color, uSaturation );

      // Kuehler Lift auf den tiefsten Werten: in den Referenzen laeuft keine
      // Schattenflaeche nach Schwarz, sie kippt ins Blaue.
      color += uLift * uLiftAmount * ( 1.0 - smoothstep( 0.0, 0.35, luma ) );

      // Vignette fuehrt den Blick zur Bildmitte. Weich und flach - eine harte
      // Abdunklung liest als Fehler, nicht als Gestaltung.
      // Bezugsgroesse ist der halbe Bilddiagonalenabstand: bei 0.35 beginnt die
      // Abdunklung schon auf der Bildmitte und zieht die ganze Aufnahme
      // herunter. Sie setzt deshalb erst weit aussen an und bleibt flach.
      float d = distance( vUv, vec2( 0.5 ) );
      color *= 1.0 - uVignette * smoothstep( 0.48, 1.05, d );

      gl_FragColor = vec4( color, texel.a );
    }
  `,
}

export class PostFx {
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly grade: ShaderPass
  /** Auf der niedrigen Detailstufe rendert das Spiel wie zuvor direkt. */
  private active = true

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const size = renderer.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(renderer)
    this.composer.setPixelRatio(renderer.getPixelRatio())
    this.composer.setSize(size.x, size.y)
    this.composer.addPass(new RenderPass(scene, camera))

    // Schwelle 1.05 liegt ueber der besonnten Fassade, Staerke 0.34 traegt den
    // Schein, ohne die Kante aufzuweichen. Radius klein: ein weiter Halo laesst
    // die Silhouette ausfransen, und die lebt in diesem Stil von der Kante.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.45, 1.05)
    this.composer.addPass(this.bloom)

    this.grade = new ShaderPass(GRADE_SHADER)
    this.composer.addPass(this.grade)

    this.composer.addPass(new OutputPass())
  }

  /** Haengt an der Einstellung "Hohe Detailstufe". */
  setEnabled(enabled: boolean): void {
    this.active = enabled
  }

  get enabled(): boolean {
    return this.active
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.active) {
      this.renderer.render(scene, camera)
      return
    }
    this.composer.render()
  }

  setSize(width: number, height: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(width, height)
    this.bloom.setSize(width, height)
  }

  dispose(): void {
    this.composer.dispose()
  }
}
