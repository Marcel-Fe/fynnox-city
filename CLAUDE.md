# Fynnox City – Arbeitsanweisung für Claude Code

## Was das Projekt ist

Spielbarer 3D-Vertical-Slice zu **Fynnox City** (Fynnox Studios), gebaut nach dem
Produktionspaket v1.6. Three.js + Vite + TypeScript, statisch deploybar.
Live: https://marcel-fe.github.io/fynnox-city/

Das Produktionspaket selbst liegt **außerhalb** des Repos unter
`../Fynnox_City_3D_Produktionspaket_v1/` (386 MB Referenzbilder, Doku, Prompts).
Im Repo stehen nur die vier Manifeste (`src/contracts/`) und die ~0,7 MB Laufzeit-Assets.

## Verbindliche Verträge

`src/contracts/` enthält die **unveränderten** Paket-Manifeste. Regeln:

- **IDs werden nie umbenannt.** `fox_idle`, `hud_vehicle`, `action_scan`, `Z06_HARBOR`,
  `vehicle_city_spark`, `project_harbor_terrace` usw. stammen aus dem Paket.
- `validateManifests()` in `src/contracts/manifests.ts` bricht den Start ab, wenn
  Einheiten, Zustandsketten, Safe-Exit-Policy oder Sicherheitsinvarianten abweichen.
- Ablaufreihenfolgen werden **gelesen, nicht nachgebaut**: die Boarding-Kette iteriert
  über `entry_state_sequence` / `exit_state_sequence` aus dem Fahrzeugmanifest.
- Fahrzeug-Sockets kommen aus `required_sockets`; `resolveSockets()` leitet die Rollen
  entry/seat/exit per Präfix ab. Fehlt ein Socket am Modell, wirft `buildSockets()`
  beim Start – nicht später im Spiel.

## Harte Spielregeln (aus dem Paket)

- Kein negativer Kontostand, kein Verlust von Fundstücken, keine Lootboxen, kein Pay-to-win.
- Keine Waffen, kein Rammen, keine Verletzungen. Scheitern kostet Zeit, nie Fortschritt.
- **Genau ein** aktiver Input-Kontext (`InputContextMachine`), nie zwei gleichzeitig.
- **Dialog und Boarding pausieren nur die Steuerung, nie die Welt.** Wasser, NPCs,
  Verkehr und Fahrzeuge laufen sichtbar weiter.
- Safe Exit: primärer Anker → alternativer Anker → begründete Verweigerung.
  Niemals durch Geometrie teleportieren, nie ohne tragfähigen Boden aussteigen.
- Barrierefreiheit und Onboarding sind P0, keine späteren Extras.

## Maße

1 Einheit = 1 m, Snap-Grid 0,5 m, Fassadenraster 2,5 m, Geschoss 3,2 m (Laden 4,0 m),
Straßentile 12 m, Fahrspur 3,0 m, Gehweg 2,0 m, Bordstein 0,15 m, Stufe 0,16/0,30 m,
Geländer 1,1 m, Kletterkante 0,8–1,4 m, Parkour-Lücke max. 2,0 m.
+Y oben, Vorderseite nach −Z.

## Architektur

```
src/contracts/   Manifeste + Typen + Startvalidierung
src/core/        Game (Glue), CollisionWorld (AABB), Palette
src/world/       District (Graybox-Aufbau), WorldBuilder (Batching), Sky, Water
src/player/      PlayerController, FynnoxModel
src/camera/      OrbitCameraRig (Kollision, Kameraprofile, Blends)
src/vehicle/     BoardableVehicle (Vertrag), BoardingController (Ketten), Fahrzeuge
src/dialogue/    DialogueSystem, DialoguePartner
src/mission/     MissionFlow, ScannerPuzzle, HarborProject, Fountain
src/collect/     CollectionSystem
src/npc/         AmbientNPCSystem (drei Simulationsringe)
src/ui/          HUD (DOM-Overlay), styles.css
src/save/        SaveGame (atomar, localStorage)
```

Statische Geometrie wird in `WorldBuilder.finish()` pro Material zu einem Mesh
verschmolzen – neue Weltteile bitte über `WorldBuilder`, nicht als Einzelmeshes.

## Arbeitsweise

- Nach jeder Änderung `npm run build` (enthält `tsc --noEmit`).
- Verhalten wird mit Playwright nachgewiesen, nicht behauptet. Die QA-Schnittstelle
  `window.fynnoxQa` (`Game.exposeQaHook`) steuert nur, was ein Spieler auch auslösen
  kann, und macht den Zustand lesbar.
- Ein Commit pro abgeschlossener Änderung, Nachricht auf Deutsch, mit Ursache statt
  nur Fix. Push auf `main` deployt automatisch über GitHub Actions.
- Antworten auf Deutsch. Code-Bezeichner auf Englisch.
