import './ui/styles.css'
import { validateManifests, manifestSummary } from './contracts/manifests'
import { Game } from './core/Game'
import { loadFynnoxFigure } from './player/loadFynnox'

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
  // Einziger asynchroner Schritt vor dem ersten Bild: die Spielfigur. Sie wird
  // abgewartet, damit die Stadt nicht ohne Fynnox aufgeht - der Ladepfad haelt
  // dafuer selbst einen Rueckfall bereit und wirft nicht.
  loader.textContent = 'Fynnox wird geladen ...'
  const figure = await loadFynnoxFigure()
  const game = new Game(app, figure)
  game.start()
  loader.remove()
} catch (error) {
  fail(error)
}
