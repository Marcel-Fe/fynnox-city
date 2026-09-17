import * as THREE from 'three'
import { COLORS } from '../core/Palette'

/** Kantenlaenge des Wellengitters, das der Kamera folgt. */
const NEAR_SIZE = 520
/** Maschenweite des Gitters. Kuerzere Wellen als rund 14 m wuerden verschluckt. */
const CELL = 4

/**
 * Stilisiertes Hafenwasser. Bleibt waehrend Dialog und Boarding sichtbar in
 * Bewegung - das Paket verbietet ein eingefrorenes Standbild ausdruecklich.
 *
 * Seit 17.09.2026 reicht das Wasser ueber die ganze Bucht. Ein Gitter mit
 * 4-m-Maschen ueber 2,5 km waeren ueber 300 000 Stuetzpunkte - deshalb traegt
 * nur ein Ausschnitt um die Kamera die Wellen, dahinter liegt eine glatte
 * Flaeche mit derselben Faerbung. Der Ausschnitt rastet auf das Gitter ein,
 * sonst schwimmen die Wellen beim Laufen mit.
 */
export class Water {
  readonly mesh: THREE.Mesh
  private readonly far: THREE.Mesh
  private readonly uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(COLORS.water) },
    uShallow: { value: new THREE.Color(COLORS.cyan) },
    uSun: { value: new THREE.Color('#FFE7B8') },
    /** Mitte des Wellengitters; die glatte Flaeche spart sie aus. */
    uNearCenter: { value: new THREE.Vector2() },
    uNearHalf: { value: NEAR_SIZE / 2 - CELL },
  }

  constructor(scene: THREE.Scene) {
    const segments = NEAR_SIZE / CELL
    const geometry = new THREE.PlaneGeometry(NEAR_SIZE, NEAR_SIZE, segments, segments)
    geometry.rotateX(-Math.PI / 2)
    this.mesh = new THREE.Mesh(geometry, this.material(true))
    this.mesh.position.set(0, -0.4, 100)
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false
    scene.add(this.mesh)

    const farGeometry = new THREE.PlaneGeometry(7200, 3200, 1, 1)
    farGeometry.rotateX(-Math.PI / 2)
    this.far = new THREE.Mesh(farGeometry, this.material(false))
    this.far.position.set(0, -0.45, 1600)
    this.far.renderOrder = -2
    scene.add(this.far)
  }

  private material(waves: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      defines: waves ? { WAVES: '' } : {},
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vWave;
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          float w = 0.0;
          #ifdef WAVES
          // In Weltkoordinaten gerechnet, damit das mitwandernde Gitter die
          // Wellen nicht mitnimmt. Vier Wellenzuege; die vierte Lage bleibt bei
          // 0.44 rad/m - kuerzere Wellen verschluckt das 4-m-Gitter.
          vec3 p = world.xyz;
          w = sin(p.x * 0.25 + uTime * 1.1) * 0.16
            + sin(p.z * 0.31 - uTime * 0.8) * 0.12
            + sin((p.x + p.z) * 0.13 + uTime * 0.5) * 0.09
            + sin((p.x - p.z) * 0.44 + uTime * 1.6) * 0.05;
          world.y += w;
          #endif
          vWave = w;
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSun;
        uniform float uTime;
        uniform vec2 uNearCenter;
        uniform float uNearHalf;
        varying float vWave;
        varying vec3 vWorld;
        void main() {
          // Noerdlich der Kaimauer liegt Land. Die Wellen reichen bis 0,42 m
          // hoch und stuenden sonst als Flecken auf dem Pflaster.
          if (vWorld.z < 34.0) discard;
          #ifndef WAVES
          if (abs(vWorld.x - uNearCenter.x) < uNearHalf && abs(vWorld.z - uNearCenter.y) < uNearHalf) discard;
          #endif
          float shore = smoothstep(36.0, 78.0, vWorld.z);
          vec3 base = mix(uShallow, uDeep, shore);
          // Gestaffelt, aber mit weicher Kante. Die harte step-Stufe ergab bei
          // bewegtem Wasser wandernde Streifen statt Wellen.
          float band = smoothstep(0.02, 0.10, vWave) * 0.11
                     + smoothstep(0.13, 0.21, vWave) * 0.15;
          vec3 color = base + uSun * band;
          float crest = smoothstep(0.21, 0.28, vWave);
          color = mix(color, vec3(0.93, 0.97, 1.0), crest * 0.45);
          // Glitzern blendet mit der Entfernung aus - kurze Wellen werden in der
          // Ferne sonst zu Punkteflimmern.
          float glint = sin(vWorld.x * 0.62 + uTime * 1.2) * sin(vWorld.z * 0.71 - uTime * 0.9);
          float near = 1.0 - smoothstep(30.0, 90.0, length(vWorld - cameraPosition));
          color += uSun * smoothstep(0.82, 1.0, glint) * 0.32 * near;
          float foam = smoothstep(0.0, 1.0, 1.0 - abs(vWorld.z - 35.0) / 3.5);
          color = mix(color, vec3(1.0), foam * (0.3 + 0.18 * sin(uTime * 2.0 + vWorld.x * 0.4)));
          gl_FragColor = vec4(color, 0.94);
        }
      `,
    })
  }

  update(elapsed: number, focus?: THREE.Vector3): void {
    this.uniforms.uTime.value = elapsed
    if (!focus) return
    const x = Math.round(focus.x / CELL) * CELL
    // Das Gitter bleibt suedlich der Kaimauer verankert: seine Vorderkante soll
    // nicht ueber das Land wandern, wenn man in der Oberstadt steht.
    const z = Math.max(34 + NEAR_SIZE / 2 - 60, Math.round(focus.z / CELL) * CELL)
    this.mesh.position.set(x, -0.4, z)
    this.uniforms.uNearCenter.value.set(x, z)
  }
}
