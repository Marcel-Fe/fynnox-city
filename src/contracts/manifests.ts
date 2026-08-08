/**
 * Laedt die unveraenderten Paket-Manifeste und validiert sie beim Start.
 * Faellt die Validierung, startet das Spiel nicht - lieber ein lautes
 * Scheitern als stille Abweichung vom Vertrag.
 */
import base from './PROGRAMMIER_ASSET_MANIFEST_v1_4.json'
import additive15 from './PROGRAMMIER_ASSET_MANIFEST_v1_5.json'
import additive16 from './PROGRAMMIER_ASSET_MANIFEST_v1_6.json'
import vehicleRaw from './FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json'
import onboardingTokens from './ONBOARDING_TOKENS.json'
import type {
  AnimationStateId,
  CameraProfile,
  UiActionId,
  VehicleContract,
  VehicleManifestEntry,
  WorldZoneId,
} from './types'

export const vehicleContract = vehicleRaw as unknown as VehicleContract

/** Farbtokens aus ONBOARDING_TOKENS.json - projektweit verbindlich. */
export const tokens = onboardingTokens.colors as {
  navy: string
  navy_mid: string
  cyan: string
  coral: string
  cream: string
  gold: string
}

export const minimumTouchTargetPx = onboardingTokens.minimum_touch_target_px
export const minimumBodyTextPx = onboardingTokens.minimum_body_text_px

/** Dateiname der Icon-PNGs je UI-Action, abgeleitet aus dem v1.4-Manifest. */
export const iconFileByAction: Record<string, string> = Object.fromEntries(
  base.ui_icons.map((i) => [i.action, i.file.split('/').pop() as string]),
)

export const worldZoneIds = base.world_zones.map((z) => z.id) as WorldZoneId[]
export const animationStateIds = base.animation_states.map((a) => a.id) as AnimationStateId[]
export const uiActionIds = base.ui_icons.map((i) => i.action) as UiActionId[]
export const ambientStateIds = base.ambient_states.map((a) => a.id)

export function cameraProfile(id: string): CameraProfile {
  const profile = vehicleContract.camera_profiles.find((p) => p.id === id)
  if (!profile) throw new Error(`Kameraprofil unbekannt: ${id}`)
  return profile
}

export function vehicleSpec(id: string): VehicleManifestEntry {
  const vehicle = vehicleContract.vehicles.find((v) => v.id === id)
  if (!vehicle) throw new Error(`Fahrzeug nicht im Manifest: ${id}`)
  return vehicle
}

export const collectibleIds = additive15.collectibles.map((c) => c.id)
export const rewardStationIds = additive15.reward_stations.map((s) => s.id)
export const worldProjects = additive15.world_projects
export const safetyInvariants = additive15.safety_invariants

export function worldProject(id: string) {
  const project = worldProjects.find((p) => p.id === id)
  if (!project) throw new Error(`Stadtprojekt nicht im Manifest: ${id}`)
  return project
}

function collectIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectIds(item, out)
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'id' && typeof value === 'string') out.add(value)
      else collectIds(value, out)
    }
  }
}

export function validateManifests(): void {
  const errors: string[] = []

  if (base.units.world_unit_meters !== 1 || base.units.snap_grid_meters !== 0.5) {
    errors.push('Einheiten weichen vom Paket ab (1 m / 0,5 m Snap-Grid erwartet).')
  }
  if (vehicleContract.global_contract.safe_exit_policy.teleport_player_out) {
    errors.push('Safe-Exit-Policy erlaubt Teleport - im Paket ausgeschlossen.')
  }
  if (vehicleContract.global_contract.entry_state_sequence.length !== 10) {
    errors.push('Entry-Sequenz hat nicht die vertraglichen 10 Schritte.')
  }
  if (vehicleContract.global_contract.exit_state_sequence.length !== 9) {
    errors.push('Exit-Sequenz hat nicht die vertraglichen 9 Schritte.')
  }
  if (!safetyInvariants.wallet_never_negative || safetyInvariants.injury_or_weapon_system) {
    errors.push('Sicherheitsinvarianten des Pakets verletzt.')
  }

  // Die additiven Manifeste erweitern v1.4, sie duerfen bestehende IDs nicht neu belegen.
  const baseIds = new Set<string>()
  collectIds(base, baseIds)
  const additiveIds = new Set<string>()
  collectIds(additive15, additiveIds)
  collectIds(additive16, additiveIds)
  const collisions = [...additiveIds].filter((id) => baseIds.has(id))
  if (collisions.length > 0) {
    errors.push(`Additive Manifeste belegen v1.4-IDs neu: ${collisions.join(', ')}`)
  }
  if (baseIds.size === 0) errors.push('Basismanifest v1.4 enthaelt keine IDs.')

  if (errors.length > 0) {
    throw new Error(`Manifest-Validierung fehlgeschlagen:\n- ${errors.join('\n- ')}`)
  }
}

export const manifestSummary = {
  packageVersions: [base.package_version, additive15.package_version, additive16.package_version],
  animationStates: base.animation_states.length,
  ambientStates: base.ambient_states.length,
  uiIcons: base.ui_icons.length,
  worldZones: base.world_zones.length,
  vehicles: vehicleContract.vehicles.length,
}
