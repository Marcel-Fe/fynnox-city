import * as THREE from 'three'
import { vehicleContract, vehicleSpec } from '../contracts/manifests'
import type { EntryState, ExitState } from '../contracts/types'
import { inputContext } from '../state/InputContext'
import type { CollisionWorld } from '../core/CollisionWorld'
import type { OrbitCameraRig } from '../camera/OrbitCameraRig'
import type { PlayerController } from '../player/PlayerController'
import type { CitySpark } from './CitySpark'

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
 * Schritt fuer Schritt um. Die Reihenfolge wird nicht nachgebaut, sondern aus
 * dem Manifest gelesen - weicht das Manifest ab, weicht der Ablauf mit ab.
 */
export class BoardingController {
  phase: BoardingPhase = 'on_foot'
  currentState: EntryState | ExitState | 'on_foot' = 'on_foot'
  lastDenial: string | null = null
  private queue: Step[] = []
  private stepTime = 0
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()
  private readonly seatOffset = new THREE.Vector3(0, -0.45, 0)
  private headingFrom = 0
  private headingTo = 0

  constructor(
    private readonly player: PlayerController,
    private readonly vehicle: CitySpark,
    private readonly rig: OrbitCameraRig,
    private readonly collision: CollisionWorld,
    private readonly onEvent: (message: string) => void,
  ) {}

  get spec() {
    return vehicleSpec(this.vehicle.id)
  }

  /** Reichweite fuer den Kontext-Prompt "Einsteigen". */
  canRequestEnter(): boolean {
    if (this.phase !== 'on_foot') return false
    const entry = this.vehicle.socketWorld('entry_driver')
    return this.player.position.distanceTo(entry) < 2.6
  }

  requestEnter(): boolean {
    if (!this.canRequestEnter()) return false
    this.lastDenial = null
    this.phase = 'entering'

    const contract = vehicleContract.global_contract
    const entryAnchor = this.vehicle.socketWorld('entry_driver')
    const seat = this.vehicle.socketWorld('seat_driver')

    const handlers: Partial<Record<EntryState, Step>> = {
      entry_requested: { state: 'entry_requested', seconds: 0 },
      entry_validated: {
        state: 'entry_validated',
        seconds: 0,
        enter: () => {
          // entry_requires_stationary aus dem Manifest.
          if (this.spec.entry_requires_stationary && !this.vehicle.isStationary) {
            this.deny('Fahrzeug muss stehen')
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
            this.vehicle.position.x - this.to.x,
            this.vehicle.position.z - this.to.z,
          )
        },
        during: (t) => this.lerpPlayer(t),
      },
      camera_boarding_blend: {
        state: 'camera_boarding_blend',
        seconds: this.blendSeconds(this.spec.boarding_camera),
        enter: () => {
          this.rig.blendTo(this.spec.boarding_camera)
          this.rig.setDistance(4.2)
        },
      },
      open_entry_part: {
        state: 'open_entry_part',
        seconds: 0.4,
        enter: () => this.vehicle.setDoorOpen(true),
      },
      attach_contact_ik: {
        state: 'attach_contact_ik',
        seconds: 0.2,
        enter: () => this.player.playAction('fox_press_button', 0.25),
      },
      root_motion_to_seat: {
        state: 'root_motion_to_seat',
        seconds: 0.5,
        enter: () => {
          this.player.model.setState('fox_enter_vehicle')
          this.from.copy(this.player.position)
          this.to.copy(seat).add(this.seatOffset)
          this.headingFrom = this.player.heading
          this.headingTo = this.vehicle.heading
        },
        during: (t) => this.lerpPlayer(t),
      },
      bind_to_seat: {
        state: 'bind_to_seat',
        seconds: 0.1,
        enter: () => {
          this.vehicle.setDoorOpen(false)
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
          this.rig.blendTo(this.spec.control_camera)
          this.rig.setDistance(7.5)
          this.onEvent('City Spark bereit - Gas geben mit dem Stick.')
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
    if (this.phase !== 'seated') return false
    const contract = vehicleContract.global_contract
    const policy = contract.safe_exit_policy

    // find_safe_exit: Kapselsweep an Primaer-, dann Alternativanker.
    const candidates = policy.prefer_primary_exit
      ? ['exit_driver_primary', 'exit_driver_alt']
      : ['exit_driver_alt', 'exit_driver_primary']
    if (!policy.use_alternate_exit_when_blocked) candidates.length = 1
    let chosen: THREE.Vector3 | null = null
    let chosenName = ''
    for (const name of candidates) {
      if (!this.vehicle.sockets.has(name)) continue
      const anchor = this.vehicle.socketWorld(name)
      anchor.y = this.groundAt(anchor)
      if (this.isAnchorFree(anchor)) {
        chosen = anchor
        chosenName = name
        break
      }
    }

    if (!chosen) {
      // deny_exit_when_all_anchors_blocked: niemals durch Geometrie teleportieren.
      this.lastDenial = 'Ausstieg blockiert - Fahrzeug etwas weiter weg abstellen.'
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
          this.vehicle.speed = 0
        },
      },
      open_entry_part: {
        state: 'open_entry_part',
        seconds: 0.4,
        enter: () => this.vehicle.setDoorOpen(true),
      },
      root_motion_to_exit: {
        state: 'root_motion_to_exit',
        seconds: 0.5,
        enter: () => {
          this.player.model.setState('fox_enter_vehicle')
          this.from.copy(this.player.position)
          this.to.copy(exitAnchor)
          this.headingFrom = this.player.heading
          this.headingTo = Math.atan2(
            exitAnchor.x - this.vehicle.position.x,
            exitAnchor.z - this.vehicle.position.z,
          )
        },
        during: (t) => this.lerpPlayer(t),
      },
      unbind_from_seat: {
        state: 'unbind_from_seat',
        seconds: 0.1,
        enter: () => {
          this.vehicle.setDoorOpen(false)
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
    if (step.seconds === 0) {
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
    const seat = this.vehicle.socketWorld('seat_driver')
    this.player.position.copy(seat).add(this.seatOffset)
    this.player.heading = this.vehicle.heading
    this.player.model.root.position.copy(this.player.position)
    this.player.model.root.rotation.y = this.vehicle.heading
  }

  private groundAt(point: THREE.Vector3): number {
    const ground = this.collision.groundHeightAt(point.x, point.z, point.y + 1.2, 0.3, 'vehicle')
    return ground > -100 ? ground : point.y
  }

  private isAnchorFree(anchor: THREE.Vector3): boolean {
    const box = new THREE.Box3(
      new THREE.Vector3(anchor.x - PLAYER_HALF.x, anchor.y + 0.05, anchor.z - PLAYER_HALF.z),
      new THREE.Vector3(anchor.x + PLAYER_HALF.x, anchor.y + PLAYER_HALF.y * 2, anchor.z + PLAYER_HALF.z),
    )
    return this.collision.isFree(box)
  }
}
