# Lektionen

Korrekturen durch den Nutzer, mit Ursache statt nur Fix.

## 2026-08-19 — Steuerungsachsen: 102 gruene Pruefungen und trotzdem falsch herum

**Meldung:** Fynnox laeuft beim Vorwaertsgehen nach hinten, links und rechts
sind vertauscht; beim Auto genauso.

**Ursache:** Drei Fehler, eine gemeinsame Wurzel — die Welt kennt zwei
Vorwaertsachsen. Figurenmodelle sind mit der Schnauze nach **+Z** gebaut,
Fahrzeuge folgen der Paketkonvention **Vorderseite nach −Z**. Nirgends wurde
zwischen beiden umgerechnet.

1. `OrbitCameraRig.getPlanarBasis` bildete "rechts" mit vertauschten Vorzeichen
   und lieferte damit eine linkshaendige Basis.
2. Der `BoardingController` schrieb die Fahrzeugausrichtung ungerechnet auf die
   Figur — Fynnox sass in allen vier Fahrzeugen rueckwaerts.
3. Die Kamera behielt beim Einsteigen den Blickwinkel des Fussgaengers. Weil man
   von vorn auf ein Fahrzeug zulaeuft, sah man ihm danach entgegen: Gas fuhr
   scheinbar rueckwaerts, die Lenkung spiegelte.

**Warum keine Abnahme das gefunden hat:** Die drei bestehenden Suiten pruefen
Zustandsketten, Entfernungen und Verweigerungen. Alle diese Werte stimmen auch
dann, wenn die Figur rueckwaerts im Sitz haengt und A und D vertauscht sind.
Es fehlte die Klasse von Pruefung, die **Richtungen gegen die Kamera** misst.

**Lektion:** Eine Abnahme, die nur Zustaende vergleicht, deckt keine
Vorzeichenfehler auf. Wo zwei Konventionen aufeinandertreffen, muss die
Umrechnung als benannte Konstante an der Stelle stehen, an der die Konvention
entsteht (`FACING_OFFSET` in `FynnoxModel.ts`) — und es braucht eine Suite, die
die Wahrnehmung misst, nicht den Zustand (`controls.mjs`).

**Folgefund derselben Suche:** Die Verfolgerkamera hing beim Scout auf 3,55 m
statt 9 m, weil `THREE.Ray.intersectBox` bei einem Ursprung *innerhalb* der Box
den Austrittspunkt liefert und der Blickpunkt in der eigenen Fahrzeugbox liegt.
Ein Fehler, der nur beim Spielen auffaellt — und deshalb erst durch die
Nutzermeldung ins Licht kam.

## 2026-09-09 — Verstreute Zahlen sind stille Annahmen

Drei Fehler an einem Tag, alle mit derselben Wurzel: eine Annahme stand nicht
als benannte Groesse im Code, sondern verteilt in Zahlen, die niemand
nebeneinander sah.

**1. Zeit.** Die Abnahmen warteten in Millisekunden, die Spielzeit haengt aber
an gerechneten Bildern (`Game.update` deckelt das Delta auf 0,05 s). Auf einer
Vier-Kern-Maschine mit 0,38 Bildern pro Sekunde wurden aus 90 s Wartezeit
34 Bilder und damit 1,7 s Spielzeit; die Boarding-Kette braucht allein 1,55 s.
Vier Pruefungen fielen aus und sahen nach einer frischen Regression durch die
neue Kulisse aus. Gemessen kostete die Kulisse nichts (0,38 zu 0,39 Bilder pro
Sekunde) — der Verdacht war rein durch die Reihenfolge der Ereignisse entstanden.

**2. Tiefe.** Die Kulisse hatte ihre Staffelung in vier Schleifen mit je eigenen
z-Werten. Huegel bei -98 und -132 wuchsen deshalb mitten durch eine
Kulissenstadt, die von -82 bis -208 reichte. Dazu misst eine Kuppe mit 120 m
Radius auch in der Tiefe 120 m — eine Groesse, die in keiner der Zahlen stand.

**3. Belegte Flaechen.** Beim Moeblieren der Vorzone landete ein Cafe-Tisch im
Einstieg der Parkourroute. Dass dieser Streifen frei bleiben muss, stand als
Prosa-Kommentar zwei Funktionen weiter oben ("Block A bleibt frei — dort steht
der Containerstapel").

**Lektion:** Wo mehrere Stellen dieselbe raeumliche oder zeitliche Annahme
teilen, gehoert sie als benannte Groesse an eine Stelle, an der man sie beim
Aendern sieht — `BAND` fuer die Tiefenstufen, `PARKOUR_ENTRY` fuer die
Sperrzone, `BENCH_SPOTS` fuer die Baenke, Budgets in Bildern statt in
Millisekunden. Ein Kommentar an anderer Stelle erfuellt das nicht: er wird
gelesen, wenn man die Stelle ohnehin schon gefunden hat.

**Zweite Lektion:** Wenn nach einer Aenderung Pruefungen ausfallen, ist die
Aenderung erst der *Verdaechtige*, nicht die Ursache. Fuenf Minuten Messung
(mit und ohne) haetten hier eine halbe Stunde Suche in der falschen Richtung
gespart.
