# Stand: Raumwirkung und Blickrichtung (09.09.2026)

Drei Nutzermeldungen, dazu die Vorgabe "die Welt grafisch wie auf den Bildern
darstellen". Eine der drei Luecken ist erledigt, zwei stehen aus.

## Erledigt — Luecke 1: Kamera fuehrt der Laufrichtung nach

**Gemessen vorher:** Der Winkel zwischen Kamerablick und Laufrichtung blieb ueber
36 Bilder konstant — rueckwaerts 180 Grad, seitwaerts 90 Grad, vorwaerts 0. Die
Kamera fuehrte in keiner Situation nach.

**Gebaut:** `OrbitCameraRig.followMovement()`. Nach 0,5 s anhaltender Bewegung
zieht der yaw mit 1,8 1/s hinter die Blickrichtung der Figur (diese dreht mit
12 1/s, also deutlich schneller). Eigene Zeigereingabe setzt die Nachfuehrung
fuer 1 s aus.

**Der entscheidende Teil:** `followOffset` haelt den Nachfuehr-Anteil am yaw
fest, `getPlanarBasis()` rechnet ihn heraus. Ohne das dreht sich die
Laufrichtung mit der Kamera mit — das war 2026-08 der Grund, die Idee zu
verwerfen. Siehe `lessons.md`.

**Nachweis:** `controls.mjs`, jetzt 23 Pruefungen. Die vier Achsenpruefungen
laufen unveraendert mit abgeschalteter Nachfuehrung (`fynnoxQa.setCameraFollow`),
Abschnitt 7 weist die Nachfuehrung eigens nach.

## Offen — Luecke 2: Gelaende ist eine einzige Ebene

`buildTerrain()` legt eine Box mit Oberkante y = 0 ueber die ganze Stadt.

**Verplante Flaechen (aus `acceptance.mjs`, duerfen ihre Hoehe NICHT aendern):**
Startpunkt (-26, -16); Block A ringsum bei (9,-19), (17,-28), (9,-37),
(1,6,-28); Garage (-30,-22) und (-36,-21,6); Ventile (-13,8, 23,4) und
(-8,2, 23,4); Werksdach (-4,8, 5,8, 13,2); Station (-6, 22,6); Terrasse
(-20, 24); Funken bei (2,12), (18,29), (10,36), (42,33); Missionsziel (10,22).

**Vorgesehener Zuschnitt:**
- Uferterrasse Ost auf +3,2 m: x 48..76, z -18..25 (heute leeres Gelaende).
- Senkplatz auf -1,6 m: x -46..-26, z 0..20 (heute leeres Gelaende).
- Geschosszahlen staffeln nur bei NEUEN Bauwerken. Block A, B und C bleiben bei
  `floors: 2` — die Parkourroute haengt an ihren Dachhoehen: Dachbruecke auf
  `a.height`, Sprungluecke zwischen `bb.height` und `c.height`.

**Rampen:** `CollisionWorld` kennt keine schraegen Flaechen. Eine barrierearme
Rampe ist deshalb eine Treppe mit 0,12 m Steigung auf 2,0 m Auftritt (6 Prozent,
weit unter `stepHeight = 0.35`), darueber ein gedrehter Sichtbelag wie in
`stairDressing()`.

## Offen — Luecke 3: Begehbare Welt endet bei 160 x 94 m

**Vorgesehen:** Gelaende nach Norden bis z = -96 verlaengern und dort eine
Hangstadt bauen — zwei Niveaus (+3,2 m ab z -46, +9,6 m ab z -70), verbunden
ueber Strassen, die selbst mit 6 Prozent steigen und in zwei Kehren ueber die
Breite laufen. So ist die Barrierefreiheit im Strassennetz enthalten und braucht
keinen eigenen Rampenturm; Treppen kommen als Abkuerzung dazu.

Von +9,6 m bei z = -70 geht der Blick ueber die Dachlinie (7,5 m bei z -34)
hinweg bis aufs Wasser — das ist die Bildkomposition aus
`03_Bildreferenzen/01_Gameplay/01_Freie_Stadterkundung.png`.

**Mitzuziehen:**
- `buildFacadeBuilding()` braucht ein `baseY` (heute baut es ab y = 0). Der
  lokale Helfer `wall()` deckt den groessten Teil ab; einzeln nachzuziehen sind
  `collisionAdd`, Dachplatte, `roofTop` und die `windowBox`-Aufrufe.
- `BAND.town` von -85 auf rund -115 zuruecknehmen, der Bodenkasten der
  Kulissenstadt entsprechend.
- Hinterlandkasten in `buildBackdrop()` (heute z -405..-55) nach hinten setzen,
  sonst liegt seine Wiese unter der neuen Stadt.
- Bundle beobachten: 845,9 kB roh von 900 kB.

## Offen — Optik

Referenz `01_Freie_Stadterkundung.png` gegen `shots/k-nord-dach.png`: es fehlen
vor allem Wolken am Himmel (`SkySystem` hat einen reinen Farbverlauf) und die
gestaffelte Dachlinie. Die Materialseite (Toon-Stufung, Warm-Kalt, Streiflicht,
Bloom, Grading) steht bereits und traegt.

---

# Nachtrag Abend 09.09.2026 — das Zielbild ist groesser als der Slice

Der Nutzer hat nach dem Spielen das Ziel vollstaendig ausgesprochen: eine
riesige, belebte Stadt im Massstab moderner Spiele, mit Tag und Nacht, Wetter,
befahrbaren Bergen — und Fynnox, der tauchen, schwimmen, fliegen, fahren,
snowboarden und skaten kann. Fahrzeugmodelle will er bei Bedarf selbst als
fertige 3D-Modelle beschaffen.

## Drei gemessene Ursachen, keine Vermutungen

**1. "Nicht glaenzend wie moderne Spiele."**
Die gesamte Welt lief auf `MeshLambertMaterial`. Lambert hat **keinen
Spiegelanteil** — kein Glanzlicht auf Asphalt, kein Schimmer auf Glas, kein
Metall. Sogar das geladene Fynnox-GLB wurde von PBR auf Lambert
heruntergestuft. Das ist der eigentliche Abstand zu einem modernen Spiel, nicht
die Geometrie.

*Am 09.09. umgestellt:* `Palette.mat()` liefert `MeshStandardMaterial`, Rauheit
und Metallanteil kommen aus der Tabelle `SURFACE`, nachgeschlagen ueber den
Farbwert (der `WorldBuilder` reicht Farben weiter, keine Schluessel). Die
Umgebungsspiegelung rechnet `SkySystem.refreshEnvironment()` aus einer 64x32
grossen Equirect-Karte in denselben Himmelsfarben — damit faerbt sich jede
Spiegelung mit der Tageszeit um, ohne die Szene ein zweites Mal zu rendern.
Der Toon-Patch stuft jetzt **nur den diffusen Anteil** ab; `totalSpecular`
bleibt ungebrochen, eine Treppung im Glanzlicht saehe nach Fehler aus.

**Noch nicht abgenommen** — weder optisch noch mit einer Suite. Rueckfall waere
`MeshPhongMaterial`: auch der hat Glanz, nur ohne Umgebungsspiegelung.

**2. "Es wird nie dunkel."**
`SkySystem.apply()` rechnet `angle = PI * phase`. Damit ist die Sonnenhoehe
immer >= 0 und die Intensitaet nie unter 0,5 — der "Tagbogen" laeuft von Morgen
bis Abend und springt zurueck. Strassenlaternen sind goldene Kisten ohne Licht;
in der ganzen Szene stehen zwei PointLights (Brunnen, Hafenprojekt).

**3. "Unfassbar klein."**
Nach dem Nordausbau 160 x 146 m begehbar. Von der Promenade bis zum Stadtrand
sind es 75 m. Der Eindruck ist die Messung.

## Reihenfolge fuer die naechsten Sitzungen

Zuerst `acceptance.mjs` fuer den bereits gebauten Stand — Hangstadt und PBR
sind gross genug, dass eine Regression wahrscheinlich ist.

1. PBR fertigstellen: Rauheitswerte pruefen, Bildrate messen, abnehmen.
2. Tag-Nacht-Zyklus mit echter Nacht, brennenden Laternen, leuchtenden Fenstern.
3. Wetter: Regen, Schnee Richtung Berge.
4. Weltgroesse: prozedurale Viertel auf rund 1 km. Geht nicht mehr als ein
   verschmolzenes Mesh — braucht Kachelung und Sichtweiten-Staffelung. Umbau,
   kein Anbau.
5. Berge begehbar und befahrbar statt Kulisse — zugleich die Snowboard-Region.
6. Belebte Stadt: Verkehr, mehr NPCs, fahrende Schiffe.
7. Fynnox' eigene Faehigkeiten: `fox_swim`, `fox_balance`, `fox_slide`,
   `fox_vault_safe` stehen seit Manifest v1.5 im Vertrag und kommen ausserhalb
   von `src/contracts/` **nirgends** vor. Wasser wirft Fynnox heute sofort ans
   Ufer zurueck — das Gegenteil von "tauchen koennen".
8. Fahrzeuge: Boot und Schiff fahren, Skateboard und Snowboard fehlen ganz.

Punkt 1 bis 3 aendern jeden Pixel, der schon da ist. Punkt 4 bis 6 fuegen mehr
vom Gleichen hinzu. Deshalb diese Reihenfolge.

## Sofort naechster Schritt: PBR ist doppelt beleuchtet

Der Umbau uebersetzt, laeuft und rendert — sieht aber **schlechter aus als
vorher**: flach, ausgewaschen, die Schatten sind fast verschwunden
(`shots/pbr-strasse.png`).

Ursache, gemessen am Code und nicht geraten: `scene.environment` speist bei
`MeshStandardMaterial` nicht nur `indirectSpecular`, sondern auch
`indirectDiffuse`. Das `HemisphereLight` in `SkySystem` (Intensitaet
0,45 + Hoehe x 0,5) war genau dafuer da, den fehlenden Umgebungsanteil von
Lambert auszugleichen. Beides zusammen ist doppeltes Fuellicht — der Kontrast
zwischen besonnt und beschattet, den 08/2026 bewusst auf rund 2:1 eingestellt
wurde, faellt damit auf nahezu 1:1.

**Fix in dieser Reihenfolge:**
1. `HemisphereLight` deutlich zuruecknehmen (Groessenordnung: auf ein Drittel),
   denn seine Aufgabe uebernimmt jetzt die Umgebungskarte.
2. Danach `ENV_INTENSITY` und `uSpecular` gegeneinander einstellen — erst wenn
   der Kontrast wieder steht, laesst sich beurteilen, ob der Glanz zu stark ist.
3. Erst dann Rauheitswerte in `SURFACE` feinjustieren.
4. Bildrate messen: PBR mit Umgebungskarte kostet spuerbar mehr als Lambert.
   Auf der niedrigen Detailstufe notfalls `scene.environment` abschalten.

Nicht committet. Der Baum uebersetzt und laeuft, ist aber optisch ein Rueckschritt.

---

# Nachtrag 17.09.2026 — Doppelbeleuchtung behoben, Bildrate gemessen

**Fix:** `HEMI_SHARE = 0.33` in `Sky.ts`. Das Hemisphaerenlicht liefert nur
noch ein Drittel, die Umgebungskarte traegt das Fuelllicht. Dazu rechnet
`setScannerMode()` die Karte neu — vorher spiegelte die Scanwelt den Taghimmel.

**Nachweis im A/B-Vergleich** (Commit 78f9cd5 als Worktree gegen den
Arbeitsbaum, identische Standorte): an Platz und Block stehen die Schatten jetzt
mindestens so kraeftig wie mit Lambert.

**Falle beim Pruefen:** `views/pbr.json` → `pbr-strasse` taugt NICHT zur
Kontrastbeurteilung. Die Sonne wirft die Hausschatten dort von der Strasse weg;
im Bild liegen nur Laternenstriche im Schatten. Ein Gegentest ganz ohne
Fuelllicht sah dort fast gleich aus und haette die (richtige) Diagnose beinahe
widerlegt. Kontrast an `(-20, 0.4, 10)` Blick 0.8 beurteilen — Baumschatten auf
Pflaster.

**Bildrate** (1280 x 780, echte GPU: Intel HD Graphics 0x0A16, D3D11):

| Stand | Platz | Strasse |
|---|---|---|
| 78f9cd5 (Lambert, ohne Hangstadt/Wolken) | 21,6 / 31,6 | 33,8 / 30,6 |
| Arbeitsbaum PBR | 24,7 / 25,0 / 22,6 | 22,7 / 25,2 / 25,0 |
| Arbeitsbaum PBR ohne `scene.environment` | 28,0 | 25,6 |

Rund 15–20 % Verlust fuer den gesamten neuen Stand, die Umgebungskarte davon
rund 10 %. Kein Abschalten auf der niedrigen Stufe noetig.
Headless-SwiftShader misst dasselbe als Faktor 2,5 bis 5 — fuer
Shaderkosten unbrauchbar. GPU-Messung: Chromium mit `headless: false` und
`--use-angle=d3d11`.

**Offen aus der Liste oben:** Punkt 2 (`ENV_INTENSITY` gegen `uSpecular`) und 3
(Rauheit) ergaben in den Aufnahmen keinen sichtbaren Fehler und bleiben
unveraendert.
