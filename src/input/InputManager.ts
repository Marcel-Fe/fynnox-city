import * as THREE from 'three'

export type VirtualButton =
  | 'jump'
  | 'interact'
  | 'scanner'
  | 'pause'
  | 'map'
  | 'sprint'
  | 'enterExit'
  | 'brake'

/**
 * Touch, Tastatur und Gamepad laufen in dieselben Kanaele.
 * Touch ist die Zielplattform (mobile-first), Tastatur/Gamepad sind Fallback -
 * genau die Reihenfolge aus dem Developer Handoff.
 */
export class InputManager {
  readonly move = new THREE.Vector2()
  readonly look = new THREE.Vector2()
  private readonly held = new Set<VirtualButton>()
  private readonly pressed = new Set<VirtualButton>()
  private readonly keys = new Set<string>()
  private lookPointerId: number | null = null
  private readonly lookLast = new THREE.Vector2()
  private stickPointerId: number | null = null
  private readonly stickOrigin = new THREE.Vector2()
  private gamepadIndex: number | null = null
  /** Zeigt der HUD-Schicht, welche Eingabeart zuletzt benutzt wurde. */
  lastSource: 'touch' | 'keyboard' | 'gamepad' = 'keyboard'

  constructor(surface: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    surface.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('gamepadconnected', (event) => {
      this.gamepadIndex = (event as GamepadEvent).gamepad.index
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.held.clear()
      this.move.set(0, 0)
    })
  }

  /** Von den Touch-Buttons des HUD aufgerufen. */
  press(button: VirtualButton): void {
    this.pressed.add(button)
    this.held.add(button)
    this.lastSource = 'touch'
  }

  release(button: VirtualButton): void {
    this.held.delete(button)
  }

  isHeld(button: VirtualButton): boolean {
    return this.held.has(button)
  }

  consume(button: VirtualButton): boolean {
    if (!this.pressed.has(button)) return false
    this.pressed.delete(button)
    return true
  }

  /** Virtueller Stick des HUD (Werte -1..1). */
  setStick(x: number, y: number): void {
    this.move.set(x, y)
    this.lastSource = 'touch'
  }

  endFrame(): void {
    this.pressed.clear()
    this.look.set(0, 0)
  }

  poll(): void {
    this.pollKeyboard()
    this.pollGamepad()
  }

  private pollKeyboard(): void {
    if (this.stickPointerId !== null) return
    let x = 0
    let y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (x !== 0 || y !== 0) {
      this.move.set(x, y)
      if (this.move.length() > 1) this.move.normalize()
    } else if (this.lastSource !== 'touch' && this.lastSource !== 'gamepad') {
      this.move.set(0, 0)
    }
  }

  private pollGamepad(): void {
    if (this.gamepadIndex === null) return
    const pad = navigator.getGamepads?.()[this.gamepadIndex]
    if (!pad) return
    const dead = (value: number) => (Math.abs(value) < 0.18 ? 0 : value)
    const lx = dead(pad.axes[0] ?? 0)
    const ly = dead(pad.axes[1] ?? 0)
    if (lx !== 0 || ly !== 0) {
      this.move.set(lx, -ly)
      this.lastSource = 'gamepad'
    } else if (this.lastSource === 'gamepad') {
      this.move.set(0, 0)
    }
    const rx = dead(pad.axes[2] ?? 0)
    const ry = dead(pad.axes[3] ?? 0)
    if (rx !== 0 || ry !== 0) {
      this.look.x += rx * 14
      this.look.y += ry * 10
      this.lastSource = 'gamepad'
    }
    this.syncButton(pad.buttons[0]?.pressed ?? false, 'jump')
    this.syncButton(pad.buttons[2]?.pressed ?? false, 'interact')
    this.syncButton(pad.buttons[3]?.pressed ?? false, 'scanner')
    this.syncButton(pad.buttons[1]?.pressed ?? false, 'enterExit')
    this.syncButton(pad.buttons[10]?.pressed ?? false, 'sprint')
    this.syncButton(pad.buttons[9]?.pressed ?? false, 'pause')
  }

  private readonly padPrevious = new Map<VirtualButton, boolean>()

  private syncButton(down: boolean, button: VirtualButton): void {
    const was = this.padPrevious.get(button) ?? false
    if (down && !was) this.press(button)
    if (!down && was) this.release(button)
    if (down) this.held.add(button)
    this.padPrevious.set(button, down)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return
    this.lastSource = 'keyboard'
    this.keys.add(event.code)
    const button = KEY_MAP[event.code]
    if (button) {
      this.pressed.add(button)
      this.held.add(button)
      event.preventDefault()
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
    const button = KEY_MAP[event.code]
    if (button) this.held.delete(button)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement).closest('[data-ui]')) return
    if (event.pointerType === 'touch' && event.clientX < window.innerWidth * 0.45) {
      this.stickPointerId = event.pointerId
      this.stickOrigin.set(event.clientX, event.clientY)
      this.lastSource = 'touch'
      return
    }
    this.lookPointerId = event.pointerId
    this.lookLast.set(event.clientX, event.clientY)
    if (event.pointerType !== 'touch') this.lastSource = 'keyboard'
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.stickPointerId) {
      const dx = (event.clientX - this.stickOrigin.x) / 60
      const dy = (this.stickOrigin.y - event.clientY) / 60
      this.move.set(THREE.MathUtils.clamp(dx, -1, 1), THREE.MathUtils.clamp(dy, -1, 1))
      if (this.move.length() > 1) this.move.normalize()
      return
    }
    if (event.pointerId !== this.lookPointerId) return
    this.look.x += event.clientX - this.lookLast.x
    this.look.y += event.clientY - this.lookLast.y
    this.lookLast.set(event.clientX, event.clientY)
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.stickPointerId) {
      this.stickPointerId = null
      this.move.set(0, 0)
    }
    if (event.pointerId === this.lookPointerId) this.lookPointerId = null
  }
}

const KEY_MAP: Record<string, VirtualButton> = {
  Space: 'jump',
  KeyE: 'interact',
  KeyQ: 'scanner',
  KeyF: 'enterExit',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Escape: 'pause',
  KeyM: 'map',
  KeyB: 'brake',
}
