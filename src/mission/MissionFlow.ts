export type MissionStep = 'briefing' | 'travel' | 'puzzle' | 'payoff' | 'done'

interface StepInfo {
  title: string
  objective: string
  hint: string
}

/**
 * Vertical-Slice-Mission "Der vierte Weg" aus
 * SPIELVISION_OPEN_CITY_ABENTEUER_v1_6.md, auf die Slice-Laenge gekuerzt.
 * Der Anreiseweg bleibt frei: Strasse, Dachroute oder City Spark.
 */
const STEPS: Record<MissionStep, StepInfo> = {
  briefing: {
    title: 'Der vierte Weg',
    objective: 'Stadtfunken-Impuls in der Foxtail Garage scannen',
    hint: 'PawLink oeffnen und den Impuls an der Ladestation lesen.',
  },
  travel: {
    title: 'Der vierte Weg',
    objective: 'Transitwerk am Hafen erreichen',
    hint: 'Drei Wege fuehren hin: Strasse, Dachroute oder City Spark.',
  },
  puzzle: {
    title: 'Der vierte Weg',
    objective: 'Beide Ventile in der richtigen Reihenfolge stellen',
    hint: 'Der PawLink-Scan zeigt, welches Ventil zuerst dran ist.',
  },
  payoff: {
    title: 'Der vierte Weg',
    objective: 'Den reaktivierten Hafenbrunnen ansehen',
    hint: 'Der Brunnen liegt am Platz zwischen Transitwerk und Promenade.',
  },
  done: {
    title: 'Der vierte Weg - abgeschlossen',
    objective: 'Stadt frei erkunden und die Hafenterrasse ausbauen',
    hint: 'Stadtfunken sammeln und an der Projektstation einloesen.',
  },
}

const ORDER: MissionStep[] = ['briefing', 'travel', 'puzzle', 'payoff', 'done']

export class MissionFlow {
  private stepIndex = 0

  constructor(private readonly onChanged: (step: MissionStep, info: StepInfo) => void) {}

  get step(): MissionStep {
    return ORDER[this.stepIndex]
  }

  get info(): StepInfo {
    return STEPS[this.step]
  }

  restore(step: MissionStep): void {
    const index = ORDER.indexOf(step)
    this.stepIndex = index >= 0 ? index : 0
    this.onChanged(this.step, this.info)
  }

  advanceTo(step: MissionStep): void {
    const index = ORDER.indexOf(step)
    if (index <= this.stepIndex) return
    this.stepIndex = index
    this.onChanged(this.step, this.info)
  }
}
