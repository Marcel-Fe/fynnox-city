import * as THREE from 'three'
import { COLORS } from '../core/Palette'

/**
 * Stilisiertes Hafenwasser. Bleibt waehrend Dialog und Boarding sichtbar in
 * Bewegung - das Paket verbietet ein eingefrorenes Standbild ausdruecklich.
 */
export class Water {
  readonly mesh: THREE.Mesh
  private readonly uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(COLORS.water) },
    uShallow: { value: new THREE.Color(COLORS.cyan) },
    uSun: { value: new THREE.Color('#FFE7B8') },
  }

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(400, 300, 100, 75)
    geometry.rotateX(-Math.PI / 2)
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vWave;
        varying vec3 vWorld;
        void main() {
          vec3 p = position;
          // Vier Wellenzuege statt drei. Die vierte Lage bleibt bei 0.44 rad/m:
          // das Gitter hat 4 m Maschenweite, kuerzere Wellen als rund 14 m
          // wuerden zwischen den Stuetzpunkten verschluckt und flackern.
          float w = sin(p.x * 0.25 + uTime * 1.1) * 0.16
                  + sin(p.z * 0.31 - uTime * 0.8) * 0.12
                  + sin((p.x + p.z) * 0.13 + uTime * 0.5) * 0.09
                  + sin((p.x - p.z) * 0.44 + uTime * 1.6) * 0.05;
          p.y += w;
          vWave = w;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSun;
        uniform float uTime;
        varying float vWave;
        varying vec3 vWorld;
        void main() {
          float shore = smoothstep(36.0, 78.0, vWorld.z);
          vec3 base = mix(uShallow, uDeep, shore);
          // Gestaffelt wie vorher, aber mit weicher Kante. Die harte step-Stufe
          // ergab bei bewegtem Wasser wandernde Streifen statt Wellen - im
          // Standbild ein Stilmittel, in Bewegung ein Fehler.
          float band = smoothstep(0.02, 0.10, vWave) * 0.11
                     + smoothstep(0.13, 0.21, vWave) * 0.15;
          vec3 color = base + uSun * band;
          // Schaumkrone auf den hoechsten Wellen.
          float crest = smoothstep(0.21, 0.28, vWave);
          color = mix(color, vec3(0.93, 0.97, 1.0), crest * 0.45);
          // Glitzern: zwei gekreuzte Wanderwellen, deren Spitzen aufblitzen.
          // Die Wellenlaenge liegt bei rund zehn Metern und das Glitzern blendet
          // mit der Entfernung aus. Mit kurzen Wellen wird daraus in der Ferne
          // ein Punkteflimmern - jedes Pixel trifft dann eine andere Phase.
          float glint = sin(vWorld.x * 0.62 + uTime * 1.2) * sin(vWorld.z * 0.71 - uTime * 0.9);
          float near = 1.0 - smoothstep(30.0, 90.0, length(vWorld - cameraPosition));
          color += uSun * smoothstep(0.82, 1.0, glint) * 0.32 * near;
          // Uferschaum an der Kaimauer.
          float foam = smoothstep(0.0, 1.0, 1.0 - abs(vWorld.z - 35.0) / 3.5);
          color = mix(color, vec3(1.0), foam * (0.3 + 0.18 * sin(uTime * 2.0 + vWorld.x * 0.4)));
          gl_FragColor = vec4(color, 0.94);
        }
      `,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.set(0, -0.4, 100)
    this.mesh.renderOrder = -1
    scene.add(this.mesh)
  }

  update(elapsed: number): void {
    this.uniforms.uTime.value = elapsed
  }
}
