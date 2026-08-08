/**
 * Typen zu den Manifesten aus 05_Technik_und_Marke.
 * IDs werden aus dem Paket uebernommen und nie umbenannt
 * (FYNNOX_CITY_DEVELOPER_HANDOFF_EN.md: "Keep its state IDs ... unchanged").
 */

export type InputContextId =
  | 'ctx_on_foot'
  | 'ctx_vehicle'
  | 'ctx_dialogue'
  | 'ctx_scanner'
  | 'ctx_menu'

export type UiActionId =
  | 'action_talk'
  | 'action_use'
  | 'action_scan'
  | 'action_pickup'
  | 'action_enter_vehicle'
  | 'action_exit_vehicle'
  | 'action_map'
  | 'action_mission'
  | 'action_photo'
  | 'action_inventory'
  | 'action_pause'
  | 'action_settings'

export type HudStateId =
  | 'hud_exploration'
  | 'hud_vehicle'
  | 'hud_dialogue'
  | 'hud_scanner'
  | 'hud_pause'
  | 'hud_safe_area_debug'

export type AnimationStateId =
  | 'fox_idle'
  | 'fox_walk'
  | 'fox_run_start'
  | 'fox_sprint'
  | 'fox_jump_start'
  | 'fox_jump_air'
  | 'fox_land_soft'
  | 'fox_ledge_grab'
  | 'fox_climb_up'
  | 'fox_pickup'
  | 'fox_carry'
  | 'fox_place'
  | 'fox_scan'
  | 'fox_press_button'
  | 'fox_open_door'
  | 'fox_enter_vehicle'
  | 'fox_drive_vehicle'
  | 'fox_wave'

export type AmbientStateId =
  | 'npc_walk'
  | 'npc_look_around'
  | 'npc_chat_pair'
  | 'npc_sit_bench'
  | 'npc_carry_parcel'
  | 'npc_sweep'
  | 'npc_water_planter'
  | 'npc_wait_transit'
  | 'npc_enter_vehicle'

export type WorldZoneId =
  | 'Z01_SKY_GARDEN'
  | 'Z02_MAKER_MARKET'
  | 'Z03_CENTRAL_PLAZA'
  | 'Z04_FOXTAIL_GARAGE'
  | 'Z05_METRO_TRAM'
  | 'Z06_HARBOR'

/** Zustandskette aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json. */
export type EntryState =
  | 'entry_requested'
  | 'entry_validated'
  | 'align_to_entry'
  | 'camera_boarding_blend'
  | 'open_entry_part'
  | 'attach_contact_ik'
  | 'root_motion_to_seat'
  | 'bind_to_seat'
  | 'switch_input_context'
  | 'vehicle_control'

export type ExitState =
  | 'exit_requested'
  | 'find_safe_exit'
  | 'stop_vehicle_control'
  | 'open_entry_part'
  | 'root_motion_to_exit'
  | 'unbind_from_seat'
  | 'switch_input_context'
  | 'camera_on_foot_blend'
  | 'on_foot'

export interface VehicleManifestEntry {
  id: string
  type: string
  boarding_camera: string
  control_camera: string
  required_sockets: string[]
  moving_parts: string[]
  animation_ids: string[]
  entry_requires_stationary?: boolean
  entry_conditions?: string[]
  dismount_max_speed_mps?: number
}

export interface CameraProfile {
  id: string
  blend_seconds_range?: [number, number]
  reduced_motion_supported?: boolean
  collision_avoidance?: boolean
  speed_based_distance?: boolean
  horizon_damping?: boolean
  roll_compensation?: boolean
}

export interface SafeExitPolicy {
  validate_with_capsule_sweep: boolean
  prefer_primary_exit: boolean
  use_alternate_exit_when_blocked: boolean
  deny_exit_when_all_anchors_blocked: boolean
  teleport_player_out: boolean
}

export interface VehicleContract {
  global_contract: {
    request_action: string
    exit_action: string
    source_context: InputContextId
    vehicle_context: InputContextId
    entry_state_sequence: EntryState[]
    exit_state_sequence: ExitState[]
    safe_exit_policy: SafeExitPolicy
    save_atomic_fields: string[]
  }
  camera_profiles: CameraProfile[]
  vehicles: VehicleManifestEntry[]
}
