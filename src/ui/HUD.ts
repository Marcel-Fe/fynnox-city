import { iconFileByAction, minimumBodyTextPx, minimumTouchTargetPx } from '../contracts/manifests'
import type { HudStateId, UiActionId } from '../contracts/types'
import type { InputManager, VirtualButton } from '../input/InputManager'

export interface Settings {
  reducedMotion: boolean
  largeText: boolean
  subtitles: boolean
  shapeAndColor: boolean
  driveAssist: boolean
  sensitivity: number
  /** hud_safe_area_debug: Zustandsanzeige fuer Entwicklung und QA. */
  debugOverlay: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  reducedMotion: false,
  largeText: false,
  subtitles: true,
  shapeAndColor: true,
  driveAssist: true,
  sensitivity: 1,
  debugOverlay: false,
}

export interface MapMarker {
  x: number
  z: number
  color: string
  /** Form plus Farbe - Barrierefreiheitsregel des Pakets. */
  shape: 'dot' | 'square' | 'triangle'
}

interface HudCallbacks {
  onSettingsChanged: (settings: Settings) => void
  onSave: () => void
  onReset: () => void
  onOnboardingDone: () => void
  onDialogueNext: () => void
  onDialogueSkip: () => void
}

const ONBOARDING_SCREENS = [
  { file: '01_Bewegung_Touch.svg', title: 'Bewegen und Kamera', text: 'Links ziehen bewegt Fynnox, rechts ziehen dreht die Kamera frei um ihn herum. Tastatur: WASD, Maus ziehen, Leertaste springt.' },
  { file: '02_Sammeln_Einloesen.svg', title: 'Sammeln und Einloesen', text: 'Stadtfunken einsammeln, an der Projektstation einloesen und die Hafenterrasse sichtbar wachsen sehen. Nichts geht dabei verloren.' },
  { file: '03_Fahrzeuge.svg', title: 'Fahrzeuge', text: 'Am City Spark erscheint der Einsteigen-Knopf. Der Ausstieg sucht automatisch einen freien Platz - ist keiner frei, bleibt Fynnox sitzen.' },
  { file: '04_Rivalen_Hinweis.svg', title: 'Fair bleiben', text: 'Keine Waffen, kein Rammen, kein Verlust von Taler oder Fundstuecken. Scheitern kostet nur Zeit.' },
  { file: '05_Barrierefreiheit.svg', title: 'Barrierefreiheit', text: 'Groesserer Text, Untertitel, reduzierte Bewegung, Form plus Farbe und Fahrhilfe lassen sich jederzeit im Pausemenue umschalten.' },
]

/**
 * HUD-Schicht als DOM ueber dem Canvas.
 * HUD-Zustaende, UI-Actions und Icons stammen aus dem v1.4-Manifest;
 * Onboarding und Barrierefreiheit sind P0 und nicht abschaltbar versteckt.
 */
export class HUD {
  settings: Settings = { ...DEFAULT_SETTINGS }
  private readonly root: HTMLDivElement
  private readonly missionTitle: HTMLElement
  private readonly missionObjective: HTMLElement
  private readonly missionHint: HTMLElement
  private readonly walletValue: HTMLElement
  private readonly sparkValue: HTMLElement
  private readonly prompt: HTMLElement
  private readonly promptIcon: HTMLImageElement
  private readonly promptLabel: HTMLElement
  private readonly promptKey: HTMLElement
  private readonly toasts: HTMLElement
  private readonly debug: HTMLElement
  private readonly stick: HTMLElement
  private readonly knob: HTMLElement
  private readonly buttons = new Map<string, HTMLButtonElement>()
  private readonly pause: HTMLElement
  private readonly onboarding: HTMLElement
  private readonly onboardingImage: HTMLImageElement
  private readonly onboardingTitle: HTMLElement
  private readonly onboardingText: HTMLElement
  private readonly onboardingNext: HTMLButtonElement
  private readonly dialogue: HTMLElement
  private readonly dialogueSpeaker: HTMLElement
  private readonly dialogueText: HTMLElement
  private readonly dialogueProgress: HTMLElement
  private readonly dialogueNext: HTMLButtonElement
  private readonly minimapCanvas: HTMLCanvasElement
  private readonly minimapContext: CanvasRenderingContext2D
  private onboardingIndex = 0
  private stickPointer: number | null = null
  private readonly stickCenter = { x: 0, y: 0 }

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    private readonly callbacks: HudCallbacks,
  ) {
    this.root = document.createElement('div')
    this.root.className = 'hud'
    this.root.innerHTML = `
      <div class="mission panel" data-ui>
        <h2 id="mission-title">Fynnox City</h2>
        <p id="mission-objective">Vertical Slice wird geladen.</p>
        <p class="hint" id="mission-hint"></p>
      </div>
      <div class="wallet panel" data-ui>
        <span class="chip"><img alt="" src="${this.icon('action_inventory')}"><span id="wallet-value">0</span></span>
        <span class="chip"><img alt="" src="${this.icon('action_mission')}"><span id="spark-value">0/9</span></span>
      </div>
      <div class="minimap" data-ui><canvas width="296" height="296"></canvas></div>
      <div class="corner-buttons">
        <button class="btn" data-ui data-button="pause" aria-label="Pause und Einstellungen"><img alt="" src="${this.icon('action_pause')}"></button>
        <button class="btn" data-ui data-button="map" aria-label="Karte zentrieren"><img alt="" src="${this.icon('action_map')}"></button>
      </div>
      <div class="toasts" id="toasts"></div>
      <div class="prompt panel" id="prompt" data-ui>
        <img alt="" id="prompt-icon" src="${this.icon('action_use')}">
        <span id="prompt-label">Benutzen</span>
        <span class="key" id="prompt-key">E</span>
      </div>
      <div class="dialogue panel" id="dialogue" data-ui>
        <div class="speaker"><span id="dialogue-speaker">Mira</span><small id="dialogue-progress"></small></div>
        <p id="dialogue-text"></p>
        <div class="actions">
          <button class="action" data-ui id="dialogue-skip">Beenden</button>
          <button class="action primary" data-ui id="dialogue-next">Weiter</button>
        </div>
      </div>
      <div class="stick" id="stick" data-ui><div class="knob" id="knob"></div></div>
      <div class="buttons" data-ui>
        <button class="btn wide hidden" data-button="enterExit" id="btn-enter"><img alt="" src="${this.icon('action_enter_vehicle')}"><span>Einsteigen</span></button>
        <button class="btn" data-button="scanner" aria-label="PawLink-Scanner"><img alt="" src="${this.icon('action_scan')}"></button>
        <button class="btn" data-button="interact" aria-label="Benutzen"><img alt="" src="${this.icon('action_use')}"></button>
        <button class="btn" data-button="brake" id="btn-brake" aria-label="Bremsen">Bremse</button>
        <button class="btn hidden" data-button="ascend" id="btn-ascend" aria-label="Steigen">Steigen</button>
        <button class="btn hidden" data-button="descend" id="btn-descend" aria-label="Sinken">Sinken</button>
        <button class="btn" data-button="jump" aria-label="Springen">Sprung</button>
      </div>
      <div class="state-debug" id="state-debug"></div>
      <div class="overlay" id="pause" data-ui>
        <h1>Pause</h1>
        <div class="card" id="settings-card"></div>
        <div class="card">
          <div class="row">
            <label>Spielstand<small>Speichert Position, Fahrzeug, Mission und Stadtzustand.</small></label>
            <button class="action" data-action="save">Jetzt speichern</button>
          </div>
          <div class="row">
            <label>Onboarding<small>Die fuenf Erklaerbilder erneut ansehen.</small></label>
            <button class="action" data-action="tutorial">Wiederholen</button>
          </div>
          <div class="row">
            <label>Neu beginnen<small>Loescht den Spielstand dieses Geraets.</small></label>
            <button class="action danger" data-action="reset">Zuruecksetzen</button>
          </div>
        </div>
        <button class="action primary" data-action="resume">Weiterspielen</button>
      </div>
      <div class="overlay" id="onboarding" data-ui>
        <h1 id="onboarding-title">Willkommen in Fynnox City</h1>
        <img class="screen" id="onboarding-image" alt="">
        <div class="card"><p id="onboarding-text"></p></div>
        <button class="action primary" id="onboarding-next">Weiter</button>
      </div>
    `
    parent.appendChild(this.root)

    this.missionTitle = this.byId('mission-title')
    this.missionObjective = this.byId('mission-objective')
    this.missionHint = this.byId('mission-hint')
    this.walletValue = this.byId('wallet-value')
    this.sparkValue = this.byId('spark-value')
    this.prompt = this.byId('prompt')
    this.promptIcon = this.byId('prompt-icon') as HTMLImageElement
    this.promptLabel = this.byId('prompt-label')
    this.promptKey = this.byId('prompt-key')
    this.toasts = this.byId('toasts')
    this.debug = this.byId('state-debug')
    this.stick = this.byId('stick')
    this.knob = this.byId('knob')
    this.pause = this.byId('pause')
    this.onboarding = this.byId('onboarding')
    this.onboardingImage = this.byId('onboarding-image') as HTMLImageElement
    this.onboardingTitle = this.byId('onboarding-title')
    this.onboardingText = this.byId('onboarding-text')
    this.onboardingNext = this.byId('onboarding-next') as HTMLButtonElement
    this.dialogue = this.byId('dialogue')
    this.dialogueSpeaker = this.byId('dialogue-speaker')
    this.dialogueText = this.byId('dialogue-text')
    this.dialogueProgress = this.byId('dialogue-progress')
    this.dialogueNext = this.byId('dialogue-next') as HTMLButtonElement
    this.minimapCanvas = this.root.querySelector('.minimap canvas') as HTMLCanvasElement
    this.minimapContext = this.minimapCanvas.getContext('2d') as CanvasRenderingContext2D

    this.wireButtons()
    this.wireStick()
    this.buildSettings()
    this.applySettings()
    requestAnimationFrame(() => this.enforceTokenMinimums())
    window.addEventListener('resize', () => this.enforceTokenMinimums())

    this.onboardingNext.addEventListener('click', () => this.nextOnboarding())
    this.dialogueNext.addEventListener('click', () => this.callbacks.onDialogueNext())
    ;(this.byId('dialogue-skip') as HTMLButtonElement).addEventListener('click', () =>
      this.callbacks.onDialogueSkip(),
    )
    this.pause.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action')
      if (action === 'resume') this.closePause()
      if (action === 'save') this.callbacks.onSave()
      if (action === 'reset') this.callbacks.onReset()
      if (action === 'tutorial') {
        this.closePause()
        this.showOnboarding()
      }
    })
  }

  /**
   * ONBOARDING_TOKENS.json fordert 88 px Touchziel und 30 px Fliesstext,
   * gemessen in Geraetepixeln auf 1080 px Breite. Hier wird die tatsaechliche
   * Groesse geprueft und notfalls angehoben, statt sie nur zu behaupten.
   */
  private enforceTokenMinimums(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const button = this.buttons.get('interact')
    if (button) {
      const rect = button.getBoundingClientRect()
      const smallest = Math.min(rect.width, rect.height) * dpr
      if (smallest > 0 && smallest < minimumTouchTargetPx) {
        document.documentElement.style.setProperty(
          '--touch',
          `${Math.ceil(minimumTouchTargetPx / dpr)}px`,
        )
      }
    }
    const fontSize = parseFloat(getComputedStyle(this.root).fontSize) * dpr
    if (fontSize > 0 && fontSize < minimumBodyTextPx) {
      document.documentElement.style.setProperty('--text', `${Math.ceil(minimumBodyTextPx / dpr)}px`)
    }
  }

  private byId(id: string): HTMLElement {
    return this.root.querySelector(`#${id}`) as HTMLElement
  }

  private icon(action: UiActionId): string {
    const file = iconFileByAction[action]
    return `${import.meta.env.BASE_URL}assets/icons/${file}`
  }

  private wireButtons(): void {
    for (const element of Array.from(this.root.querySelectorAll('[data-button]'))) {
      const button = element as HTMLButtonElement
      const name = button.dataset.button as VirtualButton | 'pause'
      button.setAttribute('data-ui', '')
      this.buttons.set(name, button)
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (name === 'pause') {
          this.togglePause()
          return
        }
        this.input.press(name as VirtualButton)
      })
      button.addEventListener('pointerup', (event) => {
        event.stopPropagation()
        if (name !== 'pause') this.input.release(name as VirtualButton)
      })
      button.addEventListener('pointerleave', () => {
        if (name !== 'pause') this.input.release(name as VirtualButton)
      })
    }
  }

  private wireStick(): void {
    const rectCenter = () => {
      const rect = this.stick.getBoundingClientRect()
      this.stickCenter.x = rect.left + rect.width / 2
      this.stickCenter.y = rect.top + rect.height / 2
    }
    this.stick.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      rectCenter()
      this.stickPointer = event.pointerId
      this.stick.setPointerCapture(event.pointerId)
    })
    this.stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointer) return
      const dx = (event.clientX - this.stickCenter.x) / 52
      const dy = (this.stickCenter.y - event.clientY) / 52
      const length = Math.hypot(dx, dy)
      const scale = length > 1 ? 1 / length : 1
      const x = dx * scale
      const y = dy * scale
      this.input.setStick(x, y)
      this.knob.style.transform = `translate(${x * 34}px, ${-y * 34}px)`
    })
    const end = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointer) return
      this.stickPointer = null
      this.input.setStick(0, 0)
      this.knob.style.transform = 'translate(0,0)'
    }
    this.stick.addEventListener('pointerup', end)
    this.stick.addEventListener('pointercancel', end)
  }

  private buildSettings(): void {
    const card = this.byId('settings-card')
    const toggles: { key: keyof Settings; label: string; hint: string }[] = [
      { key: 'largeText', label: 'Groesserer Text', hint: 'Erhoeht Schrift und Touchziele.' },
      { key: 'subtitles', label: 'Untertitel und Hinweise', hint: 'Blendet Systemmeldungen als Text ein.' },
      { key: 'reducedMotion', label: 'Reduzierte Bewegung', hint: 'Schaltet Kamerablenden und Animationen der UI ab.' },
      { key: 'shapeAndColor', label: 'Form plus Farbe', hint: 'Kartenmarker bekommen zusaetzlich eine eigene Form.' },
      { key: 'driveAssist', label: 'Fahrhilfe', hint: 'Begrenzt Lenkeinschlag und Hoechstgeschwindigkeit.' },
      { key: 'debugOverlay', label: 'Zustandsanzeige', hint: 'Zeigt Kontext, Boarding-Schritt und Kameraprofil.' },
    ]
    for (const toggle of toggles) {
      const row = document.createElement('div')
      row.className = 'row'
      row.innerHTML = `<label>${toggle.label}<small>${toggle.hint}</small></label>`
      const button = document.createElement('button')
      button.className = 'switch'
      button.setAttribute('role', 'switch')
      button.setAttribute('aria-label', toggle.label)
      button.setAttribute('aria-checked', String(this.settings[toggle.key]))
      button.addEventListener('click', () => {
        const next = !this.settings[toggle.key]
        ;(this.settings[toggle.key] as boolean) = next
        button.setAttribute('aria-checked', String(next))
        this.applySettings()
      })
      row.appendChild(button)
      card.appendChild(row)
    }

    const row = document.createElement('div')
    row.className = 'row'
    row.innerHTML = `<label>Kameraempfindlichkeit<small>Wirkt auf Ziehen und rechten Stick.</small></label>`
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0.4'
    slider.max = '2'
    slider.step = '0.1'
    slider.value = String(this.settings.sensitivity)
    slider.setAttribute('aria-label', 'Kameraempfindlichkeit')
    slider.addEventListener('input', () => {
      this.settings.sensitivity = Number(slider.value)
      this.applySettings()
    })
    row.appendChild(slider)
    card.appendChild(row)
  }

  applyLoadedSettings(settings: Settings): void {
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    for (const element of Array.from(this.root.querySelectorAll('.switch'))) {
      const label = element.getAttribute('aria-label')
      const key = ({
        'Groesserer Text': 'largeText',
        'Untertitel und Hinweise': 'subtitles',
        'Reduzierte Bewegung': 'reducedMotion',
        'Form plus Farbe': 'shapeAndColor',
        Fahrhilfe: 'driveAssist',
        Zustandsanzeige: 'debugOverlay',
      } as Record<string, keyof Settings>)[label ?? '']
      if (key) element.setAttribute('aria-checked', String(this.settings[key]))
    }
    const slider = this.root.querySelector('input[type="range"]') as HTMLInputElement | null
    if (slider) slider.value = String(this.settings.sensitivity)
    this.applySettings()
  }

  private applySettings(): void {
    document.documentElement.dataset.largeText = String(this.settings.largeText)
    document.documentElement.dataset.reducedMotion = String(this.settings.reducedMotion)
    document.documentElement.dataset.debug = String(this.settings.debugOverlay)
    this.callbacks.onSettingsChanged(this.settings)
  }

  setContext(state: HudStateId): void {
    const enter = this.buttons.get('enterExit')
    const brake = this.buttons.get('brake')
    const jump = this.buttons.get('jump')
    const scanner = this.buttons.get('scanner')
    if (brake) brake.classList.toggle('hidden', state !== 'hud_vehicle')
    if (jump) jump.classList.toggle('hidden', state === 'hud_vehicle')
    if (scanner) scanner.classList.toggle('hidden', state === 'hud_vehicle')
    // Die dritte Achse gehoert zum Fahrzeug, nicht zum Kontext - ausserhalb
    // von hud_vehicle verschwindet sie in jedem Fall.
    if (state !== 'hud_vehicle') this.setVerticalControls(null)
    if (enter && state === 'hud_vehicle') {
      enter.classList.remove('hidden')
      enter.querySelector('span')!.textContent = 'Aussteigen'
      ;(enter.querySelector('img') as HTMLImageElement).src = this.icon('action_exit_vehicle')
    }
  }

  setVehiclePrompt(visible: boolean, seated: boolean): void {
    const enter = this.buttons.get('enterExit')
    if (!enter) return
    enter.classList.toggle('hidden', !visible && !seated)
    enter.querySelector('span')!.textContent = seated ? 'Aussteigen' : 'Einsteigen'
    ;(enter.querySelector('img') as HTMLImageElement).src = this.icon(
      seated ? 'action_exit_vehicle' : 'action_enter_vehicle',
    )
  }

  /**
   * Kontextknoepfe fuer Hoehe und Tiefe. Nur Luft- und Tauchfahrzeuge liefern
   * Beschriftungen; alle anderen bekommen die Knoepfe gar nicht erst zu sehen.
   */
  setVerticalControls(labels: { up: string; down: string } | null): void {
    for (const [name, text] of [
      ['ascend', labels?.up],
      ['descend', labels?.down],
    ] as const) {
      const button = this.buttons.get(name)
      if (!button) continue
      button.classList.toggle('hidden', !text)
      if (text) {
        button.textContent = text
        button.setAttribute('aria-label', text)
      } else {
        this.input.release(name)
      }
    }
  }

  showDialogue(speaker: string, text: string, position: number, total: number): void {
    this.dialogue.classList.add('visible')
    this.dialogueSpeaker.textContent = speaker
    this.dialogueText.textContent = text
    this.dialogueProgress.textContent = `${position} von ${total}`
    this.dialogueNext.textContent = position === total ? 'Verstanden' : 'Weiter'
  }

  hideDialogue(): void {
    this.dialogue.classList.remove('visible')
  }

  get isDialogueOpen(): boolean {
    return this.dialogue.classList.contains('visible')
  }

  setMission(title: string, objective: string, hint: string): void {
    this.missionTitle.textContent = title
    this.missionObjective.textContent = objective
    this.missionHint.textContent = hint
  }

  setWallet(taler: number, sparks: number, total: number): void {
    this.walletValue.textContent = `${taler} Taler`
    this.sparkValue.textContent = `${sparks}/${total}`
  }

  setPrompt(action: UiActionId | null, label = '', key = 'E'): void {
    if (!action) {
      this.prompt.classList.remove('visible')
      return
    }
    this.prompt.classList.add('visible')
    this.promptIcon.src = this.icon(action)
    this.promptLabel.textContent = label
    this.promptKey.textContent = key
  }

  toast(message: string): void {
    if (!this.settings.subtitles) return
    const element = document.createElement('div')
    element.className = 'toast'
    element.textContent = message
    element.setAttribute('role', 'status')
    this.toasts.appendChild(element)
    window.setTimeout(() => element.remove(), 3400)
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove()
  }

  setDebug(lines: string[]): void {
    this.debug.textContent = lines.join('\n')
  }

  get isPauseOpen(): boolean {
    return this.pause.classList.contains('visible')
  }

  get isOnboardingOpen(): boolean {
    return this.onboarding.classList.contains('visible')
  }

  togglePause(): void {
    if (this.isPauseOpen) this.closePause()
    else this.openPause()
  }

  openPause(): void {
    this.pause.classList.add('visible')
  }

  closePause(): void {
    this.pause.classList.remove('visible')
  }

  closeOnboarding(): void {
    this.onboarding.classList.remove('visible')
  }

  showOnboarding(index = 0): void {
    this.onboardingIndex = index
    this.renderOnboarding()
    this.onboarding.classList.add('visible')
  }

  private renderOnboarding(): void {
    const screen = ONBOARDING_SCREENS[this.onboardingIndex]
    this.onboardingTitle.textContent = screen.title
    this.onboardingText.textContent = screen.text
    this.onboardingImage.src = `${import.meta.env.BASE_URL}assets/onboarding/${screen.file}`
    this.onboardingNext.textContent =
      this.onboardingIndex === ONBOARDING_SCREENS.length - 1 ? 'Losgehen' : 'Weiter'
  }

  private nextOnboarding(): void {
    if (this.onboardingIndex < ONBOARDING_SCREENS.length - 1) {
      this.onboardingIndex += 1
      this.renderOnboarding()
      return
    }
    this.onboarding.classList.remove('visible')
    this.callbacks.onOnboardingDone()
  }

  /** Minimap in Weltkoordinaten: x -60..60, z -42..52. */
  drawMinimap(playerX: number, playerZ: number, heading: number, markers: MapMarker[]): void {
    const ctx = this.minimapContext
    const size = this.minimapCanvas.width
    const toX = (x: number) => ((x + 60) / 120) * size
    const toY = (z: number) => ((z + 42) / 94) * size

    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#173B54'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#1C7E93'
    ctx.fillRect(0, toY(34), size, size - toY(34))
    ctx.fillStyle = '#3B4652'
    ctx.fillRect(0, toY(-15), size, toY(-9) - toY(-15))
    ctx.fillRect(toX(-3), toY(-12), toX(3) - toX(-3), toY(34) - toY(-12))
    ctx.fillStyle = '#C6C7BC'
    ctx.fillRect(0, toY(26), size, toY(32) - toY(26))

    ctx.fillStyle = '#F3E3C8'
    const buildings: [number, number, number, number][] = [
      [-38, -30, 16, 12],
      [4, -34, 10, 12],
      [20, -34, 10, 12],
      [32, -34, 10, 12],
      [-18, -32, 14, 10],
      [-16, 14, 10, 8],
      [4, 26, 12, 8],
    ]
    for (const [x, z, w, d] of buildings) {
      ctx.fillRect(toX(x), toY(z), (w / 120) * size, (d / 94) * size)
    }

    for (const marker of markers) {
      ctx.fillStyle = marker.color
      const mx = toX(marker.x)
      const my = toY(marker.z)
      if (!this.settings.shapeAndColor || marker.shape === 'dot') {
        ctx.beginPath()
        ctx.arc(mx, my, 7, 0, Math.PI * 2)
        ctx.fill()
      } else if (marker.shape === 'square') {
        ctx.fillRect(mx - 6, my - 6, 12, 12)
      } else {
        ctx.beginPath()
        ctx.moveTo(mx, my - 8)
        ctx.lineTo(mx + 7, my + 6)
        ctx.lineTo(mx - 7, my + 6)
        ctx.closePath()
        ctx.fill()
      }
    }

    ctx.save()
    ctx.translate(toX(playerX), toY(playerZ))
    ctx.rotate(-heading + Math.PI)
    ctx.fillStyle = '#FF7A45'
    ctx.beginPath()
    ctx.moveTo(0, -11)
    ctx.lineTo(8, 8)
    ctx.lineTo(-8, 8)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
