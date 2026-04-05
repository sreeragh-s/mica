#!/usr/bin/env bash
# Re-sign the built .app with a single ad-hoc identity (deep).
# Use if an existing install crashes with Electron Framework Team ID mismatch.
set -euo pipefail
ROOT="${1:-dist}"
APP="$(find "$ROOT" -name 'notelab.io.app' -maxdepth 5 -print -quit 2>/dev/null || true)"
if [[ -z "$APP" ]]; then
  echo "No notelab.io.app under ${ROOT}. Run: npm run build:unpack   (or build:mac)" >&2
  exit 1
fi
echo "Re-signing (ad-hoc, deep): $APP"
codesign --deep --force --sign - "$APP"
echo "OK. Try opening this bundle, or copy it to /Applications again."
