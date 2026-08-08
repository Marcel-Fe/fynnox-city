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
  hasSocket(name: string): boolean
  socketWorld(name: string, target?: THREE.Vector3): THREE.Vector3
  setEntryPartOpen(open: boolean): void
  /** Beantwortet die entry_conditions aus dem Manifest. */
  checkEntryCondition(condition: string): boolean
  place(position: THREE.Vector3, heading: number): void
  drive(delta: number, throttle: number, steer: number, brake: boolean): void
  update(delta: number): void
  /** Ruhezustand, wenn niemand faehrt. */
  settle(delta: number): void
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
