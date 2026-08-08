import * as THREE from 'three'
import { COLORS, mat } from './Palette'
import { CollisionWorld, type Collider } from './CollisionWorld'
import { buildDistrict, type DistrictAnchors } from '../world/District'
import { Water } from '../world/Water'
import { SkySystem } from '../world/Sky'
import { PlayerController } from '../player/PlayerController'
import { OrbitCameraRig } from '../camera/OrbitCameraRig'
import { InputManager } from '../input/InputManager'
import { CitySpark } from '../vehicle/CitySpark'
import { BoardingController } from '../vehicle/BoardingController'
import { CollectionSystem } from '../collect/CollectionSystem'
import { ScannerPuzzle } from '../mission/ScannerPuzzle'
import { HarborProject } from '../mission/HarborProject'
import { Fountain } from '../mission/Fountain'
import { MissionFlow, type MissionStep } from '../mission/MissionFlow'
import { AmbientNPCSystem } from '../npc/AmbientNPCSystem'
import { HUD, DEFAULT_SETTINGS, type MapMarker, type Settings } from '../ui/HUD'
import { SaveGame, type SaveData } from '../save/SaveGame'
import { inputContext } from '../state/InputContext'
import { manifestSummary } from '../contracts/manifests'
import type { InputContextId, UiActionId } from '../contracts/types'

const PROJECT_STAGE_COST = 15

interface Interactable {
  action: UiActionId
  label: string
  position: THREE.Vector3
  range: number
  requiresScanner?: boolean
  run: () => void
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly collision = new CollisionWorld()
  private readonly clock = new THREE.Clock()
  private readonly anchors: DistrictAnchors
  private readonly water: Water
  private readonly sky: SkySystem
  private readonly rig: OrbitCameraRig
  private readonly player: PlayerController
  private readonly vehicle: CitySpark
  private readonly boarding: BoardingController
  private readonly collectibles: CollectionSystem
  private readonly puzzle: ScannerPuzzle
  private readonly project: HarborProject
  private readonly fountain: Fountain
  private readonly npcs: AmbientNPCSystem
  private readonly mission: MissionFlow
  private readonly hud: HUD
  private readonly input: InputManager
  private readonly gate: THREE.Mesh
  private readonly gateCollider: Collider
  private readonly stationMeshes: THREE.Mesh[] = []
  private readonly impulseMarker: THREE.Mesh
  private contextBeforeMenu: InputContextId = 'ctx_on_foot'
  private lastPrompt: string | null = null
  private scannerActive = false
  private autosaveTimer = 0
  private frameCount = 0

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.className = 'scene'
    container.appendChild(this.renderer.domElement)

    this.input = new InputManager(this.renderer.domElement)
    this.rig = new OrbitCameraRig(this.collision)
    this.sky = new SkySystem(this.scene)
    this.anchors = buildDistrict(this.scene, this.collision)
    this.water = new Water(this.scene)

    this.player = new PlayerController(this.collision, this.scene)
    this.player.teleport(this.anchors.playerStart)

    this.vehicle = new CitySpark(this.collision, this.scene)
    this.vehicle.place(this.anchors.vehicleStart.position, this.anchors.vehicleStart.heading)

    this.hud = new HUD(container, this.input, {
      onSettingsChanged: (settings) => this.applySettings(settings),
      onSave: () => this.save(true),
      onReset: () => this.resetProgress(),
      onOnboardingDone: () => this.save(false),
    })

    this.boarding = new BoardingController(
      this.player,
      this.vehicle,
      this.rig,
      this.collision,
      (message) => this.hud.toast(message),
    )

    this.collectibles = new CollectionSystem(this.scene, this.anchors.collectibles, (_id, reward) => {
      this.hud.toast(`Stadtfunken gesichert - ${reward} Tatz-Taler`)
      this.refreshWallet()
    })

    this.project = new HarborProject(this.scene, this.collision, this.anchors.projectTerrace)
    this.fountain = new Fountain(this.scene, this.collision, this.anchors.fountain)
    this.puzzle = new ScannerPuzzle(
      this.scene,
      this.collision,
      this.anchors.puzzleValves,
      this.anchors.puzzleBeamTarget,
      () => this.onPuzzleSolved(),
      (message) => this.hud.toast(message),
    )

    this.npcs = new AmbientNPCSystem(this.scene, this.anchors.npcRoutes, this.anchors.npcSeats, [
      this.anchors.projectTerrace.clone().add(new THREE.Vector3(-4, 0.37, 1.4)),
      this.anchors.projectTerrace.clone().add(new THREE.Vector3(4, 0.37, 1.4)),
    ])

    this.mission = new MissionFlow((_step, info) => {
      this.hud.setMission(info.title, info.objective, info.hint)
      this.hud.toast(info.objective)
    })

    // Tor des vierten Wegs: geschlossen, bis das Raetsel geloest ist.
    this.gate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), mat(COLORS.coral))
    this.gate.position.copy(this.anchors.transitGate).add(new THREE.Vector3(0, 1.2, 0))
    this.gate.castShadow = true
    this.scene.add(this.gate)
    this.gateCollider = this.collision.addStatic(
      new THREE.Box3().setFromObject(this.gate),
      'gate',
    )

    this.impulseMarker = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0.85 }),
    )
    this.impulseMarker.position.copy(this.anchors.garageImpulse)
    this.scene.add(this.impulseMarker)

    for (const [position, color] of [
      [this.anchors.stationCityProject, COLORS.gold],
      [this.anchors.stationMakerExchange, COLORS.coral],
    ] as [THREE.Vector3, string][]) {
      const station = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.9), mat(color))
      station.position.copy(position).add(new THREE.Vector3(0, 0.95, 0))
      station.castShadow = true
      this.scene.add(station)
      this.collision.addStatic(new THREE.Box3().setFromObject(station), 'station')
      this.stationMeshes.push(station)
    }

    inputContext.onChange(() => this.hud.setContext(inputContext.hudState))

    this.load()
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.refreshWallet()
    this.hud.setMission(this.mission.info.title, this.mission.info.objective, this.mission.info.hint)
  }

  start(): void {
    this.exposeQaHook()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  /**
   * Schmale QA-Schnittstelle. Sie steuert nur, was auch ein Spieler ausloesen
   * kann, und macht den Zustand lesbar - damit der Abnahmedurchlauf
   * automatisiert nachweisbar ist statt nur behauptet.
   */
  private exposeQaHook(): void {
    ;(window as unknown as Record<string, unknown>).fynnoxQa = {
      teleport: (x: number, y: number, z: number, heading = 0) =>
        this.player.teleport(new THREE.Vector3(x, y, z), heading),
      placeVehicle: (x: number, y: number, z: number, heading: number) =>
        this.vehicle.place(new THREE.Vector3(x, y, z), heading),
      press: (button: string) => this.input.press(button as never),
      setStick: (x: number, y: number) => this.input.setStick(x, y),
      addLook: (x: number, y: number) => this.rig.addLook(x, y),
      setCameraYaw: (yaw: number) => {
        this.rig.yaw = yaw
      },
      save: () => this.save(true),
      closeOnboarding: () => this.hud.closeOnboarding(),
      state: () => ({
        player: this.player.position.toArray(),
        grounded: this.player.grounded,
        vehicle: this.vehicle.position.toArray(),
        boarding: this.boarding.phase,
        boardingState: this.boarding.currentState,
        denial: this.boarding.lastDenial,
        context: inputContext.active,
        hud: inputContext.hudState,
        camera: this.rig.activeProfile,
        cameraPosition: this.rig.camera.position.toArray(),
        cameraYaw: this.rig.yaw,
        gateOpen: !this.gateCollider.enabled,
        puzzleSolved: this.puzzle.isSolved,
        puzzleProgress: this.puzzle.sequenceProgress,
        fountain: this.fountain.isActive,
        projectStage: this.project.stage,
        projectState: this.project.stateId,
        wallet: this.collectibles.tatzTaler,
        sparks: this.collectibles.collectedSparks,
        mission: this.mission.step,
        scanner: this.scannerActive,
        prompt: this.lastPrompt,
        frames: this.frameCount,
        mantling: this.player.isMantling,
        controlEnabled: this.player.controlEnabled,
      }),
    }
  }

  private frame(): void {
    const delta = Math.min(this.clock.getDelta(), 0.05)
    const elapsed = this.clock.elapsedTime
    this.frameCount += 1

    this.input.poll()
    this.handleMenus()

    const menuOpen = this.hud.isPauseOpen || this.hud.isOnboardingOpen
    if (!menuOpen) {
      this.rig.addLook(this.input.look.x, this.input.look.y)
      this.updateGameplay(delta)
    }

    // Die Welt laeuft immer weiter - auch im Menue, im Dialog und beim Boarding.
    this.water.update(elapsed)
    this.sky.update(delta, this.player.position)
    this.npcs.update(delta, this.player.position)
    this.puzzle.update(delta)
    this.fountain.update(delta)
    this.vehicle.update(delta)

    const seated = this.boarding.phase === 'seated'
    const focus = seated ? this.vehicle.position : this.player.position
    this.rig.update(delta, focus, seated ? 1.6 : 1.25)

    this.hud.drawMinimap(focus.x, focus.z, seated ? this.vehicle.heading : this.player.heading, this.markers())
    this.hud.setDebug([
      `ctx: ${inputContext.active}  hud: ${inputContext.hudState}`,
      `boarding: ${this.boarding.phase} / ${this.boarding.currentState}`,
      `cam: ${this.rig.activeProfile}  projekt: ${this.project.stateId}`,
      `manifest v${manifestSummary.packageVersions.join(' + v')}`,
    ])

    this.autosaveTimer += delta
    if (this.autosaveTimer > 20) {
      this.autosaveTimer = 0
      this.save(false)
    }

    this.renderer.render(this.scene, this.rig.camera)
    this.input.endFrame()
  }

  private handleMenus(): void {
    if (this.input.consume('pause')) {
      if (this.hud.isOnboardingOpen) return
      this.hud.togglePause()
    }
    const menuOpen = this.hud.isPauseOpen || this.hud.isOnboardingOpen
    if (menuOpen && !inputContext.is('ctx_menu')) {
      this.contextBeforeMenu = inputContext.active
      inputContext.switchTo('ctx_menu')
    } else if (!menuOpen && inputContext.is('ctx_menu')) {
      inputContext.switchTo(this.contextBeforeMenu)
    }
  }

  private updateGameplay(delta: number): void {
    this.boarding.update(delta)

    if (this.boarding.phase === 'seated') {
      this.driveVehicle(delta)
    } else if (this.boarding.phase === 'on_foot') {
      this.player.update(delta, this.input, this.rig)
      this.vehicle.settle(delta)
      this.handleScanner()
      this.handleInteractions()
      // Ohne Fahrzeug in Reichweite passiert nichts - keine Fehlermeldung noetig.
      if (this.input.consume('enterExit')) this.boarding.requestEnter()
    }

    this.collectibles.update(delta, this.player.position, () =>
      this.player.playAction('fox_pickup', 0.5),
    )
    this.impulseMarker.rotation.y += delta * 1.2
    this.impulseMarker.visible = this.mission.step === 'briefing'

    this.updateMission()
    this.updateVehiclePrompt()
  }

  private driveVehicle(delta: number): void {
    const assist = this.hud.settings.driveAssist
    const throttle = this.input.move.y
    const steer = this.input.move.x * (assist ? 0.75 : 1)
    this.vehicle.drive(delta, throttle, steer, this.input.isHeld('brake'))
    this.rig.setDistance(7.5 + Math.min(3, Math.abs(this.vehicle.speed) * 0.25))
    if (this.input.consume('enterExit')) this.boarding.requestExit()
  }

  private handleScanner(): void {
    if (!this.input.consume('scanner')) return
    this.scannerActive = !this.scannerActive
    this.puzzle.setScannerVisible(this.scannerActive)
    inputContext.switchTo(this.scannerActive ? 'ctx_scanner' : 'ctx_on_foot')
    this.player.playAction('fox_scan', 0.5)
    this.sky.setScannerMode(this.scannerActive)
    this.hud.toast(this.scannerActive ? 'PawLink aktiv - Signale werden sichtbar.' : 'PawLink aus.')
  }

  private interactables(): Interactable[] {
    const list: Interactable[] = []

    if (this.mission.step === 'briefing') {
      list.push({
        action: 'action_scan',
        label: 'Impuls scannen',
        position: this.anchors.garageImpulse,
        range: 2.6,
        requiresScanner: true,
        run: () => {
          this.player.playAction('fox_scan', 0.7)
          this.hud.toast('Alter Stadtfunken-Impuls empfangen - Spur fuehrt zum Hafen.')
          this.mission.advanceTo('travel')
        },
      })
    }

    const valve = this.puzzle.valveInRange(this.player.position)
    if (valve) {
      const index = Number(valve.split('_')[1]) - 1
      list.push({
        action: 'action_use',
        label: `Ventil ${index + 1} stellen`,
        position: this.anchors.puzzleValves[index],
        range: 2.0,
        run: () => {
          this.player.playAction('fox_press_button', 0.5)
          this.puzzle.interact(valve)
        },
      })
    }

    list.push({
      action: 'action_inventory',
      label: this.project.isComplete
        ? 'Hafenterrasse fertig'
        : `Hafenterrasse ausbauen (${PROJECT_STAGE_COST} Taler)`,
      position: this.anchors.stationCityProject,
      range: 2.6,
      run: () => this.redeemProjectStage(),
    })

    list.push({
      action: 'action_mission',
      label: 'Sammlung ansehen',
      position: this.anchors.stationMakerExchange,
      range: 2.6,
      run: () => {
        this.player.playAction('fox_wave', 0.6)
        this.hud.toast(
          `Sammlung: ${this.collectibles.collectedSparks} von ${this.collectibles.totalSparks} Stadtfunken, ${this.collectibles.tatzTaler} Tatz-Taler.`,
        )
      },
    })

    return list
  }

  private handleInteractions(): void {
    let nearest: Interactable | null = null
    let nearestDistance = Infinity
    for (const item of this.interactables()) {
      if (item.requiresScanner && !this.scannerActive) continue
      const distance = item.position.distanceTo(this.player.position)
      if (distance < item.range && distance < nearestDistance) {
        nearest = item
        nearestDistance = distance
      }
    }

    if (!nearest) {
      this.lastPrompt = null
      this.hud.setPrompt(null)
      this.input.consume('interact')
      return
    }
    this.lastPrompt = nearest.label
    this.hud.setPrompt(nearest.action, nearest.label, 'E')
    if (this.input.consume('interact')) nearest.run()
  }

  private redeemProjectStage(): void {
    if (this.project.isComplete) {
      this.hud.toast('Die Hafenterrasse ist bereits fertig - der Zustand bleibt erhalten.')
      return
    }
    if (!this.collectibles.spend(PROJECT_STAGE_COST)) {
      this.hud.toast(
        `Noch ${PROJECT_STAGE_COST - this.collectibles.tatzTaler} Tatz-Taler noetig. Nichts geht verloren.`,
      )
      return
    }
    this.player.playAction('fox_press_button', 0.6)
    this.project.advance()
    this.npcs.setProjectActivity(this.project.activityEnabled)
    this.refreshWallet()
    this.hud.toast(`Stadtprojekt: ${this.project.stateId} (${this.project.stage}/${this.project.stageCount - 1})`)
    this.save(false)
  }

  private onPuzzleSolved(): void {
    this.fountain.setActive(true)
    this.openGate()
    this.mission.advanceTo('payoff')
    this.save(false)
  }

  private openGate(): void {
    this.gate.visible = false
    this.gateCollider.enabled = false
    this.collision.markDirty()
  }

  private updateMission(): void {
    const step = this.mission.step
    if (step === 'travel') {
      const worksDistance = this.player.position.distanceTo(this.anchors.puzzleValves[0])
      if (worksDistance < 12) this.mission.advanceTo('puzzle')
    } else if (step === 'payoff') {
      if (this.player.position.distanceTo(this.anchors.fountain) < 7) {
        this.mission.advanceTo('done')
        this.hud.toast('Der Hafenbrunnen laeuft wieder. Die Stadt hat sich sichtbar veraendert.')
        this.save(true)
      }
    }
  }

  private updateVehiclePrompt(): void {
    const seated = this.boarding.phase === 'seated'
    this.hud.setVehiclePrompt(this.boarding.canRequestEnter(), seated)
  }

  private markers(): MapMarker[] {
    const markers: MapMarker[] = [
      { x: this.vehicle.position.x, z: this.vehicle.position.z, color: '#F2B441', shape: 'square' },
      {
        x: this.anchors.stationCityProject.x,
        z: this.anchors.stationCityProject.z,
        color: '#F5C76D',
        shape: 'triangle',
      },
    ]
    const step = this.mission.step
    if (step === 'briefing') {
      markers.push({
        x: this.anchors.garageImpulse.x,
        z: this.anchors.garageImpulse.z,
        color: '#18BFD0',
        shape: 'dot',
      })
    } else if (step === 'travel' || step === 'puzzle') {
      markers.push({
        x: this.anchors.puzzleValves[0].x,
        z: this.anchors.puzzleValves[0].z,
        color: '#18BFD0',
        shape: 'dot',
      })
    } else if (step === 'payoff') {
      markers.push({
        x: this.anchors.fountain.x,
        z: this.anchors.fountain.z,
        color: '#18BFD0',
        shape: 'dot',
      })
    }
    return markers
  }

  private applySettings(settings: Settings): void {
    this.rig.reducedMotion = settings.reducedMotion
    this.rig.sensitivity = settings.sensitivity
  }

  private refreshWallet(): void {
    this.hud.setWallet(
      this.collectibles.tatzTaler,
      this.collectibles.collectedSparks,
      this.collectibles.totalSparks,
    )
  }

  private save(explicit: boolean): void {
    const data: SaveData = {
      schema: 1,
      savedAt: new Date().toISOString(),
      player_state: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        heading: this.player.heading,
      },
      vehicle_id: this.boarding.phase === 'seated' ? this.vehicle.id : null,
      seat_id: this.boarding.phase === 'seated' ? 'seat_driver' : null,
      vehicle_transform: {
        x: this.vehicle.position.x,
        y: this.vehicle.position.y,
        z: this.vehicle.position.z,
        heading: this.vehicle.heading,
      },
      door_or_hatch_state: this.vehicle.doorState,
      active_input_context: inputContext.is('ctx_menu') ? this.contextBeforeMenu : inputContext.active,
      camera_profile: this.rig.activeProfile,
      mission_step: this.mission.step,
      puzzle_solved: this.puzzle.isSolved,
      fountain_active: this.fountain.isActive,
      project_stage: this.project.stage,
      wallet: this.collectibles.tatzTaler,
      collectibles: this.collectibles.states,
      time_of_day: this.sky.timeOfDay,
      settings: this.hud.settings,
      onboarding_done: true,
    }
    const ok = SaveGame.save(data)
    if (explicit) this.hud.toast(ok ? 'Spielstand gespeichert.' : 'Speichern fehlgeschlagen.')
  }

  private load(): void {
    const data = SaveGame.load()
    if (!data) {
      this.hud.applyLoadedSettings({ ...DEFAULT_SETTINGS })
      this.hud.showOnboarding()
      this.npcs.setProjectActivity(this.project.activityEnabled)
      return
    }

    this.hud.applyLoadedSettings(data.settings)
    this.player.teleport(
      new THREE.Vector3(data.player_state.x, data.player_state.y, data.player_state.z),
      data.player_state.heading,
    )
    this.vehicle.place(
      new THREE.Vector3(data.vehicle_transform.x, data.vehicle_transform.y, data.vehicle_transform.z),
      data.vehicle_transform.heading,
    )
    this.collectibles.restore(data.collectibles, data.wallet)
    this.project.setStage(data.project_stage)
    this.npcs.setProjectActivity(this.project.activityEnabled)
    this.puzzle.restore(data.puzzle_solved)
    this.fountain.setActive(data.fountain_active)
    if (data.puzzle_solved) this.openGate()
    this.sky.setPhase(data.time_of_day)
    this.mission.restore(data.mission_step as MissionStep)
    // Der Spieler startet nach dem Laden immer zu Fuss: ein halb geladener
    // Fahrzeugkontext waere kein atomarer Zustand.
    inputContext.switchTo('ctx_on_foot')
    this.hud.setContext('hud_exploration')
    if (!data.onboarding_done) this.hud.showOnboarding()
  }

  private resetProgress(): void {
    SaveGame.clear()
    window.location.reload()
  }

  private resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.renderer.setSize(width, height, false)
    this.rig.resize(width, height)
  }
}
