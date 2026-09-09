# Raumwirkung und Blickrichtung — Session-Prompt für Claude Code
## Prompt unten kopieren und als erste Nachricht in einer neuen Claude-Code-Sitzung einfügen
---

```
Du arbeitest am Projekt Fynnox City (C:\Users\admin\Desktop\Fynnox City\fynnox-city).
Lies ZUERST die CLAUDE.md im Projektstamm — dort stehen Architektur, verbindliche
Verträge, Paketmaße und Arbeitsweise.

## Aufgabe: Die drei Nutzermeldungen vom 09.09.2026

### Worum geht es?

Der Nutzer hat die Live-Version gespielt und drei Dinge gemeldet:

1. "Die Welt ist weit weg von dem 2,5D, 3D" — sie wirkt flach und kulissenhaft.
2. "Ich sehe nicht, wo ich hinlaufe. Wenn ich mich umdrehe, sehe ich nicht, was
   vor mir ist."
3. "Sie wirkt unglaublich klein und nicht wie auf den Bildern."

Punkt 2 ist ein Steuerungsfehler und stört beim Spielen — er geht vor. Punkt 1
und 3 haben dieselbe Wurzel: die gesamte begehbare Welt liegt auf einer einzigen
Ebene bei y = 0 und misst 160 × 94 m.

**Wichtig zu Punkt 2:** Das ist die Wiederholung einer Meldung vom 19.08.2026.
Damals wurde die Ursache in der Zeigersteuerung gesucht und mit Pointer Lock
beantwortet (Commit 792ae07), und eine nachführende Kamera wurde ausdrücklich
verworfen — mit der Begründung, sie könne bei kamerarelativer Steuerung nicht
funktionieren, weil ein Nachführen die Figur mitdreht. **Diese Begründung gilt
nur für sofortiges, ungedämpftes Nachführen.** Verwirf die Idee nicht ein
zweites Mal, ohne eine gedämpfte Variante geprüft zu haben.

### Was BEREITS EXISTIERT (nicht neu bauen!)

Lies diese Dateien VOLLSTÄNDIG, bevor du etwas änderst:

1. `src/camera/OrbitCameraRig.ts` — Third-Person-Kamera (208 Zeilen, VOLLSTÄNDIG)
   - `yaw` (Zeile ~35): wird ausschließlich durch `addLook()` verändert, nie
     durch Bewegung. Genau hier fehlt die Nachführung.
   - `addLook()` (Zeile ~115): Zeigereingabe → yaw/pitch.
   - `getPlanarBasis()` (Zeile ~124): liefert forward/right aus dem yaw. Das ist
     die Quelle der Bewegungsrichtung — die Rückkopplung, um die es geht.
   - `update()` (Zeile ~132): Kollisionsausweichen, Blend, Dämpfung.
   - Integration: `Game.update()` ruft sie je Bild; `PlayerController.update()`
     bekommt das Rig hereingereicht.

2. `src/player/PlayerController.ts` — Bewegung und Ausrichtung (225 Zeilen, VOLLSTÄNDIG)
   - `update()` (Zeile ~83): `rig.getPlanarBasis()` → `wish` aus Stickeingabe.
   - `applyTransform()` (Zeile ~144): dreht die Figur gedämpft in die
     Bewegungsrichtung (`Math.atan2(velocity.x, velocity.z)`, Faktor delta*12).
     Die Figur führt also nach, die Kamera nicht.
   - `heading` (Zeile ~20): aktuelle Blickrichtung der Figur.

3. `src/world/District.ts` — Weltaufbau (2751 Zeilen, VOLLSTÄNDIG für den Slice)
   - `buildTerrain()` (Zeile ~553): die gesamte Landfläche ist EINE Box,
     `x: 0, y: -4, z: -13, w: 160, h: 4, d: 94`. Oberkante überall exakt y = 0.
   - `buildingHeight()` (Zeile ~98): Erdgeschoss 3,2 m (Laden 4,0 m) plus
     Obergeschosse à 3,2 m. Alle Blöcke im Slice haben `floors: 2` → 7,2 bis
     8,0 m. Deshalb ist die Dachlinie über die ganze Stadt fast waagerecht.
   - `buildBackdrop()` (Zeile ~403) mit `BAND` (Zeile ~430): die Kulisse in vier
     Tiefenstufen. NICHT begehbar und NICHT anfassen — frisch abgenommen.
   - `PARKOUR_ENTRY` (in `buildStreetDressing`): Sperrzone der Kletterlinie.

4. `src/core/CollisionWorld.ts` — AABB-Kollision (226 Zeilen, VOLLSTÄNDIG)
   - `moveAndSlide()` (Zeile ~156): `stepHeight = 0.35`. Stufen bis 35 cm werden
     ohne Sprung genommen — das begrenzt, wie steil eine Rampe sein darf.
   - Höhenstaffelung geht ausschließlich über `WorldBuilder`-Boxen; es gibt kein
     Heightfield und keine schrägen Kollisionsflächen.

5. `src/world/WorldBuilder.ts` — Batching (VOLLSTÄNDIG)
   - `box()`, `stairs({ open })`, `railing()`, `shape()`, `collisionAdd()`.
   - `finish()` verschmilzt pro Material. Neue Weltteile IMMER hierüber.

6. `controls.mjs` — Abnahme der Wahrnehmung (20 Prüfungen, VOLLSTÄNDIG)
   - `walk()` (Zeile ~65): teleportiert, setzt Kamerayaw auf 0, hält den Stick
     22 Bilder (≈1,1 s Spielzeit) und misst die Strecke.
   - Prüft u. a. "Rueckwaerts laeuft auf die Kamera zu" (dz > 1.5).
     **Eine Kameranachführung verändert genau dieses Messergebnis.** Siehe
     Gap 1 — das ist der heikelste Punkt der ganzen Aufgabe.

7. `acceptance.mjs` — Hauptabnahme (41 Prüfungen, VOLLSTÄNDIG)
   - Budgets stehen in Bildern, nicht in Millisekunden. Ein voller Lauf dauert
     auf dieser Maschine rund 40 Minuten.

8. `lessons.md` — gesammelte Lehren, zuletzt vom 09.09.2026.

### Was FEHLT (deine Aufgabe — drei Lücken)

**Lücke 1: Die Kamera führt der Laufrichtung nicht nach**
- Der yaw ändert sich ausschließlich über `addLook()`. Läuft der Spieler
  rückwärts oder seitlich, bleibt die Kamera stehen und zeigt nicht dorthin,
  wo die Figur hingeht.
- Einstieg: `OrbitCameraRig.update()` (Zeile ~132) und `PlayerController.update()`
  (Zeile ~83), wo `getPlanarBasis()` gerufen wird.
- Ansatz: gedämpfte Nachführung des yaw an `PlayerController.heading`, die erst
  nach anhaltender Bewegung einsetzt und aussetzt, solange der Spieler selbst
  dreht. Der Dämpfungsfaktor muss deutlich unter dem der Figur (delta*12) liegen,
  sonst entsteht die Rückkopplung, wegen der die Idee 2026-08 verworfen wurde.
- **Vorher klären, in welcher Situation der Nutzer es erlebt** — beim
  Rückwärtslaufen, beim seitlichen Laufen oder nach einer Drehung im Stand. Die
  Antwort entscheidet, ob überhaupt der yaw nachgeführt werden muss oder ob eine
  andere Lösung besser passt (etwa Schulterversatz oder größerer Abstand).
- **Achtung `controls.mjs`:** Die vier Richtungsprüfungen messen 22 Bilder lang.
  Setzt die Nachführung in diesem Fenster ein, brechen sie. Die Prüfungen dürfen
  NICHT abgeschwächt werden — sie haben 2026-08 drei echte Vorzeichenfehler
  gefunden. Stattdessen einen QA-Schalter ergänzen (analog `setDetail`), mit dem
  die Suite die Nachführung abschaltet, und eine EIGENE neue Prüfung schreiben,
  die die Nachführung nachweist.

**Lücke 2: Das Gelände ist eine einzige Ebene**
- `buildTerrain()` legt eine Box mit Oberkante y = 0 über die ganze Stadt. Es
  gibt keinen einzigen Höhenunterschied im begehbaren Bereich; alle Bauwerke
  stehen auf demselben Niveau und sind 7,2 bis 8,0 m hoch. Das ist die Ursache
  des Eindrucks "flach statt 3D".
- Einstieg: `buildTerrain()` (Zeile ~553), `buildRoads()` (Zeile ~564).
- Ansatz: mindestens zwei zusätzliche Niveaus einziehen — etwa eine erhöhte
  Terrasse zur Hafenseite und ein tiefer liegender Platz —, verbunden über
  Treppen (`stairs({ open })` plus `stairDressing()`) und Rampen. Jede Rampe
  muss mit `stepHeight = 0.35` begehbar bleiben. Die Bauwerkshöhen dabei
  staffeln: `floors` variieren statt überall 2.

**Lücke 3: Die begehbare Welt endet bei 160 × 94 m**
- Das ist die Ursache von "unglaublich klein". Die 2026-09 gebaute Kulisse füllt
  zwar den Horizont, ist aber ausdrücklich nicht betretbar — sie löst Weite im
  Bild, nicht im Gehen.
- Einstieg: `buildTerrain()` (Zeile ~553) und `BAND.town` in `buildBackdrop()`
  (Zeile ~430) — dort endet die Stadt und beginnt die Kulisse.
- Ansatz: den vordersten Streifen der Kulissenstadt in begehbare Bebauung
  überführen und das Gelände entsprechend erweitern. Das Verhältnis von
  begehbarer Fläche zu Kulisse verschiebt sich damit, ohne dass die Staffelung
  bricht. Beachte: die Welt soll später Skateboard, Rennen, Fußball, Basketball
  und Snowboard tragen — Fläche ist dafür Voraussetzung, nicht Zierde.

### Randbedingungen
- Die Manifeste unter `src/contracts/` bleiben **unverändert**. IDs werden nie
  umbenannt. `validateManifests()` bricht den Start ab, wenn Einheiten oder
  Zustandsketten abweichen.
- Paketmaße gelten: 1 Einheit = 1 m, Snap-Grid 0,5 m, Fassadenraster 2,5 m,
  Geschoss 3,2 m (Laden 4,0 m), Fahrspur 3,0 m, Gehweg 2,0 m, Bordstein 0,15 m,
  Stufe 0,16/0,30 m, Geländer 1,1 m, Kletterkante 0,8–1,4 m, Parkour-Lücke
  max. 2,0 m.
- Statische Geometrie ausschließlich über `WorldBuilder`, nie als Einzelmesh.
- Das Bundle liegt bei 845 kB roh / 227 kB gzip. Grenze: 900 kB roh.
- Barrierefreiheit ist P0: jeder neue Höhenunterschied braucht neben Treppe oder
  Sprung einen barrierearmen Weg (Rampe oder Aufzug), wie ihn die Parkourroute
  mit ihrem Treppenturm bereits hat.
- Ein voller `acceptance.mjs`-Lauf dauert rund 40 Minuten. Während eines Laufs
  **niemals** `npm run build` aufrufen — das tauscht `dist/` unter dem laufenden
  Server aus.
- Wartezeiten in Abnahmen werden in Bildern gemessen, nie in Millisekunden.

### Arbeitsweise
1. ALLE genannten Dateien vollständig lesen, bevor du planst.
2. Für Lücke 1 zuerst klären, in welcher Situation der Fehler auftritt — messen,
   nicht raten. Erst danach bauen.
3. Die drei Lücken als voneinander unabhängige Änderungen planen.
4. Eine Lücke nach der anderen umsetzen, jede mit:
   - Codeänderung
   - `npm run build` (enthält `tsc --noEmit`)
   - gerahmte Aufnahmen über `sh run-suite.sh tools/shot.mjs views/<datei>.json`
     aus **mehreren** Blickrichtungen, nicht nur aus der, an der du baust
5. Nach jeder Lücke die betroffene Suite laufen lassen, am Ende `acceptance.mjs`.
6. Ein Commit je Lücke, Nachricht auf Deutsch, mit Ursache statt nur Fix.

### Nachweise
- `npm run build`
- `sh run-suite.sh controls.mjs` — muss 20/20 bleiben (Lücke 1)
- `sh run-suite.sh acceptance.mjs` — muss 41/41 bleiben (alle Lücken)
- `sh run-suite.sh tools/shot.mjs views/horizont.json` — Kulisse unverändert
- `git diff --stat src/contracts/` — muss leer sein
- `ls -la dist/assets/*.js` — unter 900 kB

### Was du NICHT tun darfst
- Die Prüfungen in `controls.mjs` abschwächen oder ihre Schwellwerte anpassen,
  damit eine Kameranachführung durchgeht. Sie haben drei echte Vorzeichenfehler
  gefunden. Neue Prüfung schreiben statt alte biegen.
- Die Kulisse (`buildBackdrop`, `buildBackdropTown`, `BAND`) umbauen. Sie ist
  frisch abgenommen; sie wird höchstens dort zurückgenommen, wo begehbare Stadt
  an ihre Stelle tritt.
- Die Sperrzone `PARKOUR_ENTRY` bebauen oder mit Gelände überformen.
- Mira, Boro und Tavi in `AmbientNPCSystem` verändern — sie stammen aus
  12_Charakter_Turnarounds und sind gesperrte Designvorgaben.
- Die nachführende Kamera erneut verwerfen, ohne eine gedämpfte Variante
  gemessen zu haben. Die Meldung kam zweimal.
- Manifest-IDs umbenennen oder `src/contracts/` anfassen.
- Behaupten, etwas funktioniere, ohne Playwright-Nachweis. Verhalten wird
  gemessen, nicht erklärt.
```

**Gespeichert unter:** `.planning/session-prompts/raumwirkung-und-blickrichtung-prompt.md`
