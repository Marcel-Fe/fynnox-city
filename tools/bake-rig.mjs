/**
 * Backt die Skelettbindung fuer Fynnox.
 *
 * Das eingesetzte Modell `public/models/fynnox.glb` (Tripo-HD, 5.780 Dreiecke)
 * hat kein Rig. Das Adventure-Generat derselben Figur hat eines mit 41 Gelenken,
 * kostet aber 338.366 Dreiecke und kommt deshalb nicht ins Spiel. Dieses Werkzeug
 * nimmt nur das Skelett und die Hautgewichte daraus und uebertraegt sie auf die
 * spieltaugliche Fassung - ausserhalb der Laufzeit, in eine 24-kB-Datei.
 *
 * Aufruf (das Adventure-Modell muss dafuer voruebergehend im Projekt liegen):
 *   cp "../../Fynnox Adventure APP/fynnox-adventure/public/models/fynnox.glb" \
 *      public/models/_tmp_adventure.glb
 *   node tools/bake-rig.mjs
 *   rm public/models/_tmp_adventure.glb
 */
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 5188
const server = spawn(
  'npx',
  ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  // shell: true, weil npx unter Windows ein .cmd ist und spawn sonst EINVAL wirft.
  { stdio: 'ignore', shell: true },
)

/**
 * Unter Windows haengt der eigentliche Vite-Prozess unter der Shell. `kill()`
 * beendet nur die Shell - der Server bliebe auf dem Port stehen und der
 * naechste Lauf faende ihn belegt vor. Deshalb der ganze Prozessbaum.
 */
function stopServer() {
  if (server.killed || server.exitCode !== null) return
  // spawnSync, nicht spawn: im exit-Handler laeuft kein asynchroner Aufruf
  // mehr an, der Server bliebe sonst genau dann stehen, wenn der Lauf scheitert.
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}
process.on('exit', stopServer)

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/tools/bake-rig.html`)
      if (res.ok) return
    } catch {
      /* Server noch nicht da */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('Vite-Server nicht erreichbar')
}

await waitForServer()
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => console.log(m.text()))
page.on('pageerror', (e) => console.error('Fehler:', e.message))
await page.goto(`http://127.0.0.1:${PORT}/tools/bake-rig.html`)
await page.waitForFunction(() => window.__done === true, { timeout: 300000 })
const bake = await page.evaluate(() => window.__bake)
await browser.close()
stopServer()

writeFileSync('public/models/fynnox_rig.bin', Buffer.from(bake.bytes))
console.log(`public/models/fynnox_rig.bin geschrieben: ${bake.bytes.length} Byte`)
console.log('Knochen:', JSON.stringify(bake.bones, null, 2))
