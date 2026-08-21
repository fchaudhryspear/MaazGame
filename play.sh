#!/usr/bin/env sh
# Start MaazGame locally and open it in your browser.
#
#   ./play.sh          # serves on http://localhost:8000
#   ./play.sh 9000     # or pick your own port
#
# A plain static server is all the game needs — but it does need http://
# rather than file://, because ES modules and the service worker are both
# blocked on the file: protocol.
set -e

PORT="${1:-8000}"
URL="http://localhost:$PORT"
DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. Any static server works, e.g.:"
  echo "  npx serve $DIR"
  exit 1
fi

echo "MaazGame is running at $URL"
echo "Press Ctrl-C to stop."

# Open the default browser once the server is actually listening.
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"          # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" # Linux
  fi
) &

cd "$DIR"
exec python3 -m http.server "$PORT"
