#!/usr/bin/env bash
# Loads nvm (installed to ~/.nvm) then starts both frontend and backend.
# Usage: ./run.sh
# Or start them separately:
#   ./run.sh server   — backend only (port 3001)
#   ./run.sh dev      — frontend only (port 5173)

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if ! command -v npm &>/dev/null; then
  echo "Error: npm not found. Install Node.js via: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && nvm install 20"
  exit 1
fi

CMD="${1:-start}"
npm run "$CMD"
