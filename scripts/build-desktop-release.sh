#!/usr/bin/env bash
set -euo pipefail

# Build matching desktop binaries (Linux AppImage + Windows exe +
# launchers) from the current repo state.
#
# Usage:
#   ./scripts/build-desktop-release.sh
#
# Assumes:
#   - You have already committed any code changes you want included.
#   - Git is configured with an origin remote.
#   - Wine is installed for the Windows build (electron-builder).

echo "== Nano-Siege desktop release build =="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Current branch: ${BRANCH}"

if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: working tree is not clean. Uncommitted changes will be included in this build."
fi

echo
echo "Pulling latest from origin/${BRANCH}..."
git pull --rebase origin "${BRANCH}" || true

echo
echo "Installing npm dependencies..."
npm install

echo
echo "Cleaning dist/ directory (old artifacts)..."
rm -rf dist/*

echo
echo "Building desktop game (version + patch notes + binaries)..."
bash ./scripts/build-game.sh

echo
echo "Building Electron launchers (independent launcher version)..."
bash ./scripts/build-launcher.sh

echo
echo "Desktop build complete. Artifacts in dist/:"
ls -1 dist
