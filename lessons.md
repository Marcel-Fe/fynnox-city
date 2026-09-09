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

## 2026-09-09 — Eine verworfene Idee war nur falsch begruendet

**Meldung (zum zweiten Mal, erstmals 19.08.):** "Ich sehe nicht, wo ich
hinlaufe. Wenn ich mich umdrehe, sehe ich nicht, was vor mir ist."

**Was 2026-08 passierte:** Die Ursache wurde in der Zeigersteuerung gesucht und
mit Pointer Lock beantwortet. Eine nachfuehrende Kamera wurde ausdruecklich
verworfen — mit der Begruendung, sie koenne bei kamerarelativer Steuerung nicht
funktionieren, weil das Nachfuehren die Figur mitdreht.

**Warum das nur halb stimmte:** Die Begruendung ist fuer die naive Fassung
richtig. Die Bewegungsrichtung stammt aus dem Kamerayaw; dreht die Nachfuehrung
den yaw, dreht sich die Laufrichtung mit, das Ziel wandert genauso schnell mit,
und die Figur laeuft im Kreis. Gerechnet: laeuft man rueckwaerts, ist der
Zielwinkel immer genau eine halbe Drehung entfernt — die Kamera holt nie auf.

Die Loesung liegt nicht in einer schwaecheren Daempfung, sondern in einer
zweiten Groesse: `OrbitCameraRig.followOffset` haelt fest, wie viel vom yaw die
Nachfuehrung beigesteuert hat, und `getPlanarBasis()` rechnet ihn wieder heraus.
Die Kamera schwenkt, die Laufrichtung in der Welt bleibt stehen, die Figur laeuft
geradeaus weiter. Der Kreis ist damit aufgetrennt, nicht gedaempft.

**Der Fehler beim ersten Versuch:** Der Offset wurde zurueckgesetzt, sobald die
GESCHWINDIGKEIT unter die Schwelle fiel. Ein Bordstein reicht dafuer. Mitten im
Lauf sprang die Bewegungsbasis um den bereits nachgefuehrten Winkel, und die
Figur lief seitlich weg — 3,3 m quer statt 10 m geradeaus, gemessen von der
neuen Pruefung "Nachfuehrung dreht die Laufrichtung nicht mit". Der Rueckfall
gehoert an den STICK: solange nichts gedrueckt ist, gibt es keine Richtung, die
verdreht werden koennte.

**Lektion:** Eine verworfene Idee traegt ihre Begruendung mit. Steht dieselbe
Meldung ein zweites Mal da, ist zuerst die BEGRUENDUNG zu pruefen, nicht die
Idee — hier galt sie nur fuer die eine Fassung, an die damals gedacht wurde.

**Zweite Lektion:** Eine Zustandsgroesse, die eine Rueckkopplung auftrennt, darf
nur an der Stelle zurueckgesetzt werden, an der ihr Sprung folgenlos ist. Wo sie
zurueckgesetzt wird, ist genauso wichtig wie, wie stark sie wirkt.

**Dritte Lektion, aus derselben Sitzung:** Die neue Pruefung stand zuerst am
ENDE von `controls.mjs` — und dort sitzt Fynnox seit Abschnitt 2 im Auto. Sie
mass also das Fahrzeug statt die Figur zu Fuss und meldete einen Fehler, den es
im Code nicht gab. Zwei Laeufe lieferten bis auf die letzte Stelle dieselben
Zahlen; genau das war der Hinweis, dass nicht die Aenderung dazwischen wirkte,
sondern der Zustand davor. Eine Suite ohne Ruecksetzpunkte ist eine Kette:
wer hinten anhaengt, erbt alles, was vorne passiert ist.
