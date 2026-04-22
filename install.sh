#!/usr/bin/env bash
set -euo pipefail

REPO="darkkerest/therapy-assistant"
ASSET="Therapy-Assistant-mac-arm64.tar.gz"
APP_NAME="Therapy Assistant.app"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Therapy Assistant installer supports macOS only." >&2
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "This build is for Apple Silicon Macs (arm64)." >&2
  exit 1
fi

URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

echo "Downloading Therapy Assistant..."
curl -fsSL --retry 3 --retry-delay 1 -o "$TMP_DIR/$ASSET" "$URL"

echo "Installing into $INSTALL_DIR..."
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"

if [[ ! -d "$TMP_DIR/$APP_NAME" ]]; then
  echo "Release archive did not contain $APP_NAME." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"

if [[ -w "$INSTALL_DIR" ]]; then
  if [[ -d "$INSTALL_DIR/$APP_NAME" ]]; then
    rm -rf "$INSTALL_DIR/$APP_NAME"
  fi
  ditto "$TMP_DIR/$APP_NAME" "$INSTALL_DIR/$APP_NAME"
  xattr -cr "$INSTALL_DIR/$APP_NAME" 2>/dev/null || true
else
  echo "Need administrator permission to write to $INSTALL_DIR."
  if [[ -d "$INSTALL_DIR/$APP_NAME" ]]; then
    sudo rm -rf "$INSTALL_DIR/$APP_NAME"
  fi
  sudo ditto "$TMP_DIR/$APP_NAME" "$INSTALL_DIR/$APP_NAME"
  sudo xattr -cr "$INSTALL_DIR/$APP_NAME" 2>/dev/null || true
fi

echo "Opening Therapy Assistant..."
open "$INSTALL_DIR/$APP_NAME"

echo "Done."
