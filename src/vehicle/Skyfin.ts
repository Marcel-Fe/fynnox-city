import * as THREE from 'three'
import { COLORS, mat } from '../core/Palette'
import type { CollisionWorld } from '../core/CollisionWorld'
import { buildSockets, type BoardableVehicle } from './BoardableVehicle'
import type { Mooring } from './BluefinWaterTaxi'

const WATER_LEVEL = -0.4
const MAX_ALTITUDE = 45
/** Ab hier gilt das Flugzeug als in der Luft - darunter liegt es im Wasser. */
const AIRBORNE_MARGIN = 0.35
/** Hoechstfahrt auf dem Wasser - muss ueber TAKEOFF_SPEED liegen, sonst
 *  koennte das Flugzeug seine Startgeschwindigkeit nie erreichen. */
const TAXI_SPEED = 14
const AIR_SPEED = 26
const REVERSE_SPEED = 2
/** Unter dieser Fahrt traegt der Fluegel nicht - vorher hebt nichts ab. */
const TAKEOFF_SPEED = 9
const CLIMB_RATE = 7
const SINK_RATE = 4
/** Auslaufzeit des Propellers: rund vier Sekunden von voller Drehzahl auf null.
 *  Lang genug, dass der Wiedereinstieg direkt nach dem Abstellen lesbar
 *  verweigert wird, kurz genug, dass Warten nicht wie ein Fehler wirkt. */
const PROPELLER_SPINDOWN = 0.25
const DOCK_RADIUS = 8
const DOCK_SPEED = 1.4
/** Halbmasse von Rumpf und Schwimmern, ohne die Fluegel. */
const HALF = new THREE.Vector3(2.2, 1.3, 3.6)

/**
 * Skyfin Kuestenflugzeug.
 * Ein Schwimmerflugzeug, das am Flugsteg im Hafenbecken liegt und erst mit
 * Startgeschwindigkeit abhebt. Die Einstiegskette ist dieselbe wie beim Buggy;
 * neu sind die Bedingungen aus dem Manifest - vehicle_docked_or_parked,
 * propeller_stopped und cockpit_clear - und die dritte Achse.
 */
export class Skyfin implements BoardableVehicle {
  readonly id = 'vehicle_skyfin'
  readonly label = 'Skyfin'
  readonly seatOffset = new THREE.Vector3(0, -0.45, 0)
  readonly verticalLabels = { up: 'Steigen', down: 'Sinken' }
  readonly root = new THREE.Group()
  readonly sockets = new Map<string, THREE.Object3D>()
  readonly position = new THREE.Vector3()
  heading = 0
  speed = 0
  private steer = 0
  private bank = 0
  private pitch = 0
  private vertical = 0
  private clock = 0
  private doorOpen = 0
  private doorTarget = 0
  /** 0 = stillstehend, 1 = volle Drehzahl. Beantwortet propeller_stopped. */
  private propeller = 0
  private readonly door = new THREE.Group()
  private readonly propellerBlades = new THREE.Group()
  private readonly rudder: THREE.Mesh
  private readonly ailerons: THREE.Mesh[] = []
  private readonly belt: THREE.Mesh
  private dock: Mooring | null = null
  private dockBlend = 0

  constructor(
    private readonly collision: CollisionWorld,
    scene: THREE.Scene,
    private readonly docks: Mooring[],
  ) {
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 6.4), mat(COLORS.cream))
    fuselage.position.set(0, 1.35, 0.2)
    fuselage.castShadow = true
    this.root.add(fuselage)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), mat(COLORS.coral))
    nose.position.set(0, 1.35, -3.3)
    this.root.add(nose)
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.8, 2.0), mat(COLORS.glass))
    canopy.position.set(0, 2.1, -1.2)
    this.root.add(canopy)

    // Tragflaeche mit Streben - Hochdecker, damit die Kabine frei einsehbar bleibt.
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.18, 1.9), mat(COLORS.cyan))
    wing.position.set(0, 2.35, -0.3)
    wing.castShadow = true
    this.root.add(wing)
    for (const sx of [-0.62, 0.62]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), mat(COLORS.metal))
      strut.position.set(sx, 2.05, -0.3)
      this.root.add(strut)
    }
    for (const sx of [-3.6, 3.6]) {
      const aileron = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), mat(COLORS.gold))
      aileron.position.set(sx, 2.35, 0.85)
      this.root.add(aileron)
      this.ailerons.push(aileron)
    }

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.4), mat(COLORS.coral))
    fin.position.set(0, 2.6, 3.0)
    this.root.add(fin)
    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.0), mat(COLORS.cyan))
    stabilizer.position.set(0, 2.0, 3.2)
    this.root.add(stabilizer)
    this.rudder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.6), mat(COLORS.gold))
    this.rudder.position.set(0, 2.5, 3.75)
    this.root.add(this.rudder)

    // Schwimmer statt Fahrwerk: das Flugzeug liegt im Wasser, nicht auf der Strasse.
    for (const sx of [-1.6, 1.6]) {
      const float = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 4.6), mat(COLORS.navyMid))
      float.position.set(sx, 0.15, 0.1)
      float.castShadow = true
      this.root.add(float)
      for (const sz of [-1.5, 1.5]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), mat(COLORS.metal))
        strut.position.set(sx, 0.68, sz)
        this.root.add(strut)
      }
    }

    // propeller: eigene Gruppe, damit die Drehzahl sichtbar wird.
    this.propellerBlades.position.set(0, 1.35, -3.9)
    this.root.add(this.propellerBlades)
    const spinner = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(COLORS.metal))
    this.propellerBlades.add(spinner)
    for (const angle of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.08), mat(COLORS.metal))
      blade.rotation.z = angle
      this.propellerBlades.add(blade)
    }

    // cockpit_door schwingt um ihr Scharnier an Backbord.
    this.door.position.set(-0.66, 1.5, -1.9)
    this.root.add(this.door)
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 1.4), mat(COLORS.cream))
    doorPanel.position.set(0, 0, 0.7)
    this.door.add(doorPanel)

    // seat_belt: liegt offen ueber dem Sitz, solange die Tuer offen steht.
    this.belt = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.09, 0.1), mat(COLORS.coral))
    this.belt.position.set(0, 1.42, -0.62)
    this.root.add(this.belt)

    for (const [name, object] of buildSockets(this.id, this.root, {
      entry_pilot: [-2.6, 0.55, -0.4],
      exit_pilot_primary: [-3.4, 0.55, -0.4],
      seat_pilot: [0, 1.5, -0.9],
      camera_boarding: [-4.6, 2.8, 2.6],
      camera_drive: [0, 3.4, 10],
      hand_grab_lower: [-0.72, 1.1, -0.4],
      hand_cockpit_frame: [-0.68, 2.05, -1.9],
      hand_control_l: [-0.3, 1.7, -2.1],
      hand_control_r: [0.3, 1.7, -2.1],
      foot_float_step: [-1.6, 0.45, 0.1],
      foot_cockpit_step: [-0.55, 1.05, -0.9],
      belt_anchor_l: [-0.42, 1.42, -0.6],
      belt_anchor_r: [0.42, 1.42, -0.6],
    })) {
      this.sockets.set(name, object)
    }

    scene.add(this.root)
  }

  hasSocket(name: string): boolean {
    return this.sockets.has(name)
  }

  socketWorld(name: string, target = new THREE.Vector3()): THREE.Vector3 {
    const socket = this.sockets.get(name)
    if (!socket) throw new Error(`Socket unbekannt: ${name}`)
    this.root.updateMatrixWorld(true)
    return socket.getWorldPosition(target)
  }

  get roll(): number {
    return this.bank
  }

  get isAirborne(): boolean {
    return this.position.y > this.floorAt(this.position.x, this.position.z) + AIRBORNE_MARGIN
  }

  get isStationary(): boolean {
    return Math.abs(this.speed) < 0.35 && !this.isAirborne
  }

  /** Sichtbare Drehzahl - Grundlage der Bedingung propeller_stopped. */
  get propellerRate(): number {
    return this.propeller
  }

  get dockedAt(): Mooring | null {
    return this.dock
  }

  get entryPartState(): 'open' | 'closed' | 'moving' {
    if (this.doorOpen > 0.97) return 'open'
    if (this.doorOpen < 0.03) return 'closed'
    return 'moving'
  }

  setEntryPartOpen(open: boolean): void {
    this.doorTarget = open ? 1 : 0
  }

  setVerticalInput(value: number): void {
    this.vertical = THREE.MathUtils.clamp(value, -1, 1)
  }

  /** entry_conditions aus FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json. */
  checkEntryCondition(condition: string): boolean {
    switch (condition) {
      case 'vehicle_docked_or_parked':
        return this.dock !== null && !this.isAirborne
      case 'propeller_stopped':
        return this.propeller < 0.04
      case 'cockpit_clear': {
        // Geprueft wird der Stehplatz am Einstieg, nicht das Cockpit selbst -
        // dort steht Fynnox, bevor er sich hineinzieht.
        const anchor = this.socketWorld('entry_pilot')
        const ground = this.collision.groundHeightAt(anchor.x, anchor.z, anchor.y + 1.5, 0.35, 'vehicle')
        const base = ground > -100 ? ground : anchor.y
        const box = new THREE.Box3(
          new THREE.Vector3(anchor.x - 0.35, base + 0.15, anchor.z - 0.35),
          new THREE.Vector3(anchor.x + 0.35, base + 1.6, anchor.z + 0.35),
        )
        return this.collision.isFree(box, 'vehicle')
      }
      default:
        throw new Error(`${this.id} kennt die Bedingung ${condition} nicht`)
    }
  }

  exitBlockedReason(): string | null {
    if (this.isAirborne) return 'Skyfin ist in der Luft - erst auf dem Wasser aufsetzen.'
    return null
  }

  place(position: THREE.Vector3, heading: number): void {
    this.position.copy(position)
    this.heading = heading
    this.speed = 0
    this.vertical = 0
    this.bank = 0
    this.propeller = 0
    // Ein geladener Stand darf das Flugzeug nicht mitten in der Luft oder ueber
    // der Stadt absetzen: dann geht es zurueck an den Steg.
    if (!this.isWater(position.x, position.z) && this.docks.length > 0) {
      const home = this.nearestDock(true) ?? this.docks[0]
      this.position.copy(home.position)
      this.heading = home.heading
    }
    this.position.y = WATER_LEVEL
    this.dock = this.nearestDock()
    this.dockBlend = this.dock ? 1 : 0
    this.syncTransform()
    this.updateCollider()
  }

  /** Flugphysik: Arcade, kein Schaden, kein Rammen (Sicherheitsinvariante). */
  drive(delta: number, throttle: number, steerInput: number, brake: boolean): void {
    const airborne = this.isAirborne
    const limit = airborne ? AIR_SPEED : TAXI_SPEED

    if (brake && !airborne) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * delta)
    } else if (throttle !== 0) {
      const target = throttle > 0 ? limit : -REVERSE_SPEED
      this.speed += (target - this.speed) * Math.min(1, delta * 0.7)
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.5 * delta)
    }

    // Der Propeller folgt dem Gasgriff, laeuft aber deutlich langsamer aus -
    // deshalb ist der Wiedereinstieg direkt nach dem Abstellen noch gesperrt.
    const demand = Math.max(Math.abs(throttle), Math.abs(this.speed) / AIR_SPEED)
    this.propeller +=
      demand > this.propeller
        ? Math.min(demand - this.propeller, delta * 2.5)
        : -Math.min(this.propeller - demand, delta * PROPELLER_SPINDOWN)

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1)
    this.steer += (steerInput - this.steer) * Math.min(1, delta * 3.5)
    this.bank += (-this.steer * 0.6 * speedFactor - this.bank) * Math.min(1, delta * 3)
    const turnRate = airborne ? 0.85 : 0.55
    this.heading -= this.steer * speedFactor * delta * turnRate * Math.sign(this.speed || 1)

    // Auftrieb erst ab Startgeschwindigkeit; ohne Fahrt sinkt das Flugzeug zurueck.
    let climb = 0
    if (this.vertical > 0 && this.speed > TAKEOFF_SPEED) climb = CLIMB_RATE * this.vertical
    else if (this.vertical < 0) climb = CLIMB_RATE * 0.75 * this.vertical
    else if (airborne && this.speed <= TAKEOFF_SPEED) climb = -SINK_RATE
    this.pitch += (THREE.MathUtils.clamp(climb / CLIMB_RATE, -1, 1) * 0.22 - this.pitch) * Math.min(1, delta * 3)

    const next = this.position.clone()
    next.x -= Math.sin(this.heading) * this.speed * delta
    next.z -= Math.cos(this.heading) * this.speed * delta
    next.y = THREE.MathUtils.clamp(this.position.y + climb * delta, -100, MAX_ALTITUDE)
    next.y = Math.max(next.y, this.floorAt(next.x, next.z))

    if (this.canOccupy(next, airborne)) {
      this.position.copy(next)
    } else {
      // Anstossen bremst, beschaedigt aber nichts.
      this.speed *= 0.25
      this.position.y = Math.max(this.position.y, this.floorAt(this.position.x, this.position.z))
    }

    this.updateDock(delta)
    this.syncTransform()
    this.updateCollider()
  }

  update(delta: number): void {
    this.clock += delta
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, delta * 5)
    this.door.rotation.y = -this.doorOpen * 1.25
    // seat_belt: geschlossene Tuer heisst angeschnallt, offene Tuer geloester Gurt.
    this.belt.rotation.z = this.doorOpen * 0.9
    this.belt.position.y = 1.42 + this.doorOpen * 0.12
    this.propellerBlades.rotation.z += delta * (1.5 + this.propeller * 42)
    this.rudder.rotation.y = this.steer * 0.45
    for (let i = 0; i < this.ailerons.length; i++) {
      this.ailerons[i].rotation.x = (i === 0 ? 1 : -1) * this.steer * 0.3
    }
    this.syncTransform()
  }

  /** Ruhezustand: das Flugzeug sinkt zurueck aufs Wasser und legt am Steg an. */
  settle(delta: number): void {
    this.vertical = 0
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2.2 * delta)
    this.propeller = Math.max(0, this.propeller - delta * PROPELLER_SPINDOWN)
    this.bank += (0 - this.bank) * Math.min(1, delta * 2)
    const floor = this.floorAt(this.position.x, this.position.z)
    if (this.position.y > floor) this.position.y = Math.max(floor, this.position.y - SINK_RATE * delta)
    this.updateDock(delta)
    this.syncTransform()
    this.updateCollider()
  }

  /** Automatisches Anlegen am Flugsteg, sobald das Flugzeug langsam genug ist. */
  private updateDock(delta: number): void {
    const slow = Math.abs(this.speed) < DOCK_SPEED && !this.isAirborne
    const candidate = slow ? this.nearestDock() : null
    if (candidate !== this.dock) {
      this.dock = candidate
      this.dockBlend = 0
    }
    if (!this.dock) return
    this.dockBlend = Math.min(1, this.dockBlend + delta * 2)
    const t = this.dockBlend * Math.min(1, delta * 5)
    this.position.lerp(this.dock.position, t)
    this.position.y = WATER_LEVEL
    let diff = this.dock.heading - this.heading
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.heading += diff * t
    this.speed *= 0.85
  }

  private nearestDock(ignoreDistance = false): Mooring | null {
    let best: Mooring | null = null
    let bestDistance = ignoreDistance ? Infinity : DOCK_RADIUS
    for (const dock of this.docks) {
      const distance = Math.hypot(dock.position.x - this.position.x, dock.position.z - this.position.z)
      if (distance < bestDistance) {
        best = dock
        bestDistance = distance
      }
    }
    return best
  }

  /** Wasserflaeche: alles, wo der Beckenboden tief unter der Kaikante liegt. */
  private isWater(x: number, z: number): boolean {
    return this.collision.groundHeightAt(x, z, 6, 1.0, 'vehicle') < -1
  }

  private floorAt(x: number, z: number): number {
    const ground = this.collision.groundHeightAt(x, z, MAX_ALTITUDE + 2, 1.0, 'vehicle')
    return ground > -1 ? ground : WATER_LEVEL
  }

  private canOccupy(next: THREE.Vector3, airborne: boolean): boolean {
    // Am Boden bleibt das Skyfin auf dem Wasser - es rollt nicht durch die Stadt.
    if (!airborne && !this.isWater(next.x, next.z)) return false
    const box = new THREE.Box3(
      new THREE.Vector3(next.x - HALF.x, next.y, next.z - HALF.z),
      new THREE.Vector3(next.x + HALF.x, next.y + HALF.y * 2, next.z + HALF.z),
    )
    return this.collision.isFree(box, 'vehicle')
  }

  private syncTransform(): void {
    this.root.position.set(
      this.position.x,
      this.position.y + (this.isAirborne ? 0 : Math.sin(this.clock * 1.5) * 0.04),
      this.position.z,
    )
    this.root.rotation.set(this.pitch, this.heading, this.bank)
    this.root.updateMatrixWorld(true)
  }

  /**
   * Dynamischer Collider aus der gedrehten Grundflaeche - die Fluegel bleiben
   * bewusst aussen vor, sonst blockierten sie den Ausstiegsanker am Steg.
   */
  private updateCollider(): void {
    const c = Math.abs(Math.cos(this.heading))
    const s = Math.abs(Math.sin(this.heading))
    const hx = HALF.x * c + HALF.z * s
    const hz = HALF.x * s + HALF.z * c
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - hx, this.position.y, this.position.z - hz),
      new THREE.Vector3(this.position.x + hx, this.position.y + HALF.y * 2, this.position.z + hz),
    )
    this.collision.setDynamic(this.id, box, 'vehicle')
  }
}
