#!/usr/bin/env bash
# Build the macOS Swift sidecars used for meeting transcription.
#
# Output:
#   src-tauri/binaries/notelab-mic-capture-<host-triple>
#   src-tauri/binaries/notelab-system-capture-<host-triple>
#
# Tauri's `bundle.externalBin` mechanism locates sidecars by appending the host
# Rust target triple to the configured base name. Run this script once before
# `npm run tauri dev` (or whenever the Swift sources change).
#
# macOS-only. The system-audio sidecar requires macOS 14.4+ at runtime, but the
# build itself only needs the Xcode 15+ Swift toolchain.

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Sidecar build skipped: meeting transcription is macOS-only." >&2
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/native"
OUT_DIR="${SCRIPT_DIR}/binaries"
ENTITLEMENTS="${SCRIPT_DIR}/entitlements/sidecar.entitlements"

mkdir -p "${OUT_DIR}"

TRIPLE="$(rustc -vV | awk '/host:/ {print $2}')"
if [[ -z "${TRIPLE}" ]]; then
  echo "Failed to detect host Rust target triple via 'rustc -vV'." >&2
  exit 1
fi

build_sidecar() {
  local source="$1"
  local base_name="$2"
  local out_path="${OUT_DIR}/${base_name}-${TRIPLE}"

  echo "[sidecars] Building ${base_name} -> ${out_path}"
  swiftc -O \
    -parse-as-library \
    -target "$(uname -m)-apple-macosx14.4" \
    -framework AVFoundation \
    -framework AudioToolbox \
    -framework CoreAudio \
    -o "${out_path}" \
    "${source}"

  # Ad-hoc sign with hardened runtime + entitlements so the OS allows audio
  # capture in dev. Replace "-" with your Developer ID for distribution.
  if [[ -f "${ENTITLEMENTS}" ]]; then
    codesign --force --sign - --options runtime --entitlements "${ENTITLEMENTS}" "${out_path}"
  else
    codesign --force --sign - --options runtime "${out_path}"
  fi
}

build_sidecar "${SRC_DIR}/MicrophoneCaptureCLI.swift" "notelab-mic-capture"
build_sidecar "${SRC_DIR}/SystemAudioCaptureCLI.swift" "notelab-system-capture"

echo "[sidecars] Done."
