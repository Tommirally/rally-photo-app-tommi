#!/usr/bin/env bash
# Starts a throwaway Postgres 16 for the database tests (no Docker needed).
#   scripts/local-db.sh start   -> postgres://postgres@127.0.0.1:54322/postgres
#   scripts/local-db.sh stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.local-stack/pg"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT:-54322}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(runuser -u postgres --); fi

case "${1:-start}" in
  start)
    mkdir -p "$ROOT/.local-stack"
    if [ ! -f "$DATA/PG_VERSION" ]; then
      mkdir -p "$DATA"
      [ "$(id -u)" = "0" ] && chown -R postgres "$DATA"
      "${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
    fi
    if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PORT" -q; then
      "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/server.log" -w start >/dev/null
    fi
    echo "postgres://postgres@127.0.0.1:$PORT/postgres"
    ;;
  stop)
    "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null || true
    ;;
  *) echo "usage: $0 start|stop" >&2; exit 1 ;;
esac
