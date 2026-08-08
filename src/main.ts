import './ui/styles.css'
import { validateManifests, manifestSummary } from './contracts/manifests'
import { Game } from './core/Game'

const app = document.getElementById('app') as HTMLElement

const loader = document.createElement('div')
loader.className = 'loader'
loader.textContent = 'Fynnox City wird aufgebaut ...'
app.appendChild(loader)

function fail(error: unknown): void {
  loader.className = 'loader error'
  loader.textContent = `Start abgebrochen.\n\n${error instanceof Error ? error.message : String(error)}`
  console.error(error)
}

try {
  // Ohne gueltige Manifeste startet das Spiel bewusst nicht.
  validateManifests()
  console.info(
    `Fynnox City - Manifeste v${manifestSummary.packageVersions.join(' + v')}, ` +
      `${manifestSummary.animationStates} Animationszustaende, ` +
      `${manifestSummary.worldZones} Weltzonen, ${manifestSummary.vehicles} Fahrzeugvertraege.`,
  )
  const game = new Game(app)
  game.start()
  loader.remove()
} catch (error) {
  fail(error)
}
