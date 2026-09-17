/**
 * Browserstart fuer Suiten und Aufnahmen.
 *
 * Ohne Angabe rendert Headless-Chromium in SwiftShader, also auf der CPU. Seit
 * der grossen Stadt (17.09.2026) kostet dort ein einziges Bild rund 12 s -
 * `controls.mjs` braucht damit Stunden, `acceptance.mjs` einen halben Tag.
 * Mit `FYNNOX_GPU=1` laeuft derselbe Headless-Browser ueber ANGLE auf der
 * echten Grafikkarte, gemessen rund 100 ms je Bild.
 *
 * Die Suiten warten in Bildern, nicht in Millisekunden - an dem, was sie
 * pruefen, aendert die Geschwindigkeit nichts. Nur Shaderfehler, die allein in
 * SwiftShader auftreten, sieht man so nicht mehr; fuer die Endabnahme bleibt
 * der Softwarerenderer deshalb der Standard.
 */
export function launchOptions() {
  if (!process.env.FYNNOX_GPU) return {}
  return { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }
}
