#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER_DIR="$ROOT/swift-helper"
RESOURCE_DIR="$ROOT/src-tauri/resources"

if ! command -v swift >/dev/null 2>&1; then
  echo "Swift toolchain is required to build the local Parakeet helper." >&2
  echo "Install Xcode Command Line Tools: xcode-select --install" >&2
  exit 1
fi

swift build --package-path "$HELPER_DIR" -c release

mkdir -p "$RESOURCE_DIR"
cp "$HELPER_DIR/.build/release/parakeet-helper" "$RESOURCE_DIR/therapy-parakeet-helper"
cp "$HELPER_DIR/.build/release/parakeet-helper" "$RESOURCE_DIR/parakeet-helper"
chmod +x "$RESOURCE_DIR/therapy-parakeet-helper" "$RESOURCE_DIR/parakeet-helper"

echo "Built local Parakeet helper into $RESOURCE_DIR"
