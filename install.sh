#!/usr/bin/env bash
set -euo pipefail

REPO="darkkerest/therapy-assistant"
ASSET="Therapy-Assistant-mac-arm64.tar.gz"
APP_NAME="Therapy Assistant.app"
DEFAULT_INSTALL_DIR="$HOME/Applications"
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

tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"

if [[ ! -d "$TMP_DIR/$APP_NAME" ]]; then
  echo "Release archive did not contain $APP_NAME." >&2
  exit 1
fi

declare -a INSTALL_DIRS=()
if [[ -n "${INSTALL_DIR:-}" ]]; then
  INSTALL_DIRS+=("$INSTALL_DIR")
else
  if [[ -d "$HOME/Applications/$APP_NAME" ]]; then
    INSTALL_DIRS+=("$HOME/Applications")
  fi
  if [[ -d "/Applications/$APP_NAME" ]]; then
    INSTALL_DIRS+=("/Applications")
  fi
  if [[ ${#INSTALL_DIRS[@]} -eq 0 ]]; then
    INSTALL_DIRS+=("$DEFAULT_INSTALL_DIR")
  fi
fi

echo "Closing Therapy Assistant if it is running..."
osascript -e 'tell application "Therapy Assistant" to quit' >/dev/null 2>&1 || true
sleep 1
pkill -f '/Therapy Assistant\.app/Contents/MacOS/therapy-assistant' >/dev/null 2>&1 || true
pkill -f '/Therapy Assistant\.app/Contents/Resources/resources/therapy-parakeet-helper' >/dev/null 2>&1 || true

install_into() {
  local install_dir="$1"
  local target="$install_dir/$APP_NAME"

  echo "Installing into $install_dir..."
  mkdir -p "$install_dir" 2>/dev/null || true

  if [[ -w "$install_dir" ]]; then
    rm -rf "$target"
    ditto "$TMP_DIR/$APP_NAME" "$target"
    xattr -cr "$target" 2>/dev/null || true
  else
    echo "Need administrator permission to write to $install_dir."
    sudo mkdir -p "$install_dir"
    sudo rm -rf "$target"
    sudo ditto "$TMP_DIR/$APP_NAME" "$target"
    sudo xattr -cr "$target" 2>/dev/null || true
  fi

  if command -v /usr/libexec/PlistBuddy >/dev/null 2>&1; then
    local version
    version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$target/Contents/Info.plist" 2>/dev/null || true)"
    if [[ -n "$version" ]]; then
      echo "Installed version: $version"
    fi
  fi
}

for dir in "${INSTALL_DIRS[@]}"; do
  install_into "$dir"
done

OPEN_DIR="${INSTALL_DIRS[0]}"

echo "Opening Therapy Assistant..."
open "$OPEN_DIR/$APP_NAME"

echo "Done."
