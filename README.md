# Fynnox City – Vertical Slice

Spielbarer 3D-Vertical-Slice zu **Fynnox City** von Fynnox Studios, gebaut nach dem
Produktionspaket v1.6. Läuft im Browser auf Desktop und Handy.

**Live:** https://marcel-fe.github.io/fynnox-city/

## Was das hier ist – und was nicht

Das Produktionspaket enthält Spezifikationen, Maßtabellen, Referenzbilder und vier
maschinenlesbare Manifeste, aber **keinen Code und keine 3D-Modelle**. Dieses Repo
setzt den ersten Meilenstein um, den das Paket selbst vorschreibt:

> „Graybox first. Validate movement, camera, vehicle handling, mission flow and
> save/load before replacing blocks with polished assets."
> — `FYNNOX_CITY_DEVELOPER_HANDOFF_EN.md`

Die Optik ist bewusst Graybox im Graphic-Adventure-3D-Farbschema. Fertige GLB-Modelle,
Rigs und Animationsclips ersetzen die Blöcke später, ohne dass die Systeme sich ändern.

## Steuerung

| Aktion | Tastatur / Maus | Touch |
|---|---|---|
| Laufen | W A S D | linker Stick |
| Kamera | Maus ziehen | rechte Bildhälfte ziehen |
| Sprinten | Umschalt | – |
| Springen / Aufziehen | Leertaste | Sprung-Knopf |
| Benutzen | E | Hand-Symbol |
| PawLink-Scanner | Q | Scanner-Symbol |
| Ein-/Aussteigen | F | Fahrzeug-Knopf |
| Pause und Einstellungen | Esc | Pause-Symbol |
| Bremsen (im Fahrzeug) | B | Bremse |

Gamepad wird ebenfalls unterstützt (linker Stick laufen, rechter Stick Kamera, A springen).

## Enthaltene Systeme

- **Welt** – Hafenviertel nach `BAUWERK_MODULE_MASSE_UND_SNAPGRID.md`: 0,5-m-Snap-Grid,
  2,5-m-Fassadenraster, 3,2-m-Geschosse, 12-m-Straßentiles, 0,16/0,30-m-Stufen.
  Foxtail Garage, drei umrundbare Wohn-/Geschäftshäuser, Metro-Eingang, Uhrpavillon,
  Transitwerk, Promenade, Leuchtturm, Wassertaxi-Station.
- **Bewegung** – Third-Person-Controller mit Sprint, Sprung und automatischem Aufziehen
  an Kanten von 0,45–1,4 m. Freie Orbit-Kamera mit Kollisionsausweichen.
- **Dachroute** – Container → Markise → zwei Balkone → Dach → Dachbrücke → 2-m-Sprung,
  plus barrierearmer Treppenturm auf dasselbe Dach.
- **City Spark** – vollständige 10-Schritt-Einstiegs- und 9-Schritt-Ausstiegskette aus
  `FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json`, inklusive Capsule-Sweep-Safe-Exit:
  primärer Anker → alternativer Anker → begründete Verweigerung. Kein Teleport.
- **Mission „Der vierte Weg"** – Impuls scannen, frei zum Hafen reisen, Licht-/Ventil-
  Rätsel lösen, Hafenbrunnen reaktivieren, Wartungstreppe öffnen.
- **Sammeln** – neun Stadtfunken, Tatz-Taler, Einlösen an der Projektstation.
  Kein negativer Kontostand, kein Verlust, keine Lootboxen.
- **Stadtprojekt** – Hafenterrasse in vier Zuständen; jeder Wechsel schaltet Mesh,
  Collider, Licht und NPC-Aktivität in einer Transaktion.
- **Lebendige Welt** – NPCs auf Activity Points mit drei Simulationsringen. Menü,
  Scanner und Boarding halten die Welt nie an.
- **Speichern** – atomarer `localStorage`-Stand mit allen Pflichtfeldern aus
  `save_atomic_fields`.
- **Barrierefreiheit (P0)** – Onboarding aus den fünf Paket-SVGs, größerer Text,
  Untertitel, reduzierte Bewegung, Form-plus-Farbe-Marker, Fahrhilfe,
  Kameraempfindlichkeit, Safe-Area-Insets, geprüfte 88-px-Touchziele.

## Verträge aus dem Paket

`src/contracts/` enthält die **unveränderten** Manifeste. IDs werden nie umbenannt, und
`validateManifests()` bricht den Start ab, wenn Einheiten, Zustandsketten,
Safe-Exit-Policy oder Sicherheitsinvarianten nicht mehr zum Paket passen.

| Manifest | Verwendet für |
|---|---|
| `PROGRAMMIER_ASSET_MANIFEST_v1_4.json` | Animations-, HUD- und Ambient-States, UI-Icons, Weltzonen |
| `PROGRAMMIER_ASSET_MANIFEST_v1_5.json` | Sammelobjekte, Einlösestationen, Stadtprojekte, Sicherheitsinvarianten |
| `PROGRAMMIER_ASSET_MANIFEST_v1_6.json` | Grafikrichtung, Weltsimulation während Dialog/Boarding |
| `FAHRZEUG_INTERAKTIONSMANIFEST_v1_6.json` | Sockets, Kameraprofile, Ein-/Ausstiegsketten, Save-Felder |
| `ONBOARDING_TOKENS.json` | Farbtokens, Mindest-Touchziel, Mindest-Textgröße |

Die 386 MB Referenzbilder des Pakets bleiben bewusst außerhalb des Repos – sie sind laut
Handoff Produktionsvorlagen, keine Laufzeit-Assets. Im Repo liegen nur die tatsächlich
geladenen Dateien: 12 UI-Icons, HUD-Overlays, fünf Onboarding-SVGs und das App-Icon.

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # tsc --noEmit && vite build
npm run preview  # gebauten Stand testen
```

Deployment läuft automatisch über `.github/workflows/deploy.yml` bei jedem Push auf `main`.

## Nicht im Slice

Skyfin, Bluefin Scout, U-Boot-Expedition, Rivalen-Verfolgungen, Straßenbahnbetrieb,
Dialogsystem und Store-Uploads fehlen bewusst – die Umsetzungsreihenfolge in
`SPIELVISION_OPEN_CITY_ABENTEUER_v1_6.md` sieht sie erst nach dem Slice vor.
