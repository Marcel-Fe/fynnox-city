# Fynnox-3D-Modell einbinden — Session-Prompt für Claude Code
## Den Prompt unten kopieren und als erste Nachricht in eine neue Claude-Code-Sitzung einfügen
---

```
Du arbeitest am Projekt Fynnox City (c:\Users\admin\Desktop\Fynnox City\fynnox-city).
Lies ZUERST die CLAUDE.md im Projektstamm — dort stehen Architektur, Verträge und Regeln.
Lies danach `lessons.md` im Projektstamm.

## Aufgabe: Das fertige Fynnox-3D-Modell einbinden

### Worum geht es?
Fynnox wird im Spiel bisher prozedural aus Kugeln, Kapseln und Kegeln gebaut. Das
Ergebnis ist eine sympathische Klötzchenfigur — aber es gibt bereits ein fertig
modelliertes, texturiertes 3D-Modell derselben Figur aus den Nachbarprojekten. Der
Abstand zwischen beiden ist der größte verbliebene Sprung zur angestrebten
2,5D-/3D-Spieleoptik. Ziel dieser Sitzung: das Modell einbinden, ohne die
Boarding-Kette, die Kollision und den Stil der Stadt zu zerreißen.

### FUNDLAGE — die Modelle sind gesichtet, nicht raten
Drei Dateien liegen außerhalb des Repos. Alle stammen aus demselben Tripo-Generat
(gleiche Material-ID `tripo_material_1464cd8e`), sind also dieselbe Figur.

| Datei | Größe | Dreiecke | Rig | Material | Besonderheit |
|---|---|---|---|---|---|
| `../../Pet Kart APP Spiel/kart-pets/public/models/pets/fynnox_hd.glb` | 393 kB | 5.780 | **nein** | 1x MeshStandard + map/normal/roughness/metalness (WebP) | blaue Tunika, spieltauglich |
| `../../Fynnox Adventure APP/fynnox-adventure/public/models/fynnox.glb` | 2,41 MB | 338.366 | **41 Joints** | dasselbe Material | grüne Tunika, `EXT_meshopt_compression` |
| `../../Pet Kart APP Spiel/kart-pets/public/models/pets/fynnox.glb` | 3,42 MB | 170.756 | nein | **keines**, nur Vertex-Farben | Rohgeometrie, unbrauchbar |

Weitere gemessene Fakten:
- **Beide brauchbaren Modelle haben NULL Animationsclips.** Das Rig im Adventure-Modell
  ist ein nacktes Skelett (`Pelvis`, `Spine`, `L_Thigh`, `R_Calf`, `L_ToeBase` …).
- **Beide schauen nach +X**, nicht nach −Z und nicht nach +Z. Das ist eine dritte
  Achsenkonvention — siehe `FACING_OFFSET` und `lessons.md`.
- Höhe je rund 1,00 m. **Der Ursprung liegt unterschiedlich**: beim `fynnox_hd`
  in der Figurenmitte (`min.y = −0.5`), beim Adventure-Modell an den Füßen (`min.y = 0`).
- Das Adventure-Modell braucht `MeshoptDecoder` aus `three/examples/jsm/libs/`,
  sonst lädt es nicht.

Der Spieler-Collider ist `HALF = (0.3, 0.75, 0.3)` in `PlayerController.ts` (~11) und
`PLAYER_HALF` in `BoardingController.ts` (~20) — also 1,5 m hohe Figur. Das Modell
muss auf diese Maße skaliert werden, nicht umgekehrt.

### Was BEREITS EXISTIERT (nicht neu bauen!)

Lies diese Dateien VOLLSTÄNDIG, bevor du etwas änderst:

1. `src/player/FynnoxModel.ts` — prozedurale Figur (352 Zeilen, KOMPLETT)
   - `FACING_OFFSET` (~15): halbe Drehung zwischen Figuren- (+Z) und Fahrzeugachse (−Z).
   - Acht Gruppen: `hip/torso/head/armL/armR/legL/legR/tail` (~64–72).
   - `setState(AnimationStateId)` (~254), `update(delta, planarSpeed)` (~264):
     die Animation ist handgeschrieben, jeder Zustand setzt Rotationen.
   - Integration: `PlayerController`, außerdem als Vorlage für `AmbientNPCSystem`.

2. `src/player/PlayerController.ts` — Bewegung und Zustandswahl (220 Zeilen, PARTIELL)
   - `scene.add(this.model.root)` (~44), `setVisible` (~61), `playAction` (~66).
   - `applyTransform()` (~146): setzt `model.root.position` und `.rotation.y`.
   - `selectAnimation()` (~155): wählt aus 18 Zuständen.

3. `src/contracts/types.ts` — `AnimationStateId` (~36): **18 Zustände, VERTRAG.**
   `fox_idle`, `fox_walk`, `fox_sprint`, `fox_jump_start`, `fox_jump_air`,
   `fox_land_soft`, `fox_ledge_grab`, `fox_climb_up`, `fox_pickup`, `fox_scan`,
   `fox_enter_vehicle`, `fox_drive_vehicle`, `fox_wave` u. a. IDs nie umbenennen.

4. `src/core/Palette.ts` — Farben und Toon-Material (352 Zeilen, KOMPLETT)
   - `mat()` (~295): EIN Shaderprogramm für alle Weltobjekte, mit Rauschen,
     Toon-Abstufung, Warm-Kalt-Kontrast und Streiflicht. `injectOnce()` (~285)
     bricht ab, wenn eine Shader-Ankerstelle fehlt.
   - `lookUniforms` (~140), `setLookDetail()` (~176).
   - **Dieser Patch ist zertifiziert und trägt jedes sichtbare Objekt im Spiel.**

5. `src/core/PostFx.ts` — Bloom, Farbgraduierung, Vignette (~130 Zeilen, KOMPLETT, NEU)
   - Läuft nur auf hoher Detailstufe, `OutputPass` trägt die Tonwertkurve.

6. `src/core/Game.ts` — Glue (860 Zeilen, PARTIELL)
   - Renderer-Aufbau (~83), `frame()` (~316), `exposeQaHook()` (~232),
     `applySettings()` (~724). **Es gibt bisher keinerlei Asset-Ladepfad** —
     das Spiel startet ohne asynchrones Laden.

7. `src/npc/AmbientNPCSystem.ts` — Ambient-NPCs (373 Zeilen, KOMPLETT)
   - Bewusst einfacher gebaut als FynnoxModel, wegen der Draw-Calls.

8. `src/core/Shapes.ts` — `PartBatcher`, Primitive (151 Zeilen, KOMPLETT)

Es gibt im ganzen Projekt **keinen GLTFLoader und keine .glb-Datei** — `public/`
enthält nur PNG/SVG-Oberflächenassets.

### Was FEHLT (deine Aufgabe — vier Lücken)

**Lücke 1: Es gibt keinen Asset-Ladepfad**
- `Game` baut die Welt synchron im Konstruktor und startet sofort die Frame-Schleife.
  Ein GLB lädt asynchron; ohne Ladepfad steht die Figur in den ersten Sekunden nicht da.
- Einstieg: `src/core/Game.ts` Konstruktor und `start()` (~231).
- Ansatz: `GLTFLoader` (+ `MeshoptDecoder`, falls das Adventure-Modell gewählt wird),
  das Modell nach `public/models/` kopieren, vor dem ersten Bild darauf warten und
  bei Ladefehler auf das prozedurale Modell zurückfallen. Der Fallback ist keine
  Bequemlichkeit — ohne ihn ist ein fehlendes Asset ein schwarzer Bildschirm.

**Lücke 2: Stilbruch zwischen Modell und Stadt**
- Das GLB bringt `MeshStandardMaterial` mit fotografisch anmutenden Texturen mit
  (Fellstruktur, weiche Verläufe). Die ganze Stadt läuft dagegen über den
  Toon-Patch in `Palette.mat()` — flächige Farben, harte Abstufung, Streiflicht.
  Ungeprüft eingesetzt steht die Figur wie ausgeschnitten in der Welt.
- Einstieg: `src/core/Palette.ts` `mat()` (~295), Shader-Chunks (~192–275).
- Ansatz: Den bestehenden Shader-Patch als wiederverwendbare Funktion auf das
  geladene Material anwenden, statt ihn zu duplizieren — Toon-Abstufung und
  Streiflicht auf die Textur legen, statt die Textur zu ersetzen. Vorher/Nachher
  im Screenshot vergleichen und die Entscheidung begründen.
  **Den Patch selbst nicht umschreiben. Neue Uniforms ergänzen ist erlaubt.**

**Lücke 3: 18 Animationszustände, aber keine Animationsclips**
- Der Vertrag verlangt 18 Zustände, `PlayerController.selectAnimation()` (~155)
  wählt sie, und `FynnoxModel.setState()` (~254) bedient sie heute von Hand.
  Keines der beiden GLB bringt einen einzigen Clip mit.
- Einstieg: `src/player/FynnoxModel.ts` (~254 und ~264).
- Ansatz: Zwei gangbare Wege, entscheide begründet:
  (a) `fynnox_hd.glb` ohne Rig als ein Mesh einsetzen und die vorhandene
      Gruppen-Animation aufgeben — dann steht die Figur beim Laufen still.
  (b) `fynnox.glb` mit seinen 41 Joints laden und die bestehenden Posen aus
      `setState()` auf die Knochen übertragen (`Pelvis`, `L_Thigh`, `R_Calf` …),
      statt auf eigene Gruppen. Die Zustandslogik bleibt dabei unverändert.
  Weg (b) erhält das Verhalten, kostet aber 338k Dreiecke — miss die Bildrate,
  bevor du dich festlegst.

**Lücke 4: Maße, Achse und Sitzposition**
- Das Modell schaut nach +X, ist 1,0 m hoch und hat je nach Datei den Ursprung in
  der Mitte oder an den Füßen. Der Spieler ist 1,5 m hoch, seine Achse ist +Z, und
  die Boarding-Kette rechnet mit `FACING_OFFSET` gegen die Fahrzeugachse −Z.
- Einstieg: `src/player/FynnoxModel.ts` (~15), `src/vehicle/BoardingController.ts`
  `bindPlayerToSeat()` (~370).
- Ansatz: Die Korrektur EINMAL beim Laden in den Modellwurzelknoten legen
  (Skalierung, Höhenversatz, Achsdrehung), nicht verstreut an den Aufrufstellen.
  `HALF`, `PLAYER_HALF`, `seatOffset` und die Sockets bleiben unverändert.

### Rahmenbedingungen
- Die Manifeste in `src/contracts/` bleiben unverändert, IDs werden nie umbenannt.
- Fahrzeug-Sockets, `seatOffset` und die `HALF`-Maße bleiben unverändert —
  Boarding-Kette, Safe-Exit-Sweep und Fahrphysik hängen daran.
- `GROUND_EPSILON` und die Push-Begrenzung in `CollisionWorld.moveAndSlide()` nicht anfassen.
- Der Shader-Patch in `Palette.mat()` wird nicht umgeschrieben.
- Bundle-Budget: der Build liegt bei rund 735 kB roh (196 kB gzip), Grenze 900 kB.
  Ein GLB gehört nach `public/` und zählt nicht ins JS-Bundle — wohl aber in die
  Ladezeit. `GLTFLoader` plus `MeshoptDecoder` kosten geschätzt 25–40 kB im Bundle.
- Zielgerät sind Desktop und Tablet; ein schwaches Telefon läuft eine Stufe darunter
  (`detectHighDetail()` in `src/core/Palette.ts` ~162).
- Sicherheitsinvarianten: keine Waffen, kein Rammen, kein Schaden, kein negativer
  Kontostand, kein Verlust von Fundstücken.

### FRISCH GEBAUT — nicht umbauen
- `src/core/PostFx.ts` und die Einbindung in `Game`.
- Die vier Bauwerke, der Vegetationsbaukasten und `AmbientMotion` in `District.ts`.
- `WorldBuilder.shape()` und der um die Indexierung erweiterte Batch-Schlüssel.
- Die Achsenkorrekturen: `FACING_OFFSET`, `getPlanarBasis()`, der Kamera-Schwenk
  beim Einsteigen und `CollisionWorld.rayHitDistance()`.

### Arbeitsweise
1. Alle gelisteten Dateien vollständig lesen, bevor du planst.
2. Die Modelle ansehen, bevor du eines wählst: eine kleine HTML-Seite im Projekt,
   die per `GLTFLoader` lädt, dazu ein Playwright-Screenshot. Danach wieder entfernen.
3. Die vier Lücken als voneinander unabhängige Änderungen planen.
4. Eine Lücke nach der anderen umsetzen, jeweils mit:
   - Codeänderung
   - `npm run build` (enthält `tsc --noEmit`)
   - Screenshot zur Sichtprüfung
5. Nach allen Lücken: alle vier Abnahme-Suiten als Regressionstest.
6. Ein Commit pro Lücke, Nachricht auf Deutsch mit Ursache statt nur Fix.

### Verifikation
```bash
cd "c:/Users/admin/Desktop/Fynnox City/fynnox-city"
npm run build

# Suiten IMMER einzeln, nie parallel — run-suite.sh startet den Preview-Server
# im selben Prozessbaum, weil er separat gestartet mehrfach mitten im Lauf starb.
sh run-suite.sh controls.mjs     # 17 Pruefungen: Achsen, Sitz, Weltbewegung
sh run-suite.sh acceptance.mjs   # 41 Pruefungen, Slice
sh run-suite.sh harbor.mjs       # 23 Pruefungen, Hafen
sh run-suite.sh airsea.mjs       # 38 Pruefungen, Skyfin und Scout
```
- Zustandsabfrage im Browser: `window.fynnoxQa.state()`
- Detailstufe umschalten: `window.fynnoxQa.setDetail(true)`
- Bewegungszustand lesen: `window.fynnoxQa.motion()`
- Headless rendert nur rund ein Bild pro Sekunde. In Abnahmen auf GERECHNETE
  FRAMES warten (`page.evaluate(() => new Promise(requestAnimationFrame))`),
  nicht auf die Wanduhr — siehe `untilFrames()` in `airsea.mjs`.
- Während eine Suite läuft, keinen Build starten: der überschreibt `dist/`, und
  die Suite testet dann eine gemischte Version.
- `controls.mjs` ist die Suite, die Vorzeichenfehler findet. Sie misst Richtungen
  gegen die Kamera. Wenn du die Figurenachse anfasst, muss sie grün bleiben.

### Was du NICHT tun darfst
- Keine Datei in `src/contracts/` verändern und keine ID umbenennen.
- Keine Fahrzeug-Sockets, `seatOffset`- oder `HALF`-Werte verschieben.
- `GROUND_EPSILON` und die Push-Begrenzung in `CollisionWorld.moveAndSlide()` nicht anfassen.
- Den Shader-Patch in `Palette.mat()` nicht umschreiben — er ist zertifiziert und
  trägt jedes Objekt im Spiel. Neue Uniforms ergänzen ist erlaubt, Umbauen nicht.
- Das prozedurale `FynnoxModel` nicht löschen, solange der Ladefallback darauf
  zurückgreift — ein fehlendes Asset darf nie ein schwarzer Bildschirm sein.
- Die 386 MB Referenzbilder nicht ins Repo kopieren; nur echte Laufzeit-Assets
  nach `public/`.
- Kein Modell mit 338k Dreiecken einsetzen, ohne die Bildrate auf der niedrigen
  Detailstufe gemessen zu haben.
- Nichts als fertig melden, was nicht durch einen Playwright-Lauf belegt ist.
```
