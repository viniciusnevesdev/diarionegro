#!/bin/sh
PORT="${1:-8080}"
echo "Diário Negro — servidor local"
echo "Abra no Safari: http://localhost:$PORT"
python3 -m http.server "$PORT" --bind 127.0.0.1
