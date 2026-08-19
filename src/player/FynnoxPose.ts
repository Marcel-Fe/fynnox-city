import type * as THREE from 'three'
import type { AnimationStateId } from '../contracts/types'

/**
 * Was der Rest des Spiels von der Spielfigur braucht.
 *
 * Es gibt zwei Ausfuehrungen: die prozedurale `FynnoxModel` und die geladene
 * `FynnoxGlbModel`. Der Ladepfad entscheidet zur Startzeit, welche steht -
 * `PlayerController` und `BoardingController` merken davon nichts.
 */
export interface PlayerFigure {
  readonly root: THREE.Object3D
  readonly currentState: AnimationStateId
  setState(state: AnimationStateId): void
  update(delta: number, planarSpeed: number): void
}

/**
 * Die acht beweglichen Teile einer Fynnox-Figur.
 *
 * Bei der prozeduralen Figur sind das Gruppen mit angehaengter Geometrie, beim
 * geladenen Modell Knochen eines Skeletts. Die Schweifgruppe ist optional: das
 * Tripo-Modell hat keinen freistehenden Schweif.
 */
export interface FigureParts {
  hip: THREE.Object3D
  torso: THREE.Object3D
  head: THREE.Object3D
  armL: THREE.Object3D
  armR: THREE.Object3D
  legL: THREE.Object3D
  legR: THREE.Object3D
  tail?: THREE.Object3D
}

/**
 * Die 18 Animationszustaende des Vertrags als handgeschriebene Posen.
 *
 * Beide Fynnox-Ausfuehrungen laufen durch genau diese Funktion. Sie steht
 * bewusst ausserhalb beider Klassen: keines der beiden fertigen 3D-Modelle
 * bringt einen einzigen Animationsclip mit, die Posen sind also die einzige
 * Quelle der Bewegung - und die darf es nur einmal geben, sonst laufen
 * prozedurale und geladene Figur mit der Zeit auseinander.
 *
 * `hipRestY` ist die Ruhehoehe des Hueftgelenks in der jeweiligen Figur. Sie
 * unterscheidet sich: die prozedurale Figur hat Beine ueber 44 % der Hoehe, das
 * gescannte Modell ist gedrungener und setzt die Huefte bei rund 32 % an.
 */
export function applyPose(
  parts: FigureParts,
  state: AnimationStateId,
  clock: number,
  planarSpeed: number,
  hipRestY: number,
): void {
  const stride = state === 'fox_sprint' ? 12 : 8
  const swing = Math.sin(clock * stride) * Math.min(1, planarSpeed / 3)

  // Grundhaltung. Die Huefthoehe gehoert dazu: ohne sie behielt eine Figur, die
  // aus dem Laufen heraus scannt, den letzten Wippenausschlag als Dauerversatz.
  parts.torso.rotation.x = 0
  parts.torso.position.y = 0
  parts.armL.rotation.set(0, 0, 0)
  parts.armR.rotation.set(0, 0, 0)
  parts.legL.rotation.x = 0
  parts.legR.rotation.x = 0
  parts.head.rotation.x = 0
  parts.hip.position.y = hipRestY

  switch (state) {
    case 'fox_walk':
    case 'fox_run_start':
    case 'fox_sprint': {
      parts.legL.rotation.x = swing
      parts.legR.rotation.x = -swing
      parts.armL.rotation.x = -swing * 0.8
      parts.armR.rotation.x = swing * 0.8
      parts.torso.rotation.x = Math.min(0.18, planarSpeed * 0.035)
      parts.hip.position.y = hipRestY + Math.abs(Math.sin(clock * stride)) * 0.03
      break
    }
    case 'fox_jump_start':
    case 'fox_jump_air': {
      parts.legL.rotation.x = -0.7
      parts.legR.rotation.x = -0.3
      parts.armL.rotation.x = -1.6
      parts.armR.rotation.x = -1.4
      break
    }
    case 'fox_land_soft': {
      parts.hip.position.y = hipRestY - 0.12
      parts.legL.rotation.x = 0.35
      parts.legR.rotation.x = 0.35
      break
    }
    case 'fox_ledge_grab':
    case 'fox_climb_up': {
      parts.armL.rotation.x = -2.4
      parts.armR.rotation.x = -2.4
      parts.legL.rotation.x = 0.5
      parts.legR.rotation.x = 0.2
      break
    }
    case 'fox_scan': {
      parts.armR.rotation.x = -1.5
      parts.armL.rotation.x = -0.4
      parts.head.rotation.x = -0.15
      break
    }
    case 'fox_pickup':
    case 'fox_press_button':
    case 'fox_open_door': {
      parts.armR.rotation.x = -1.1
      parts.torso.rotation.x = 0.25
      break
    }
    case 'fox_drive_vehicle':
    case 'fox_enter_vehicle': {
      parts.legL.rotation.x = -1.4
      parts.legR.rotation.x = -1.4
      parts.armL.rotation.x = -1.1
      parts.armR.rotation.x = -1.1
      parts.hip.position.y = hipRestY - 0.1
      break
    }
    case 'fox_wave': {
      parts.armR.rotation.x = -2.2
      parts.armR.rotation.z = Math.sin(clock * 8) * 0.3
      break
    }
    default: {
      parts.hip.position.y = hipRestY + Math.sin(clock * 1.8) * 0.012
      parts.armL.rotation.x = Math.sin(clock * 1.8) * 0.05
      parts.armR.rotation.x = -Math.sin(clock * 1.8) * 0.05
    }
  }

  // Schweif als Sekundaerbewegung - laeuft in jedem Zustand weiter.
  if (parts.tail) {
    parts.tail.rotation.y = Math.sin(clock * 2.2) * 0.28
    parts.tail.rotation.x = -0.35 + Math.sin(clock * 3.1) * 0.12 - planarSpeed * 0.03
  }
}
