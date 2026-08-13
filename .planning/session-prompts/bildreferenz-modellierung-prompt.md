# Bildreferenz-Modellierung — Session-Prompt für Claude Code
## Kopiere den Prompt unten und füge ihn als erste Nachricht in eine neue Claude-Code-Session ein
---

```
Du arbeitest am Projekt Fynnox City (c:\Users\admin\Desktop\Fynnox City\fynnox-city).
Lies ZUERST die CLAUDE.md im Projektstamm — dort stehen Architektur, Verträge und Regeln.

## Aufgabe: Welt und Figuren aus den Mehransichten modellieren statt aus Kisten

### Worum geht es?
Der Vertical Slice ist spielmechanisch fertig und abgenommen, sieht aber noch wie eine
Graybox aus: Figuren, Fahrzeuge und Bauwerke bestehen aus Quadern. Das Produktionspaket
liefert zu jedem Asset einen vollständigen Turnaround (Front, Rücken, links, rechts, oben,
teils Innenraum). Diese Mehransichten existieren laut Paket ausdrücklich, "damit das Modell
vor der Erstellung eindeutig definiert ist" — sie sind also die Bauvorlage, nicht nur Deko.
Ziel: jedes sichtbare Asset aus seinem Turnaround nachbauen, mit Rundkörpern statt Kisten.

Die Bildreferenzen liegen AUSSERHALB des Repos unter
`../Fynnox_City_3D_Produktionspaket_v1/03_Bildreferenzen/`:
- `03_Fynnox_Turnaround/` — Fynnox, 5 Ansichten
- `09_Fahrzeuge/01_City_Spark_Elektrobuggy` … `05_Skyfin_Kuestenflugzeug` — je 6 Ansichten
- `10_Bauwerke_und_Infrastruktur/01…06` — Mischgebäude, Garage, Metro, Leuchtturm,
  Wassertaxi-Station, Uhrpavillon
- `11_Modulare_Bausaetze/` — Fassadenmodule
- `12_Charakter_Turnarounds/01_Mira, 02_Boro, 03_Tavi` — die drei benannten NPCs
- `24_Bluefin_Scout_U_Boot/` — U-Boot
Lies die Bilder mit dem Read-Tool, bevor du ein Asset baust. Rate keine Formen und Farben.

### Was BEREITS EXISTIERT (rund 60 % — nicht neu bauen!)

Lies diese Dateien VOLLSTÄNDIG, bevor du etwas änderst:

1. `src/core/Shapes.ts` — Formen-Baukasten (110 Zeilen, KOMPLETT)
   - `PartBatcher` (Zeile ~18): sammelt Teile einer beweglichen Gruppe und verschmilzt sie
     pro Farbe. Ein Modell aus 80 Rundkörpern kostet damit weniger Draw-Calls als eines aus
     20 Kisten. `add(geometry, color, {pos, rot, scale})`, `pair(build)` für spiegelbildliche
     Teile, `finish(parent)`.
   - `alongLocalY(base, rot, distance)` (Zeile ~60): Punkt auf der lokalen Hochachse eines
     gedrehten Teils — nötig, damit z. B. eine Ohrspitze auf der Ohrachse sitzt.
   - Primitive: `sphere, box, capsule, cylinder, cone, torus` (Zeilen ~71-77)
   - `roundedBox(w,h,d,r)` (Zeile ~85): Kiste mit gebrochenen Kanten über ExtrudeGeometry.
   - Integration: genutzt von FynnoxModel und CitySpark.

2. `src/player/FynnoxModel.ts` — Fynnox (341 Zeilen, KOMPLETT, aus dem Turnaround gebaut)
   - Proportionen aus dem Turnaround gerechnet: Beine 44 %, Rumpf 25 %, Kopf 23 %.
     Kopfbreite = Schulterbreite, sonst liest die Figur falsch.
   - Gelenkpivots `HIP_Y / SHOULDER_Y / SHOULDER_X / HEAD_Y` (Zeilen ~30-33)
   - `buildTorso/buildHead/buildArm/buildLeg/buildTail`: Vorlage für alle weiteren Figuren.
   - `update(delta, planarSpeed)` (Zeile ~230): Animationszustände aus dem Manifest.
   - Integration: `PlayerController.model`.

3. `src/vehicle/CitySpark.ts` — Buggy (398 Zeilen, KOMPLETT, aus dem Turnaround gebaut)
   - `buildBody()` (Zeile ~70): Kapselwanne, Zierstreifen, Pfotenemblem auf der Nase,
     Überrollbügel mit orangem Polster, Rammschutz, Federbeine.
   - `buildWheels()` (Zeile ~200): Ballonreifen als Torus mit Profilstollen, orange Felge,
     fester Kotflügelbogen. Vorlage für alle weiteren Fahrzeuge.
   - Sockets und `HALF` sind unverändert geblieben — Boarding und Physik hängen daran.

4. `src/core/Palette.ts` — Farben und Materiallook (130 Zeilen, KOMPLETT)
   - `COLORS` (Zeile ~9): Farben stammen aus Tokens und aus den Bildreferenzen. Neue Farben
     hier ergänzen, nicht im Modell hart schreiben.
   - `lookUniforms` (Zeile ~55): geteilte Uniforms aller Weltmaterialien.
   - `mat()` (Zeile ~95): Lambert plus injizierte Toon-Abstufung und Streiflicht,
     `customProgramCacheKey` sorgt für ein einziges Shaderprogramm.

5. `src/world/WorldBuilder.ts` — Batching statischer Geometrie (157 Zeilen, KOMPLETT)
   - `box/stairs/railing/collisionAdd/finish`. Statische Weltteile MÜSSEN hierüber laufen.
   - `box()` nimmt `y` als UNTERKANTE, nicht als Mittelpunkt.

6. `src/world/District.ts` — Weltaufbau (820 Zeilen, PARTIELL)
   - `buildFacadeBuilding()` (Zeile ~300): Wohn-/Geschäftshaus, aktuell reine Quader mit
     aufgeklebten Fensterflächen — der größte verbliebene Kistenblock.
   - `buildStreetDressing()` (Zeile ~640): Laternen, Baumbeete, Markisen, Kübel, Poller,
     Räder, Segelboote. Muster für weitere Möblierung.
   - `paveJoints()` (Zeile ~215): Plattenfugen auf großen Flächen.
   - `buildHarborDocks()` (Zeile ~560): Werftstege, noch unmöbliert.

7. `src/npc/AmbientNPCSystem.ts` — Ambient-NPCs (203 Zeilen, PARTIELL)
   - `AmbientNPCSystem` (Zeile ~32): drei Simulationsringe, Routen, Sitzplätze.
   - Die Figuren bestehen aus Quadern (Kopf als Box, Zeile ~76).
   - WICHTIG: NPCs fragen die CollisionWorld NICHT ab — sie laufen ihre Routen frei ab.

8. `src/world/Water.ts` — Wasseroberfläche (67 Zeilen, PARTIELL)
   - Sichtbare harte Streifenbildung statt weicher Welle.

### Was FEHLT (deine Aufgabe — vier Lücken schließen)

**Lücke 1: Die drei anderen Fahrzeuge sind noch Kisten**
- `src/vehicle/BluefinWaterTaxi.ts`, `src/vehicle/Skyfin.ts`, `src/vehicle/BluefinScout.ts`
  bauen ihre Rümpfe aus `BoxGeometry`. Referenzen: `09_Fahrzeuge/02_Bluefin_Wassertaxi`,
  `09_Fahrzeuge/05_Skyfin_Kuestenflugzeug`, `24_Bluefin_Scout_U_Boot`.
- Einstieg: `CitySpark.buildBody()` und `buildWheels()` als Bauvorlage, `PartBatcher`.
- Ansatz: Rümpfe aus Kapseln und skalierten Kugeln, Aufbauten gerundet, Farben aus den
  Bildern ablesen. Sockets, `HALF` und die Physikkonstanten unverändert lassen.

**Lücke 2: NPCs sind Quaderfiguren**
- `AmbientNPCSystem` (Zeile ~76) baut Kopf, Rumpf und Beine als Boxen. Neben dem
  ausmodellierten Fynnox ist das der auffälligste Bruch im Bild.
- Einstieg: `src/npc/AmbientNPCSystem.ts`, `PartBatcher` aus `src/core/Shapes.ts`,
  `FynnoxModel.buildHead/buildLeg` als Vorlage.
- Ansatz: eine schlanke, gemeinsame Tierfigur mit Farbvarianten; Mira, Boro und Tavi nach
  `12_Charakter_Turnarounds/` als benannte Varianten. Achtung auf die Instanzzahl —
  pro NPC ein `PartBatcher`-Durchlauf, Formen bewusst einfacher als bei Fynnox.

**Lücke 3: Bauwerke haben keine Gliederung**
- `buildFacadeBuilding()` (Zeile ~300) erzeugt einen Quader mit flachen Fensterflächen.
  Die Referenzen zeigen Gesimse, Erker, Balkone, Fensterrahmen, Markisen, Dachaufbauten,
  abgerundete Gebäudeecken und wechselnde Traufhöhen.
- Einstieg: `src/world/District.ts` `buildFacadeBuilding()`, `WorldBuilder.box()`,
  `roundedBox()` aus `src/core/Shapes.ts`.
- Ansatz: Fensterlaibungen und Gesimse als eigene Bänder, Balkone mit Geländer, ein Erker
  je Fassade, Dachkante abgesetzt. Die Kollisionsbox des Hauses bleibt EIN Quader.

**Lücke 4: Wasser und Werftsteg**
- `src/world/Water.ts` zeigt harte Streifen statt einer weichen Welle.
- `buildHarborDocks()` (Zeile ~560) ist eine leere Holzfläche ohne Poller, Taue, Kisten
  oder Kran — im Gegensatz zu Straße und Promenade.
- Ansatz: Wellenfunktion im Shader weicher überlagern; Steg mit demselben Muster möblieren
  wie `buildStreetDressing()`.

### Rahmenbedingungen
- Die Manifeste in `src/contracts/` bleiben unverändert. IDs werden nie umbenannt.
- Fahrzeug-Sockets, `seatOffset` und die `HALF`-Maße bleiben unverändert — Boarding-Kette,
  Safe-Exit-Sweep und Fahrphysik hängen daran.
- Statische Geometrie über `WorldBuilder`, bewegliche Gruppen über `PartBatcher`.
  Beides verschmilzt pro Material; einzelne Meshes pro Bauteil sind der Weg in die Ruckelzone.
- NPCs laufen OHNE Kollision. Neue Geometrie darf nicht auf ihren Routen stehen
  (`DistrictAnchors.npcRoutes`), sonst laufen sie sichtbar hindurch.
- Bundle-Budget: der Build liegt bei rund 680 kB roh (179 kB gzip). Bleib unter 900 kB.
  `roundedBox()` nutzt ExtrudeGeometry und ist teurer als eine Box — sparsam einsetzen.
- Sicherheitsinvarianten: keine Waffen, kein Rammen, kein Schaden, kein negativer
  Kontostand, kein Verlust von Fundstücken.
- FRISCH GEBAUT, NICHT UMBAUEN: die Boarding-Kette in `BoardingController`, die
  Anleger-/Tauch-/Fluglogik der drei neuen Fahrzeuge, `GROUND_EPSILON` und die
  Push-Begrenzung in `CollisionWorld.moveAndSlide()`, der Toon-Patch in `Palette.mat()`.

### Arbeitsweise
1. Für jedes Asset ZUERST die Mehransichten mit dem Read-Tool ansehen — Front, Seite, oben.
   Farben und Silhouette aus dem Bild ablesen, nicht schätzen.
2. Alle gelisteten Dateien vollständig lesen, bevor du planst.
3. Die vier Lücken als voneinander unabhängige Änderungen planen.
4. Eine Lücke nach der anderen umsetzen, jeweils mit:
   - Codeänderung
   - `npm run build` (enthält `tsc --noEmit`)
   - Screenshot zur Sichtprüfung (Playwright gegen `npm run preview`)
5. Nach allen Lücken: alle drei Abnahme-Suiten als Regressionstest.
6. Ein Commit pro Lücke, Nachricht auf Deutsch mit Ursache statt nur Fix.

### Verifikation
- `npm run build`
- `npx vite preview --port 4173 --strictPort --host 127.0.0.1`
- `node acceptance.mjs ./shots http://127.0.0.1:4173/`   (41 Prüfungen, Slice)
- `node harbor.mjs ./shots http://127.0.0.1:4174/`       (23 Prüfungen, Hafen)
- `node airsea.mjs ./shots http://127.0.0.1:4173/`       (38 Prüfungen, Skyfin und Scout)
- Zustandsabfrage im Browser: `window.fynnoxQa.state()`
- Headless rendert nur rund ein Bild pro Sekunde. Warte in Abnahmen auf GERECHNETE FRAMES
  (`page.evaluate(() => new Promise(requestAnimationFrame))`), nicht auf die Wanduhr —
  siehe `untilFrames()` in `airsea.mjs`.

### Was du NICHT tun darfst
- Keine Datei in `src/contracts/` verändern und keine ID umbenennen.
- Keine Fahrzeug-Sockets, `seatOffset`- oder `HALF`-Werte verschieben.
- `GROUND_EPSILON` und die Push-Begrenzung in `CollisionWorld.moveAndSlide()` nicht anfassen.
- Kollidierende Geometrie nicht auf NPC-Routen oder auf die 2 m breiten Gehwege setzen.
- Die 386 MB Referenzbilder nicht ins Repo kopieren; nur echte Laufzeit-Assets nach `public/`.
- `fynnox.glb` aus dem Nachbarprojekt "Fynnox Adventure APP" NICHT einbinden: es trägt das
  Adventure-Outfit statt des City-Turnarounds und wiegt 2,3 MB bei 338 000 Dreiecken.
  Die Entscheidung für prozedurale Modelle ist gefallen.
- Kein Postprocessing einbauen (Bloom, SSAO) — der Look läuft über Material und Licht.
- Nichts als fertig melden, was nicht durch einen Playwright-Lauf belegt ist.
```
