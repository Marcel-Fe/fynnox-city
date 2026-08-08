import { vehicleContract } from '../contracts/manifests'
import type { InputContextId } from '../contracts/types'
import type { MissionStep } from '../mission/MissionFlow'
import type { CollectibleState } from '../collect/CollectionSystem'

const STORAGE_KEY = 'fynnox-city.save.v1'
const SCHEMA_VERSION = 1

export interface SaveData {
  schema: number
  savedAt: string
  /** Pflichtfelder aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json (save_atomic_fields). */
  player_state: { x: number; y: number; z: number; heading: number }
  vehicle_id: string | null
  seat_id: string | null
  vehicle_transform: { x: number; y: number; z: number; heading: number }
  door_or_hatch_state: 'open' | 'closed' | 'moving'
  active_input_context: InputContextId
  camera_profile: string
  /** Weitere Fahrzeuge: eigener Transform, damit Liegeplatz und Steg erhalten bleiben.
   *  Optional, damit aeltere Staende ohne diese Felder weiter laden. */
  water_taxi_transform: { x: number; y: number; z: number; heading: number }
  skyfin_transform?: { x: number; y: number; z: number; heading: number }
  scout_transform?: { x: number; y: number; z: number; heading: number }
  /** Fortschritt der Slice-Systeme. */
  harbor_task: 'locked' | 'briefed' | 'sampled' | 'reported'
  mission_step: MissionStep
  puzzle_solved: boolean
  fountain_active: boolean
  project_stage: number
  wallet: number
  collectibles: CollectibleState[]
  time_of_day: number
  settings: {
    reducedMotion: boolean
    largeText: boolean
    subtitles: boolean
    shapeAndColor: boolean
    driveAssist: boolean
    sensitivity: number
    debugOverlay: boolean
  }
  onboarding_done: boolean
}

/**
 * Atomarer Speicherstand.
 * Geschrieben wird erst ein vollstaendiges Objekt, dann ein Commit-Schluessel -
 * ein abgebrochener Schreibvorgang darf keinen halben Stand hinterlassen.
 */
export class SaveGame {
  static requiredFields(): string[] {
    return vehicleContract.global_contract.save_atomic_fields
  }

  static save(data: SaveData): boolean {
    for (const field of SaveGame.requiredFields()) {
      if (!(field in data)) {
        console.error(`Savegame unvollstaendig: Pflichtfeld ${field} fehlt`)
        return false
      }
    }
    try {
      const payload = JSON.stringify({ ...data, schema: SCHEMA_VERSION })
      // Zuerst in einen Staging-Schluessel, dann umhaengen.
      localStorage.setItem(`${STORAGE_KEY}.staging`, payload)
      localStorage.setItem(STORAGE_KEY, payload)
      localStorage.removeItem(`${STORAGE_KEY}.staging`)
      return true
    } catch (error) {
      console.error('Speichern fehlgeschlagen', error)
      return false
    }
  }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(`${STORAGE_KEY}.staging`)
      if (!raw) return null
      const data = JSON.parse(raw) as SaveData
      if (data.schema !== SCHEMA_VERSION) return null
      if (data.wallet < 0) data.wallet = 0
      return data
    } catch (error) {
      console.error('Speicherstand unlesbar, starte neu', error)
      return null
    }
  }

  static clear(): void {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(`${STORAGE_KEY}.staging`)
  }
}
