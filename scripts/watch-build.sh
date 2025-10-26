#!/usr/bin/env bash
set -euo pipefail

dir="$(dirname "$0")/.."

if ! command -v chokidar >/dev/null 2>&1; then
  echo "Please install chokidar-cli globally (npm install -g chokidar-cli) or add it to devDependencies."
  exit 1
fi

echo "Watching $dir/src for changes..."
chokidar "$dir/src" -c "npm run build"
