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
          float w = sin(p.x * 0.25 + uTime * 1.1) * 0.16
                  + sin(p.z * 0.31 - uTime * 0.8) * 0.12
                  + sin((p.x + p.z) * 0.13 + uTime * 0.5) * 0.09;
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
          float shore = smoothstep(36.0, 70.0, vWorld.z);
          vec3 base = mix(uShallow, uDeep, shore);
          // Harte Stufen statt weichem Verlauf: Toon-Anteil der Grafikrichtung.
          float band = step(0.06, vWave) * 0.18 + step(0.15, vWave) * 0.22;
          vec3 color = base + uSun * band;
          float foam = smoothstep(0.9, 1.0, 1.0 - abs(vWorld.z - 35.0) / 3.0);
          color = mix(color, vec3(1.0), foam * (0.35 + 0.25 * sin(uTime * 2.0 + vWorld.x * 0.4)));
          gl_FragColor = vec4(color, 0.92);
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
