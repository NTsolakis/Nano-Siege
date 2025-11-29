#!/usr/bin/env bash
set -euo pipefail

# Simple one-shot deploy helper for Unraid.
# Copies backend code and public game files from the repo into the
# Unraid paths that your Docker container mounts:
#   Backend Code: /mnt/user/www/nano-siege-backend  -> /app
#   Game Path:    /mnt/user/www/nano-siege          -> /app/public
#
# Usage (run from repo root, e.g. on the Unraid box or a machine with
# the Unraid share mounted):
#   ./scripts/deploy-unraid.sh
# or
#   UNRAID_ROOT=/some/other/path ./scripts/deploy-unraid.sh
#
# NOTE: This script intentionally does NOT touch the persistent data
# share (/mnt/user/www/nano-siege-data) so your users.json / saves stay
# untouched.

ROOT="${UNRAID_ROOT:-/mnt/user/www}"
BACKEND_DIR="${ROOT%/}/nano-siege-backend"
PUBLIC_DIR="${ROOT%/}/nano-siege"

echo "Deploying Nano-Siege to Unraid"
echo "  Backend target: ${BACKEND_DIR}"
echo "  Public target:  ${PUBLIC_DIR}"
echo

# Ensure target directories exist.
mkdir -p "${BACKEND_DIR}" "${PUBLIC_DIR}"

echo "Syncing backend code..."
rsync -av --delete \
  server \
  package.json \
  "${BACKEND_DIR}/"

echo
echo "Syncing public game files..."
rsync -av --delete \
  index.html \
  styles.css \
  sandbox-config.js \
  src \
  data \
  "${PUBLIC_DIR}/"

echo
echo "Building local zip..."
ZIP_TARGET="${PUBLIC_DIR%/}/nano-siege-local.zip"
bash "$(dirname "$0")/build-local-zip.sh" "${ZIP_TARGET}" || echo "Local zip build skipped."

echo
echo "Deploy complete."
