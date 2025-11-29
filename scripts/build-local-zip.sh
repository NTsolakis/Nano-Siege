#!/usr/bin/env bash
set -euo pipefail

# Build a self-contained Nano‑Siege local zip.
# Default output is ./nano-siege-local.zip, or you can pass a full
# path as $1 (used by deploy-unraid.sh to drop into the public dir).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_PATH="${1:-${REPO_ROOT}/nano-siege-local.zip}"
OUT_BASENAME="$(basename "${OUT_PATH}")"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip command not found; skipping local zip build" >&2
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

APP_DIR="${TMP_DIR}/nano-siege-local"
mkdir -p "${APP_DIR}"

cd "${REPO_ROOT}"

# Copy the static game files used by the browser version.
cp index.html styles.css sandbox-config.js "${APP_DIR}/"
cp -r src data "${APP_DIR}/"

cat > "${APP_DIR}/README-local.txt" <<EOF
Nano‑Siege local build
======================

To play locally, extract this zip somewhere on your machine and open
the included index.html in a modern browser (Chrome/Firefox/Edge).

Note: the local build currently plays without online login/leaderboards.
Use the "Check for Updates" button on the main menu to download a
fresh copy from the hosted server.
EOF

cd "${TMP_DIR}"
zip -r "${OUT_BASENAME}" "nano-siege-local" >/dev/null
mv "${OUT_BASENAME}" "${OUT_PATH}"

echo "Built local zip at: ${OUT_PATH}"

