# Skyfin und Bluefin Scout — Session-Prompt für Claude Code
## Prompt unten kopieren und als erste Nachricht in eine neue Claude-Code-Session einfügen
---

```
Du arbeitest am Projekt Fynnox City (c:\Users\admin\Desktop\Fynnox City\fynnox-city).
Lies ZUERST die CLAUDE.md im Projektstamm — dort stehen Architektur, Verträge und Regeln.

## Aufgabe: Skyfin Küstenflugzeug und Bluefin Scout U-Boot in den Vertical Slice aufnehmen

### Worum geht es?
Der Vertical Slice ist bis Punkt 8 der Umsetzungsreihenfolge aus
SPIELVISION_OPEN_CITY_ABENTEUER_v1_6.md fertig und live. Punkt 9 lautet: "erst danach
Skyfin und Bluefin Scout in den Vertical Slice aufnehmen". Beide Fahrzeuge stehen
bereits vollständig im FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json — mit Sockets,
Kameraprofilen, beweglichen Teilen und Einstiegsbedingungen. Sie sind die einzigen
zwei der fünf Manifest-Fahrzeuge, die noch keine Implementierung haben.
Ziel: dieselbe Boarding-Kette, zwei neue Bewegungsräume — Luft und Unterwasser.

### Was BEREITS EXISTIERT (rund 80 % — nicht neu bauen!)

Lies diese Dateien VOLLSTÄNDIG, bevor du irgendetwas änderst:

1. `src/vehicle/BoardableVehicle.ts` — Fahrzeugvertrag (77 Zeilen, KOMPLETT)
   - `interface BoardableVehicle` (Zeile ~9): position, heading, speed, isStationary,
     entryPartState, seatOffset, label, hasSocket, socketWorld, setEntryPartOpen,
     checkEntryCondition, place, drive, update, settle
   - `resolveSockets(vehicleId)` (Zeile ~45): leitet entry/seat/exit per Präfix aus
     `required_sockets` ab — funktioniert für entry_pilot und seat_pilot bereits
   - `buildSockets(vehicleId, root, positions)` (Zeile ~63): wirft beim Start, wenn eine
     Socket-Position fehlt
   - Integration: von CitySpark, BluefinWaterTaxi, BoardingController, Game genutzt

2. `src/vehicle/BoardingController.ts` — Ein-/Ausstiegsketten (382 Zeilen, KOMPLETT)
   - `nearestBoardable()` (Zeile ~52): nächstes Fahrzeug in 2,8 m Reichweite
   - `requestEnter()` (Zeile ~67): iteriert `entry_state_sequence`, prüft
     `entry_requires_stationary` und alle `entry_conditions` über
     `vehicle.checkEntryCondition()`
   - `requestExit()` (Zeile ~181): Capsule-Sweep über alle exit_-Sockets, verlangt
     tragfähigen Boden, verweigert lesbar statt zu teleportieren
   - `blendSeconds()` (Zeile ~338): liest die Blendzeit aus dem Kameraprofil
   - GENERISCH: braucht für neue Fahrzeuge keine Änderung außer der Kameradistanz

3. `src/vehicle/BluefinWaterTaxi.ts` — Vorlage für Wasserfahrzeuge (299 Zeilen, KOMPLETT)
   - `checkEntryCondition()` (Zeile ~161): vehicle_docked, ramp_deployed,
     boarding_lane_clear — Muster für pressure_equalized und hatch_unlocked
   - `updateMooring()` (Zeile ~241): automatisches Anlegen bei geringer Fahrt
   - `isNavigable()` (Zeile ~279): Wasser = Boden unterhalb −1 m
   - `syncTransform()` (Zeile ~284): Wellengang über Sinus, keine Schwerkraft

4. `src/vehicle/CitySpark.ts` — Vorlage für Landfahrzeuge (218 Zeilen, KOMPLETT)
   - `drive()` (Zeile ~155): Arcade-Fahrphysik mit moveAndSlide und ignoreTag 'vehicle'
   - `updateCollider()` (Zeile ~208): dynamischer Collider, damit man auf dem Dach steht

5. `src/core/Game.ts` — Zusammenbau (795 Zeilen, PARTIELL für neue Fahrzeuge)
   - `vehicles` (Zeile ~55): Array aller einsteigbaren Fahrzeuge
   - `driveVehicle()` (Zeile ~368): Gas/Lenkung/Bremse, Kameradistanz je Fahrzeug —
     hier fehlt die dritte Achse (Höhe/Tiefe)
   - `interactables()` (Zeile ~393): Kontextaktionen
   - `markers()` (Zeile ~603), `save()` (Zeile ~664), `load()` (Zeile ~706)
   - `exposeQaHook()` (Zeile ~213): QA-Schnittstelle für die Playwright-Abnahme

6. `src/world/District.ts` — Weltaufbau (600 Zeilen, PARTIELL)
   - `DistrictAnchors` (Zeile ~20): alle Ankerpunkte, u. a. `moorings`
   - `buildResearchPlatform()` (Zeile ~529): Plattform im Hafenbecken, Deck auf 0,6 m
   - `buildWaterTaxiStation()` (Zeile ~511): Bahnsteig 0,3 m, schwimmendes Dock 0,15 m
   - Beckenboden liegt auf −3 m (`buildTerrain`), Wasseroberfläche auf −0,4 m

7. `src/camera/OrbitCameraRig.ts` — Kamera (142 Zeilen, KOMPLETT)
   - `blendTo(profileId)` (Zeile ~62): liest Blendzeiten aus dem Manifest
   - `update()` (Zeile ~92): Kollisionsausweichen per Ray gegen Collider-Boxen
   - `cam_vehicle_air` verlangt laut Manifest `roll_compensation` — noch nicht umgesetzt

8. `src/save/SaveGame.ts` — atomarer Spielstand (95 Zeilen, PARTIELL)
   - `SaveData` (Zeile ~9): enthält `vehicle_transform` und `water_taxi_transform`;
     für zwei weitere Fahrzeuge fehlen die Felder

Manifestdaten, die du brauchst (aus `src/contracts/FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json`):

- `vehicle_skyfin` (electric_coastal_seaplane), boarding_camera `cam_board_air`,
  control_camera `cam_vehicle_air`
  Sockets: entry_pilot, exit_pilot_primary, seat_pilot, camera_boarding, camera_drive,
  hand_grab_lower, hand_cockpit_frame, hand_control_l, hand_control_r, foot_float_step,
  foot_cockpit_step, belt_anchor_l, belt_anchor_r
  Bewegliche Teile: cockpit_door, seat_belt, propeller, rudder, ailerons
  entry_conditions: vehicle_docked_or_parked, propeller_stopped, cockpit_clear

- `vehicle_bluefin_scout` (electric_research_submarine), boarding_camera `cam_board_water`,
  control_camera `cam_vehicle_water`, weapons: false
  Sockets: dock_anchor, entry_pilot, exit_pilot_primary, seat_pilot, seat_passenger_01,
  camera_boarding, camera_drive, hand_hatch_l, hand_hatch_r, foot_ladder_01,
  foot_ladder_02, cabin_clear
  Bewegliche Teile: top_hatch, internal_ladder, thrusters, camera_arm
  entry_conditions: vehicle_docked, pressure_equalized, hatch_unlocked

### Was FEHLT (deine Aufgabe — vier Lücken schließen)

**Lücke 1: Skyfin als BoardableVehicle**
- Es gibt keine Datei `src/vehicle/Skyfin.ts`. Damit fehlt das dritte der fünf
  Manifest-Fahrzeuge komplett: Modell, Sockets, Flugphysik, Gurt und Propeller.
- Einstieg: `src/vehicle/CitySpark.ts` als Bauvorlage, `buildSockets()` für die
  dreizehn geforderten Sockets, `implements BoardableVehicle`.
- Ansatz: Schwimmerflugzeug, das auf dem Wasser parkt (y wie das Wassertaxi) und beim
  Fahren Auftrieb bekommt. `checkEntryCondition` beantwortet propeller_stopped über die
  Propellerdrehzahl, cockpit_clear über eine freie Box am entry_pilot-Socket,
  vehicle_docked_or_parked über die Nähe zu einem Ankerpunkt.

**Lücke 2: Bluefin Scout als BoardableVehicle**
- Es gibt keine Datei `src/vehicle/BluefinScout.ts`. Das U-Boot ist im v1.5-Manifest
  als `vehicle_additions` und im v1.6-Fahrzeugvertrag definiert, aber nirgends gebaut.
- Einstieg: `src/vehicle/BluefinWaterTaxi.ts` als Vorlage (Anleger, Rampe → hier Luke
  und Leiter), `resolveSockets` liefert entry_pilot/seat_pilot/exit_pilot_primary.
- Ansatz: Tauchtiefe als dritte Achse zwischen −0,4 m (aufgetaucht) und −2,6 m knapp
  über dem Beckenboden. `pressure_equalized` ist nur an der Oberfläche erfüllt,
  `hatch_unlocked` folgt aus der Lukenanimation. Keine Waffen, kein Schaden.

**Lücke 3: Dritte Steuerachse für Höhe und Tiefe**
- `Game.driveVehicle()` (Zeile ~368) kennt nur Gas und Lenkung. Fliegen und Tauchen
  brauchen zusätzlich Steigen/Sinken, auf Touch ohne zweiten Stick.
- Einstieg: `src/core/Game.ts` `driveVehicle()`, `src/input/InputManager.ts`
  (VirtualButton-Typ), `src/ui/HUD.ts` `setContext()` für die Knopfsichtbarkeit.
- Ansatz: zwei Kontextknöpfe "Steigen"/"Sinken" (Tastatur R/F) als neue VirtualButtons,
  die nur bei aktivem Luft- oder Tauchfahrzeug eingeblendet werden. Die Fahrzeuge
  bekommen dafür eine optionale `setVerticalInput(value: number)`-Methode im Vertrag.

**Lücke 4: Kameraprofil-Eigenschaften werden ignoriert**
- `cam_vehicle_air` fordert laut Manifest `roll_compensation`, `cam_vehicle_water`
  fordert `horizon_damping`. `OrbitCameraRig` liest beides nicht aus.
- Einstieg: `src/camera/OrbitCameraRig.ts` `blendTo()` (Zeile ~62) und `update()`
  (Zeile ~92), Profil kommt über `cameraProfile(id)` aus `src/contracts/manifests.ts`.
- Ansatz: Profil beim Blend merken; bei `horizon_damping` die Nickbewegung dämpfen,
  bei `roll_compensation` die Rollbewegung des Fahrzeugs aus der Kamera herausrechnen.

### Rahmenbedingungen
- Die Manifeste in `src/contracts/` bleiben unverändert. IDs werden nie umbenannt.
- Die Ein- und Ausstiegskette wird aus dem Manifest gelesen, nicht nachgebaut.
  `BoardingController` braucht für neue Fahrzeuge idealerweise keine Änderung.
- Sicherheitsinvarianten: keine Waffen, kein Rammen, kein Schaden, kein negativer
  Kontostand, kein Verlust von Fundstücken.
- Safe Exit bleibt zwingend: primärer Anker, dann Alternative, sonst lesbare
  Verweigerung. Nie ohne tragfähigen Boden aussteigen, nie teleportieren.
- Genau ein aktiver Input-Kontext. Dialog und Boarding pausieren nur die Steuerung.
- Neue statische Geometrie über `WorldBuilder`, damit das Material-Batching greift.
- Bundle-Budget: der Build liegt bei rund 620 kB (160 kB gzip). Bleib deutlich unter
  900 kB roh, sonst leidet die Ladezeit auf dem Handy.
- FRISCH GEBAUT, NICHT ANFASSEN: `BluefinWaterTaxi`, `DialogueSystem`, `HarborProject`,
  `ScannerPuzzle`, die Anleger-Logik und der Epsilon-Fix in
  `CollisionWorld.moveAndSlide()`. Der Epsilon am Fußpunkt (GROUND_EPSILON) verhindert,
  dass die Figur beim Stehen quer über die Bodenplatte geschoben wird — nicht entfernen.

### Arbeitsweise
1. Alle gelisteten Dateien VOLLSTÄNDIG lesen, bevor du planst.
2. Die vier Lücken als voneinander unabhängige Änderungen planen.
3. Eine Lücke nach der anderen umsetzen, jeweils mit:
   - Codeänderung
   - `npm run build` (enthält `tsc --noEmit`)
4. Nach allen Lücken: beide Playwright-Suiten als Regressionstest laufen lassen und
   eine neue Suite für Skyfin und Bluefin Scout schreiben.
5. Ein Commit pro Lücke, Nachricht auf Deutsch mit Ursache statt nur Fix.

### Verifikation
- `npm run build`
- `npm run preview` und in einem zweiten Terminal die Abnahme fahren
- `node acceptance.mjs ./shots http://localhost:4173/` (41 Prüfungen, Slice)
- `node harbor.mjs ./shots http://localhost:4174/` (23 Prüfungen, Hafen)
- Neue Suite muss mindestens nachweisen: Boarding-Kette bis `vehicle_control` für beide
  Fahrzeuge, aktives Kameraprofil `cam_vehicle_air` bzw. `cam_vehicle_water`,
  Verweigerung des Einstiegs bei laufendem Propeller, Verweigerung des Ausstiegs beim
  getauchten U-Boot, Fortbestehen der Fahrzeugposition nach `location.reload()`
- Zustandsabfrage im Browser: `window.fynnoxQa.state()`

### Was du NICHT tun darfst
- Keine Datei in `src/contracts/` verändern und keine ID umbenennen.
- Die Zustandsketten nicht als feste Arrays im Code duplizieren — sie kommen aus
  `vehicleContract.global_contract`.
- Keine Waffen-, Schadens-, Ramm- oder Abschussmechanik einbauen, auch nicht als Platzhalter.
- Den Safe-Exit-Sweep nicht umgehen und keinen Teleport als Notlösung einbauen.
- `GROUND_EPSILON` und die Push-Begrenzung in `CollisionWorld.moveAndSlide()` nicht anfassen.
- Die 386 MB Referenzbilder nicht ins Repo kopieren; nur echte Laufzeit-Assets nach `public/`.
- Nichts als fertig melden, was nicht durch einen Playwright-Lauf belegt ist.
```

**Gespeichert unter:** `.planning/session-prompts/skyfin-bluefin-scout-prompt.md`
