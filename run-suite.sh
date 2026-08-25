#!/bin/sh
# Preview-Server und Abnahme im selben Prozessbaum. Ein separat gestarteter
# Server hat in dieser Umgebung mehrfach mitten im Lauf aufgehoert - so lebt er
# genau so lange wie der Lauf, der ihn braucht.
PORT="${PORT:-4173}"
npx vite preview --port "$PORT" --strictPort --host 127.0.0.1 >/dev/null 2>&1 &
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
