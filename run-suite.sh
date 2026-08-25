#!/bin/sh
# Preview-Server und Abnahme im selben Prozessbaum. Ein separat gestarteter
# Server hat in dieser Umgebung mehrfach mitten im Lauf aufgehoert - so lebt er
# genau so lange wie der Lauf, der ihn braucht.
#
# Vite wird direkt aufgerufen, nicht ueber npx: npx ist nur ein Elternprozess,
# der den eigentlichen Server als Kind startet. Das `kill` am Ende traf dann den
# Wrapper, und der Server blieb auf dem Port zurueck. Beim naechsten Lauf
# scheiterte `--strictPort` still, curl fand aber den alten Server - der Lauf
# testete weiter, nur eben unter zwei konkurrierenden Servern und entsprechend
# langsam bis zum Timeout.
PORT="${PORT:-4173}"
./node_modules/.bin/vite preview --port "$PORT" --strictPort --host 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 1
done
SCRIPT="$1"
shift
node "$SCRIPT" ./shots "http://127.0.0.1:$PORT/" "$@"
STATUS=$?
kill $SERVER 2>/dev/null
exit $STATUS
