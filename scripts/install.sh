#!/usr/bin/env bash
# Install or upgrade Mica on macOS.
#
# Usage:
#   curl -fsSL https://github.com/sreeragh-s/mica/releases/latest/download/install.sh | bash
#
# Why this exists: the GitHub-hosted DMG isn't notarized with Apple, so a browser
# download triggers macOS Gatekeeper's "app is damaged" warning. This script
# downloads the same artifact via curl (no quarantine attribute) and copies the
# .app into /Applications, then strips quarantine as a belt-and-suspenders.

set -euo pipefail

REPO="sreeragh-s/mica"
APP_NAME="mica.app"
INSTALL_DIR="/Applications"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is macOS-only." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64)  ARCH="arm64" ;;
  x86_64) ARCH="x86_64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# Optional first arg pins a specific version (e.g. "v0.1.3"). Falls back to latest.
TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "Resolving the latest Mica release..."
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -m1 '"tag_name"' \
    | sed -E 's/.*"([^"]+)".*/\1/' \
    | tr -d '"')
  if [ -z "${TAG:-}" ]; then
    echo "Could not resolve the latest release. Is the network up?" >&2
    exit 1
  fi
else
  case "$TAG" in v*) ;; *) TAG="v${TAG}" ;; esac
fi

VERSION="${TAG#v}"
ASSET="mica_${VERSION}_${ARCH}.app.tar.gz"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

echo "Installing Mica ${TAG} (${ARCH})..."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "${TMP}/${ASSET}"
tar -xzf "${TMP}/${ASSET}" -C "$TMP"

if [ ! -d "${TMP}/${APP_NAME}" ]; then
  echo "Extracted archive did not contain ${APP_NAME}." >&2
  exit 1
fi

if [ -d "${INSTALL_DIR}/${APP_NAME}" ]; then
  echo "Replacing existing install at ${INSTALL_DIR}/${APP_NAME}..."
  rm -rf "${INSTALL_DIR}/${APP_NAME}"
fi

mv "${TMP}/${APP_NAME}" "${INSTALL_DIR}/"
xattr -cr "${INSTALL_DIR}/${APP_NAME}" 2>/dev/null || true

echo ""
echo "✓ Installed Mica ${TAG} → ${INSTALL_DIR}/${APP_NAME}"
echo ""
echo "Launch with:"
echo "  open '${INSTALL_DIR}/${APP_NAME}'"
