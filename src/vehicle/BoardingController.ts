import * as THREE from 'three'
import { vehicleContract, vehicleSpec } from '../contracts/manifests'
import type { EntryState, ExitState } from '../contracts/types'
import { inputContext } from '../state/InputContext'
import type { CollisionWorld } from '../core/CollisionWorld'
import type { OrbitCameraRig } from '../camera/OrbitCameraRig'
import type { PlayerController } from '../player/PlayerController'
import { resolveSockets, type BoardableVehicle } from './BoardableVehicle'

export type BoardingPhase = 'on_foot' | 'entering' | 'seated' | 'exiting'

interface Step {
  state: EntryState | ExitState
  seconds: number
  enter?: () => void
  during?: (t: number) => void
}

const PLAYER_HALF = new THREE.Vector3(0.3, 0.75, 0.3)

/**
 * Setzt die Ein- und Ausstiegsketten aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json
 * Schritt fuer Schritt um - fuer jedes Fahrzeug im Manifest, nicht nur fuer eines.
 * Die Reihenfolge wird gelesen, nicht nachgebaut: weicht das Manifest ab,
 * weicht der Ablauf mit ab.
 */
export class BoardingController {
  phase: BoardingPhase = 'on_foot'
  currentState: EntryState | ExitState | 'on_foot' = 'on_foot'
  lastDenial: string | null = null
  private active: BoardableVehicle | null = null
  private queue: Step[] = []
  private stepTime = 0
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()
  private headingFrom = 0
  private headingTo = 0

  constructor(
    private readonly player: PlayerController,
    private readonly vehicles: BoardableVehicle[],
    private readonly rig: OrbitCameraRig,
    private readonly collision: CollisionWorld,
    private readonly onEvent: (message: string) => void,
  ) {}

  get vehicle(): BoardableVehicle | null {
    return this.active
  }

  /** Naechstes einsteigbares Fahrzeug in Reichweite - Basis des HUD-Prompts. */
  nearestBoardable(): BoardableVehicle | null {
    if (this.phase !== 'on_foot') return null
    let best: BoardableVehicle | null = null
    let bestDistance = 2.8
    for (const vehicle of this.vehicles) {
      const entry = vehicle.socketWorld(resolveSockets(vehicle.id).entry)
      const distance = this.player.position.distanceTo(entry)
      if (distance < bestDistance) {
        best = vehicle
        bestDistance = distance
      }
    }
    return best
  }

  requestEnter(): boolean {
    const vehicle = this.nearestBoardable()
    if (!vehicle) return false

    const spec = vehicleSpec(vehicle.id)
    const sockets = resolveSockets(vehicle.id)
    const contract = vehicleContract.global_contract

    this.lastDenial = null
    this.active = vehicle
    this.phase = 'entering'

    const entryAnchor = vehicle.socketWorld(sockets.entry)
    const seat = vehicle.socketWorld(sockets.seat)

    const handlers: Partial<Record<EntryState, Step>> = {
      entry_requested: { state: 'entry_requested', seconds: 0 },
      entry_validated: {
        state: 'entry_validated',
        seconds: 0,
        enter: () => {
          if (spec.entry_requires_stationary && !vehicle.isStationary) {
            this.deny(`${vehicle.label} muss stehen.`)
            return
          }
          for (const condition of spec.entry_conditions ?? []) {
            if (vehicle.checkEntryCondition(condition)) continue
            this.deny(DENIAL_TEXT[condition] ?? `Bedingung ${condition} nicht erfuellt.`)
            return
          }
        },
      },
      align_to_entry: {
        state: 'align_to_entry',
        seconds: 0.3,
        enter: () => {
          this.player.controlEnabled = false
          this.from.copy(this.player.position)
          this.to.copy(entryAnchor)
          this.to.y = this.groundAt(this.to)
          this.headingFrom = this.player.heading
          this.headingTo = Math.atan2(
            vehicle.position.x - this.to.x,
            vehicle.position.z - this.to.z,
          )
        },
        during: (t) => this.lerpPlayer(t),
      },
      camera_boarding_blend: {
        state: 'camera_boarding_blend',
        seconds: this.blendSeconds(spec.boarding_camera),
        enter: () => {
          this.rig.blendTo(spec.boarding_camera)
          this.rig.setDistance(4.6)
        },
      },
      open_entry_part: {
        state: 'open_entry_part',
        seconds: 0.4,
        enter: () => vehicle.setEntryPartOpen(true),
      },
      attach_contact_ik: {
        state: 'attach_contact_ik',
        seconds: 0.2,
        enter: () => this.player.playAction('fox_press_button', 0.25),
      },
      root_motion_to_seat: {
        state: 'root_motion_to_seat',
        seconds: 0.55,
        enter: () => {
          this.player.model.setState('fox_enter_vehicle')
          this.from.copy(this.player.position)
          this.to.copy(seat).add(vehicle.seatOffset)
          this.headingFrom = this.player.heading
          this.headingTo = vehicle.heading
        },
        during: (t) => this.lerpPlayer(t),
      },
      bind_to_seat: {
        state: 'bind_to_seat',
        seconds: 0.1,
        enter: () => {
          vehicle.setEntryPartOpen(false)
          this.player.model.setState('fox_drive_vehicle')
        },
      },
      switch_input_context: {
        state: 'switch_input_context',
        seconds: 0,
        enter: () => inputContext.switchTo(contract.vehicle_context),
      },
      vehicle_control: {
        state: 'vehicle_control',
        seconds: 0,
        enter: () => {
          this.phase = 'seated'
          this.rig.blendTo(spec.control_camera)
          this.rig.setDistance(vehicle.id === 'vehicle_bluefin_water_taxi' ? 10 : 7.5)
          this.onEvent(`${vehicle.label} bereit.`)
        },
      },
    }

    this.queue = contract.entry_state_sequence.map((state) => {
      const step = handlers[state]
      if (!step) throw new Error(`Kein Handler fuer Entry-State ${state}`)
      return step
    })
    this.stepTime = 0
    this.beginStep()
    // entry_validated kann abbrechen - dann steht eine Ablehnung fest.
    return this.lastDenial === null
  }

  requestExit(): boolean {
    const vehicle = this.active
    if (this.phase !== 'seated' || !vehicle) return false

    const contract = vehicleContract.global_contract
    const policy = contract.safe_exit_policy
    const sockets = resolveSockets(vehicle.id)

    // find_safe_exit: Kapselsweep an Primaer-, dann Alternativanker.
    const candidates = policy.use_alternate_exit_when_blocked ? sockets.exits : sockets.exits.slice(0, 1)
    let chosen: THREE.Vector3 | null = null
    let chosenName = ''
    for (const name of candidates) {
      if (!vehicle.hasSocket(name)) continue
      const anchor = vehicle.socketWorld(name)
      const ground = this.groundAt(anchor)
      // Ohne tragfaehigen Boden kein Ausstieg - sonst faellt Fynnox ins Wasser.
      if (ground < anchor.y - 2.2) continue
      anchor.y = ground
      if (this.isAnchorFree(anchor)) {
        chosen = anchor
        chosenName = name
        break
      }
    }

    if (!chosen) {
      // deny_exit_when_all_anchors_blocked: niemals durch Geometrie teleportieren.
      this.lastDenial =
        vehicle.id === 'vehicle_bluefin_water_taxi'
          ? 'Kein Anleger in Reichweite - langsam an eine Anlegestelle heranfahren.'
          : 'Ausstieg blockiert - Fahrzeug etwas weiter weg abstellen.'
      this.onEvent(this.lastDenial)
      return false
    }

    this.lastDenial = null
    this.phase = 'exiting'
    const exitAnchor = chosen

    const handlers: Partial<Record<ExitState, Step>> = {
      exit_requested: { state: 'exit_requested', seconds: 0 },
      find_safe_exit: {
        state: 'find_safe_exit',
        seconds: 0,
        enter: () => this.onEvent(`Sicherer Ausstieg: ${chosenName}`),
      },
      stop_vehicle_control: {
        state: 'stop_vehicle_control',
        seconds: 0.15,
        enter: () => {
          vehicle.speed = 0
        },
      },
      open_entry_part: {
        state: 'open_entry_part',
        seconds: 0.4,
        enter: () => vehicle.setEntryPartOpen(true),
      },
      root_motion_to_exit: {
        state: 'root_motion_to_exit',
        seconds: 0.55,
        enter: () => {
          this.player.model.setState('fox_enter_vehicle')
          this.from.copy(this.player.position)
          this.to.copy(exitAnchor)
          this.headingFrom = this.player.heading
          this.headingTo = Math.atan2(
            exitAnchor.x - vehicle.position.x,
            exitAnchor.z - vehicle.position.z,
          )
        },
        during: (t) => this.lerpPlayer(t),
      },
      unbind_from_seat: {
        state: 'unbind_from_seat',
        seconds: 0.1,
        enter: () => {
          vehicle.setEntryPartOpen(false)
          this.player.teleport(exitAnchor, this.headingTo)
        },
      },
      switch_input_context: {
        state: 'switch_input_context',
        seconds: 0,
        enter: () => inputContext.switchTo(contract.source_context),
      },
      camera_on_foot_blend: {
        state: 'camera_on_foot_blend',
        seconds: this.rig.reducedMotion ? 0 : 0.4,
        enter: () => {
          this.rig.blendTo('cam_on_foot', 0.4)
          this.rig.setDistance(5.2)
        },
      },
      on_foot: {
        state: 'on_foot',
        seconds: 0,
        enter: () => {
          this.phase = 'on_foot'
          this.active = null
          this.player.controlEnabled = true
          this.player.model.setState('fox_idle')
        },
      },
    }

    this.queue = contract.exit_state_sequence.map((state) => {
      const step = handlers[state]
      if (!step) throw new Error(`Kein Handler fuer Exit-State ${state}`)
      return step
    })
    this.stepTime = 0
    this.beginStep()
    return true
  }

  update(delta: number): void {
    if (this.phase === 'seated') {
      this.bindPlayerToSeat()
      return
    }
    if (this.queue.length === 0) return

    const step = this.queue[0]
    this.stepTime += delta
    const t = step.seconds > 0 ? Math.min(1, this.stepTime / step.seconds) : 1
    step.during?.(t)
    if (this.phase === 'entering' || this.phase === 'exiting') this.player.model.update(delta, 0)
    if (t >= 1) {
      this.queue.shift()
      this.stepTime = 0
      this.beginStep()
    }
  }

  private beginStep(): void {
    const step = this.queue[0]
    if (!step) return
    this.currentState = step.state
    step.enter?.()
    if (this.queue[0] === step && step.seconds === 0) {
      this.queue.shift()
      this.beginStep()
    }
  }

  private deny(reason: string): void {
    this.lastDenial = reason
    this.onEvent(reason)
    this.queue = []
    this.phase = 'on_foot'
    this.currentState = 'on_foot'
    this.active = null
    this.player.controlEnabled = true
  }

  private blendSeconds(profileId: string): number {
    if (this.rig.reducedMotion) return 0
    const profile = vehicleContract.camera_profiles.find((p) => p.id === profileId)
    const range = profile?.blend_seconds_range
    return range ? (range[0] + range[1]) / 2 : 0.4
  }

  private lerpPlayer(t: number): void {
    const eased = t * t * (3 - 2 * t)
    this.player.position.lerpVectors(this.from, this.to, eased)
    let diff = this.headingTo - this.headingFrom
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.player.heading = this.headingFrom + diff * eased
    this.player.model.root.position.copy(this.player.position)
    this.player.model.root.rotation.y = this.player.heading
  }

  private bindPlayerToSeat(): void {
    const vehicle = this.active
    if (!vehicle) return
    const seat = vehicle.socketWorld(resolveSockets(vehicle.id).seat)
    this.player.position.copy(seat).add(vehicle.seatOffset)
    this.player.heading = vehicle.heading
    this.player.model.root.position.copy(this.player.position)
    this.player.model.root.rotation.y = vehicle.heading
  }

  private groundAt(point: THREE.Vector3): number {
    const ground = this.collision.groundHeightAt(point.x, point.z, point.y + 1.2, 0.3, 'vehicle')
    return ground > -100 ? ground : point.y - 100
  }

  private isAnchorFree(anchor: THREE.Vector3): boolean {
    const box = new THREE.Box3(
      new THREE.Vector3(anchor.x - PLAYER_HALF.x, anchor.y + 0.1, anchor.z - PLAYER_HALF.z),
      new THREE.Vector3(anchor.x + PLAYER_HALF.x, anchor.y + PLAYER_HALF.y * 2, anchor.z + PLAYER_HALF.z),
    )
    return this.collision.isFree(box)
  }
}

const DENIAL_TEXT: Record<string, string> = {
  vehicle_docked: 'Das Boot liegt nicht am Anleger.',
  ramp_deployed: 'Die Rampe ist noch nicht ausgefahren.',
  boarding_lane_clear: 'Der Einstieg ist versperrt.',
}
