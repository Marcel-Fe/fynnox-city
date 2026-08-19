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
