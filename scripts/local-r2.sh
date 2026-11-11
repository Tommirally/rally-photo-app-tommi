#!/usr/bin/env bash
# Starts moto, an S3-compatible emulator, standing in for Cloudflare R2 in
# the storage tests. It does NOT check request signatures, so the tests
# also verify every upload on the server side.
#   scripts/local-r2.sh start   -> http://127.0.0.1:54340
#   scripts/local-r2.sh stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.local-stack/venv"
PORT="${R2_EMULATOR_PORT:-54340}"
case "${1:-start}" in
  start)
    if [ ! -x "$VENV/bin/moto_server" ]; then
      python3 -m venv "$VENV"
      "$VENV/bin/pip" install -q "moto[server]==5.2.5" "pillow==13.0.0"
    fi
    if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
      nohup "$VENV/bin/moto_server" -H 127.0.0.1 -p "$PORT" > "$ROOT/.local-stack/moto.log" 2>&1 &
      for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.25; done
    fi
    echo "http://127.0.0.1:$PORT"
    ;;
  stop) pkill -f "moto_server -H 127.0.0.1 -p $PORT" || true ;;
  *) echo "usage: $0 start|stop" >&2; exit 1 ;;
esac
