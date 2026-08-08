import type { HudStateId, InputContextId } from '../contracts/types'

/**
 * "Only one primary input context may be active" (Developer Handoff).
 * Der Wechsel laeuft ausschliesslich ueber diese Maschine, damit HUD,
 * Steuerung und Savegame nie auseinanderlaufen.
 */
const HUD_BY_CONTEXT: Record<InputContextId, HudStateId> = {
  ctx_on_foot: 'hud_exploration',
  ctx_vehicle: 'hud_vehicle',
  ctx_dialogue: 'hud_dialogue',
  ctx_scanner: 'hud_scanner',
  ctx_menu: 'hud_pause',
}

type Listener = (next: InputContextId, previous: InputContextId) => void

export class InputContextMachine {
  private current: InputContextId = 'ctx_on_foot'
  private readonly listeners = new Set<Listener>()

  get active(): InputContextId {
    return this.current
  }

  get hudState(): HudStateId {
    return HUD_BY_CONTEXT[this.current]
  }

  is(context: InputContextId): boolean {
    return this.current === context
  }

  switchTo(next: InputContextId): void {
    if (next === this.current) return
    const previous = this.current
    this.current = next
    for (const listener of this.listeners) listener(next, previous)
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const inputContext = new InputContextMachine()
