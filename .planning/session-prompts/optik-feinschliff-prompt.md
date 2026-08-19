# Optik-Feinschliff — Session-Prompt für Claude Code
## Kopiere den Prompt unten und füge ihn als erste Nachricht in eine neue Claude-Code-Session ein
---

```
Du arbeitest am Projekt Fynnox City (c:\Users\admin\Desktop\Fynnox City\fynnox-city).
Lies ZUERST die CLAUDE.md im Projektstamm — dort stehen Architektur, Verträge und Regeln.

## Aufgabe: Optik-Feinschliff — Postprocessing, Vegetation, Bewegung und die letzten Kistenbauwerke

### Worum geht es?
Erklärtes Produktziel: Fynnox City soll grafisch begeistern, nicht nur funktionieren — die
Welt soll später weitere Spiele tragen können. Fahrzeuge, Figuren, Fassaden, Wasser und das
Material-/Lichtfundament sind gebaut. Was den Abstand zu den Paketbildern jetzt noch trägt,
sind vier Dinge: es fehlt ein Postprocessing-Pass, vier Bauwerke sind noch reine Quader,
die Vegetation besteht aus Laubkisten, und außer Wasser und Figuren bewegt sich nichts.

### VORAB — offene Abnahme aus der letzten Sitzung
`node airsea.mjs` wurde beim letzten Lauf vorzeitig beendet (Stand: 33 PASS, 0 FAIL, keine
Schlusszeile). `acceptance.mjs` 41/41 und `harbor.mjs` 23/23 liefen gegen denselben Build
durch. **Schritt 0 dieser Sitzung: airsea vollständig durchlaufen lassen.** Erst danach
Code ändern — sonst mischt sich ein Altfehler in neue Arbeit.

### Stehende Entscheidungen (nicht neu diskutieren)
- **Zielgerät:** Desktop und Tablet sind die Qualitätsreferenz, ein schwaches Telefon läuft
  eine Stufe darunter. Umgesetzt als Einstellung „Hohe Detailstufe" mit Geräteerkennung
  (`detectHighDetail()` in `src/core/Palette.ts` Zeile ~144).
- **Postprocessing ist für diese Phase freigegeben.** Der ursprüngliche Slice-Prompt hat es
  verboten; das war eine Graybox-Regel und ist für die Produktphase aufgehoben. Sie gilt
  weiterhin für die niedrige Detailstufe.
- Prozedurale Modelle bleiben. `fynnox.glb` aus dem Nachbarprojekt wird NICHT eingebunden.

### Was BEREITS EXISTIERT (rund 60 % — nicht neu bauen!)

Lies diese Dateien VOLLSTÄNDIG, bevor du etwas änderst:

1. `src/core/Palette.ts` — Farben und Materiallook (332 Zeilen, KOMPLETT)
   - `COLORS` (Zeile ~9): alle Farben aus Tokens und Bildreferenzen. Neue Farben HIER
     ergänzen, nie im Modell hart schreiben.
   - `lookUniforms` (Zeile ~122): geteilte Uniforms aller Weltmaterialien, inkl. `uMottle`,
     `uGrain`, `uShadowTint`, `uLightTint`, `uTintStrength`.
   - `detectHighDetail()` (Zeile ~144) und `setLookDetail()` (Zeile ~158): Detailstufe.
   - `NOISE_CHUNK` (~172), `SURFACE_CHUNK` (~202), `TOON_CHUNK` (~224), `TOON_OUTPUT`:
     Oberflächenvariation im Objektraum plus Toon-Abstufung mit Warm-Kalt-Kontrast.
   - `injectOnce()` (~265): bricht ab, wenn eine Shader-Ankerstelle fehlt.
   - `mat()` (~275): ein einziges Shaderprogramm für alle Farben.
   - Integration: jedes sichtbare Objekt im Spiel.

2. `src/core/Game.ts` — Glue, Renderer, Frame-Schleife (830 Zeilen, PARTIELL)
   - Renderer-Aufbau (Zeile ~83): `NeutralToneMapping`, Exposure 1.1, PCFSoftShadowMap.
   - `resize()` (Zeile ~824): setzt Renderer- und Kameragröße.
   - `frame()` (Zeile ~302), `this.renderer.render(...)` (Zeile ~351) — hier hängt der
     Postprocessing-Pass ein.
   - `exposeQaHook()` (~225): `window.fynnoxQa`, u. a. `setDetail(high)`.
   - `applySettings()` (~695): ruft `setLookDetail(settings.highDetail)`.

3. `src/world/Sky.ts` — Tageszeit, Licht, Himmel (145 Zeilen, KOMPLETT)
   - `apply()` (Zeile ~110): Sonnenfarbe, Intensitäten, Himmelsverlauf, Nebel, Streiflicht.
   - Fülllicht warm von unten, kühl von oben; Kontrast rund 2:1.

4. `src/world/District.ts` — Weltaufbau (1007 Zeilen, PARTIELL)
   - `buildFacadeBuilding()` (Zeile ~333): FERTIG ausmodelliert — Sockel, Ecklisenen,
     Gesimse, Fensterlaibungen aus vier Stäben, Erker, Balkone, Dachgarten. VORLAGE.
   - `buildMetroEntrance()` (~539), `buildClockPavilion()` (~549), `buildLighthouse()`
     (~704), `buildFoxtailGarage()` (~279): noch reine Quader.
   - `plantedTree()` (~861): Baum aus zwei Laubkisten.
   - `buildStreetDressing()` (~937), `buildProps()` (~982): Möblierungsmuster.
   - `buildHarborDocks()` (~735): FERTIG möbliert — Dalben, Taue, Kran, Kisten.

5. `src/core/Shapes.ts` — Formen-Baukasten (151 Zeilen, KOMPLETT)
   - `PartBatcher`: sammelt Teile einer beweglichen Gruppe, verschmilzt pro Farbe.
     `finish(parent, {castShadow, opacity})` — `opacity` unter 1 für Verglasungen.
   - `between(from, to)` (~68): Lage und Länge für Streben, Taue, Seile.
   - Primitive `sphere/box/capsule/cylinder/cone/torus`, `roundedBox()`, `alongLocalY()`.

6. `src/world/WorldBuilder.ts` — Batching statischer Geometrie (147 Zeilen, KOMPLETT)
   - `box/stairs/railing/collisionAdd/finish`. `box()` nimmt `y` als UNTERKANTE.
   - Statische Weltteile MÜSSEN hierüber laufen.

7. `src/npc/AmbientNPCSystem.ts` — Ambient-NPCs (373 Zeilen, KOMPLETT)
   - `LOOKS` (~47): sechs Farbstellungen, Mira/Boro/Tavi als benannte Varianten.
   - `buildBody/buildLeg/buildArm`: bewusst einfacher als FynnoxModel wegen der Draw-Calls.
   - Drei Simulationsringe; NPCs fragen die CollisionWorld NICHT ab.

8. `src/world/Water.ts` — Wasseroberfläche (85 Zeilen, KOMPLETT)
   - Vier Wellenlagen, weiche Staffelung, Schaumkronen, entfernungsabhängiges Glitzern.

### Was FEHLT (deine Aufgabe — vier Lücken schließen)

**Lücke 1: Kein Postprocessing-Pass**
- `Game.frame()` rendert direkt in den Bildschirmpuffer (`src/core/Game.ts` Zeile ~351).
  Es gibt keinen EffectComposer, also kein Bloom und keine Farbgraduierung. In diesem
  Stil ist das der größte verbliebene Wow-Hebel: leuchtende Fenster, Gold, Wasserglitzer.
- Einstieg: `src/core/Game.ts` Renderer-Aufbau (~83), `frame()` (~302), `resize()` (~824).
- Ansatz: `EffectComposer` + `RenderPass` + `UnrealBloomPass` aus `three/examples/jsm`,
  dazu ein kleiner eigener `ShaderPass` für Vignette und Farbgraduierung. An
  `settings.highDetail` koppeln: auf niedriger Stufe direkt rendern wie bisher. Der
  Composer muss in `resize()` mitwachsen. Bloom-Schwelle hoch ansetzen — in einer Welt aus
  Vollfarben blüht sonst die ganze Fassade.

**Lücke 2: Vier Bauwerke sind noch Quader**
- `buildMetroEntrance()` (~539), `buildClockPavilion()` (~549), `buildLighthouse()` (~704)
  und `buildFoxtailGarage()` (~279) bestehen aus flachen Kisten, während die drei
  Wohnblocks ausmodelliert sind. Der Leuchtturm ist die Landmarke des Hafens und aktuell
  ein Quaderturm.
- Referenzen: `../Fynnox_City_3D_Produktionspaket_v1/03_Bildreferenzen/10_Bauwerke_und_Infrastruktur/`
  Ordner `02_Foxtail_Garage`, `03_Tideline_Metro_Eingang`, `04_Hafen_Leuchtturm`,
  `06_Maker_Markt_Uhrpavillon` — je sechs Ansichten. Bilder mit dem Read-Tool ansehen,
  bevor du baust. Farben und Silhouette ablesen, nicht raten.
- Einstieg: `buildFacadeBuilding()` (~333) als Bauvorlage, `WorldBuilder.box()`,
  `roundedBox()` sparsam.
- Ansatz: Leuchtturm als runder, sich verjüngender Schaft (Zylinder statt Quader) mit
  Galerie und Laterne; Metro mit Vordach, Treppenabgang und Beschriftungsband; Pavillon
  mit Zifferblatt und profiliertem Dach; Garage mit Torrahmen und Traufe.

**Lücke 3: Vegetation besteht aus Laubkisten**
- `plantedTree()` (~861) baut die Krone aus zwei Quadern. In den Referenzen ist die Stadt
  dicht begrünt: Straßenbäume, Blütenbäume, Küstenkiefern, Fächerpalmen, Heckenbüsche,
  Kletterefeu an den Fassaden, Blumenkästen an den Fensterbänken.
- Referenzen: `03_Bildreferenzen/23_Natur_und_Kleinobjekte/01_Vegetation/` (neun Motive)
  und `05_Orte_und_Landschaften/01_Hafenpromenade_Uebersicht.png`.
- Einstieg: `plantedTree()` (~861), `buildStreetDressing()` (~937), `buildProps()` (~982).
- Ansatz: Krone aus mehreren versetzten, skalierten Kugeln statt aus zwei Kisten; zwei bis
  drei Baumarten als eigene Funktionen; Efeubahnen an je einer Gebäudeecke; Blumenkästen
  auf den Fensterbänken der Fassadenhäuser. Alles ohne Kollision, Stämme und Beete tragen.

**Lücke 4: Die Welt steht still**
- Es bewegen sich nur Wasser, NPCs und Fahrzeuge. Laub, Markisen, Windsack und Himmel sind
  starr. Begeisterung entsteht in Bewegung, und Standbilder zeigen das nicht.
- Einstieg: neue Datei `src/world/AmbientMotion.ts`, eingehängt in `Game.frame()` (~302)
  neben `this.sky.update(...)` (~309).
- Ansatz: eine kleine Klasse mit wenigen bewegten Gruppen statt tausend Einzelobjekten —
  zwei bis drei Möwen auf Kreisbahnen über dem Becken, ein schwenkender Windsack am
  Flugsteg, leicht wiegende Baumkronen über eine gemeinsame Sinusphase. Die Baumkronen
  liegen im statischen `WorldBuilder`-Batch; wenn sie sich bewegen sollen, müssen die
  Kronen als eigene Gruppen aus dem Batch heraus — das ist eine bewusste Draw-Call-
  Entscheidung, sparsam einsetzen (höchstens die Bäume auf Promenade und Platz).

### Rahmenbedingungen
- Die Manifeste in `src/contracts/` bleiben unverändert. IDs werden nie umbenannt.
- Fahrzeug-Sockets, `seatOffset` und die `HALF`-Maße bleiben unverändert — Boarding-Kette,
  Safe-Exit-Sweep und Fahrphysik hängen daran.
- Statische Geometrie über `WorldBuilder`, bewegliche Gruppen über `PartBatcher`. Beides
  verschmilzt pro Material; einzelne Meshes pro Bauteil sind der Weg in die Ruckelzone.
- NPCs laufen OHNE Kollision. Neue Geometrie darf nicht auf ihren Routen stehen
  (`DistrictAnchors.npcRoutes`) und nicht auf den 2 m breiten Gehwegen.
- Die Parkourroute läuft über die Dächer von Block A bis C entlang `z = cz`; diese Bahn
  bleibt frei. Die Strassenseite von Block A trägt die Kletterlinie (`frontDecor: false`).
- Bundle-Budget: der Build liegt bei rund 697 kB roh (185 kB gzip). Bleib unter 900 kB.
  `UnrealBloomPass` plus Composer kosten geschätzt 30–40 kB — das passt, aber prüfe es.
- Sicherheitsinvarianten: keine Waffen, kein Rammen, kein Schaden, kein negativer
  Kontostand, kein Verlust von Fundstücken.
- Headless-Chromium meldet wenige CPU-Kerne, deshalb wählt `detectHighDetail()` dort immer
  die niedrige Stufe. Für aussagekräftige Screenshots `window.fynnoxQa.setDetail(true)`
  aufrufen — das macht `shots/shot.mjs` bereits.

### FRISCH GEBAUT — nicht umbauen
- Der Shader-Patch in `Palette.mat()` samt Rauschen, Warm-Kalt-Kontrast und `injectOnce()`.
- Die Lichtbalance in `Sky.apply()` und die Tonwertkurve in `Game` (`NeutralToneMapping`).
- `buildFacadeBuilding()`, `buildHarborDocks()`, `Water.ts`, `AmbientNPCSystem.ts`.
- Die vier Fahrzeuge (`CitySpark`, `BluefinWaterTaxi`, `Skyfin`, `BluefinScout`).
- Die Boarding-Kette in `BoardingController`, `GROUND_EPSILON` und die Push-Begrenzung in
  `CollisionWorld.moveAndSlide()`.

### Arbeitsweise
1. Schritt 0: `airsea.mjs` vollständig durchlaufen lassen (siehe oben).
2. Alle gelisteten Dateien vollständig lesen, bevor du planst.
3. Für jedes Bauwerk ZUERST die Mehransichten mit dem Read-Tool ansehen.
4. Die vier Lücken als voneinander unabhängige Änderungen planen.
5. Eine Lücke nach der anderen umsetzen, jeweils mit:
   - Codeänderung
   - `npm run build` (enthält `tsc --noEmit`)
   - Screenshot zur Sichtprüfung über `shots/shot.mjs`
6. Nach allen Lücken: alle drei Abnahme-Suiten als Regressionstest.
7. Ein Commit pro Lücke, Nachricht auf Deutsch mit Ursache statt nur Fix.

### Verifikation
```bash
cd "c:/Users/admin/Desktop/Fynnox City/fynnox-city"
npm run build
npx vite preview --port 4173 --strictPort --host 127.0.0.1 &
npx vite preview --port 4174 --strictPort --host 127.0.0.1 &
node acceptance.mjs ./shots http://127.0.0.1:4173/   # 41 Prüfungen, Slice
node harbor.mjs ./shots http://127.0.0.1:4174/       # 23 Prüfungen, Hafen
node airsea.mjs ./shots http://127.0.0.1:4173/       # 38 Prüfungen, Skyfin und Scout
node shots/shot.mjs http://127.0.0.1:4173/ buildings,facade,street,promenade,docks,water
```
- Zustandsabfrage im Browser: `window.fynnoxQa.state()`
- Detailstufe im Browser umschalten: `window.fynnoxQa.setDetail(true)`
- Headless rendert nur rund ein Bild pro Sekunde. Warte in Abnahmen auf GERECHNETE FRAMES
  (`page.evaluate(() => new Promise(requestAnimationFrame))`), nicht auf die Wanduhr —
  siehe `untilFrames()` in `airsea.mjs`.
- Der Preview-Server ist in dieser Umgebung schon einmal mitten im Lauf gestorben. Wenn eine
  Suite ohne Schlusszeile endet, zuerst `curl http://127.0.0.1:4173/` prüfen, bevor du im
  Code suchst.

### Was du NICHT tun darfst
- Keine Datei in `src/contracts/` verändern und keine ID umbenennen.
- Keine Fahrzeug-Sockets, `seatOffset`- oder `HALF`-Werte verschieben.
- `GROUND_EPSILON` und die Push-Begrenzung in `CollisionWorld.moveAndSlide()` nicht anfassen.
- Kollidierende Geometrie nicht auf NPC-Routen, nicht auf die 2 m breiten Gehwege und nicht
  auf die Parkourbahn über den Dächern setzen.
- Den Shader-Patch in `Palette.mat()` nicht umschreiben — er ist zertifiziert und trägt
  jedes Objekt im Spiel. Neue Uniforms ergänzen ist erlaubt, Umbauen nicht.
- Die 386 MB Referenzbilder nicht ins Repo kopieren; nur echte Laufzeit-Assets nach `public/`.
- `fynnox.glb` aus dem Nachbarprojekt "Fynnox Adventure APP" NICHT einbinden.
- Bloom nicht global über alles legen — bei Vollfarbflächen blüht sonst die ganze Stadt.
  Schwellwert hoch, Stärke niedrig, und auf der niedrigen Detailstufe ganz aus.
- Nichts als fertig melden, was nicht durch einen Playwright-Lauf belegt ist.
```
