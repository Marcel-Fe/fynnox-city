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
