import * as THREE from 'three'
import { vehicleSpec } from '../contracts/manifests'

/**
 * Gemeinsamer Vertrag aller einsteigbaren Fahrzeuge.
 * Die Boarding-Kette kennt nur dieses Interface - welche Sockets ein Fahrzeug
 * tatsaechlich hat, steht im Manifest, nicht im Code.
 */
export interface BoardableVehicle {
  readonly id: string
  readonly position: THREE.Vector3
  heading: number
  speed: number
  readonly isStationary: boolean
  /** Tuer, Tor, Klappe oder Luke - je nach Fahrzeugtyp. */
  readonly entryPartState: 'open' | 'closed' | 'moving'
  /** Abstand vom Sitz-Socket zur Fusshoehe der Figur. */
  readonly seatOffset: THREE.Vector3
  /** Anzeigename fuer HUD und Meldungen. */
  readonly label: string
  /** Rollwinkel um die Laengsachse - Grundlage von cam_vehicle_air/roll_compensation. */
  readonly roll?: number
  /** Beschriftung der Kontextknoepfe, wenn das Fahrzeug eine dritte Achse hat. */
  readonly verticalLabels?: { up: string; down: string }
  hasSocket(name: string): boolean
  socketWorld(name: string, target?: THREE.Vector3): THREE.Vector3
  setEntryPartOpen(open: boolean): void
  /** Beantwortet die entry_conditions aus dem Manifest. */
  checkEntryCondition(condition: string): boolean
  /**
   * Grund, warum ueberhaupt kein Ausstieg zulaessig ist - unabhaengig vom Anker.
   * Ein getauchtes U-Boot und ein fliegendes Flugzeug haben keinen gueltigen
   * Ausstieg, auch wenn zufaellig ein Deck ueber ihnen liegt. null heisst erlaubt.
   */
  exitBlockedReason?(): string | null
  place(position: THREE.Vector3, heading: number): void
  drive(delta: number, throttle: number, steer: number, brake: boolean): void
  /** Dritte Steuerachse: Steigen/Sinken beim Flugzeug, Auf-/Abtauchen beim U-Boot. */
  setVerticalInput?(value: number): void
  update(delta: number): void
  /** Ruhezustand, wenn niemand faehrt. */
  settle(delta: number): void
}

/**
 * Kameraabstand im Fahrbetrieb. Ein Flugzeug braucht mehr Luft als ein Buggy;
 * die Zuordnung steht hier einmal statt als id-Abfrage in Controller und Game.
 */
const CONTROL_CAMERA_DISTANCE: Record<string, number> = {
  vehicle_bluefin_water_taxi: 10,
  vehicle_bluefin_scout: 11,
  vehicle_skyfin: 14,
}

export function controlCameraDistance(vehicleId: string): number {
  return CONTROL_CAMERA_DISTANCE[vehicleId] ?? 7.5
}

export interface ResolvedSockets {
  entry: string
  seat: string
  /** Primaerer Ausstieg zuerst, danach die Alternativen aus dem Manifest. */
  exits: string[]
}

/**
 * Leitet die Rollen aus den required_sockets des Manifests ab, statt
 * "entry_driver" fest zu verdrahten. Ein Wassertaxi hat entry_passenger,
 * ein Flugzeug entry_pilot - der Ablauf bleibt derselbe.
 */
export function resolveSockets(vehicleId: string): ResolvedSockets {
  const spec = vehicleSpec(vehicleId)
  const entry = spec.required_sockets.find((s) => s.startsWith('entry_'))
  const seat = spec.required_sockets.find((s) => s.startsWith('seat_'))
  const exits = spec.required_sockets
    .filter((s) => s.startsWith('exit_'))
    .sort((a, b) => Number(b.includes('primary')) - Number(a.includes('primary')))

  if (!entry) throw new Error(`${vehicleId}: kein entry_-Socket im Manifest`)
  if (!seat) throw new Error(`${vehicleId}: kein seat_-Socket im Manifest`)
  if (exits.length === 0) throw new Error(`${vehicleId}: kein exit_-Socket im Manifest`)
  return { entry, seat, exits }
}

/**
 * Baut die im Manifest geforderten Sockets als Kindobjekte auf.
 * Fehlt eine Position, faellt das beim Start auf - nicht erst im Spiel.
 */
export function buildSockets(
  vehicleId: string,
  root: THREE.Object3D,
  positions: Record<string, [number, number, number]>,
): Map<string, THREE.Object3D> {
  const sockets = new Map<string, THREE.Object3D>()
  for (const name of vehicleSpec(vehicleId).required_sockets) {
    const local = positions[name]
    if (!local) throw new Error(`Socket ${name} aus dem Manifest fehlt am Modell ${vehicleId}`)
    const object = new THREE.Object3D()
    object.position.set(local[0], local[1], local[2])
    root.add(object)
    sockets.set(name, object)
  }
  return sockets
}
