#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist-patches"
BASE_ZIP="$OUTPUT_DIR/base-v1.0.0.zip"

echo "=== Packaging Base Modpack v1.0.0 ==="
mkdir -p "$OUTPUT_DIR"
rm -f "$BASE_ZIP"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "[1/3] Assembling base directories..."
cp -r "$ROOT_DIR/mods" "$TEMP_DIR/"
cp -r "$ROOT_DIR/config" "$TEMP_DIR/"
[ -d "$ROOT_DIR/defaultconfigs" ] && cp -r "$ROOT_DIR/defaultconfigs" "$TEMP_DIR/"
[ -d "$ROOT_DIR/fancymenu_data" ] && cp -r "$ROOT_DIR/fancymenu_data" "$TEMP_DIR/"
[ -d "$ROOT_DIR/kubejs" ] && cp -r "$ROOT_DIR/kubejs" "$TEMP_DIR/"
[ -d "$ROOT_DIR/tacz" ] && cp -r "$ROOT_DIR/tacz" "$TEMP_DIR/"
[ -d "$ROOT_DIR/resourcepacks" ] && cp -r "$ROOT_DIR/resourcepacks" "$TEMP_DIR/"
[ -d "$ROOT_DIR/shaderpacks" ] && cp -r "$ROOT_DIR/shaderpacks" "$TEMP_DIR/"
[ -f "$ROOT_DIR/servers.dat" ] && cp "$ROOT_DIR/servers.dat" "$TEMP_DIR/"
[ -d "$ROOT_DIR/libraries" ] && cp -r "$ROOT_DIR/libraries" "$TEMP_DIR/"
[ -d "$ROOT_DIR/natives" ] && cp -r "$ROOT_DIR/natives" "$TEMP_DIR/"
[ -f "$ROOT_DIR/1.20.1.jar" ] && cp "$ROOT_DIR/1.20.1.jar" "$TEMP_DIR/"
[ -f "$ROOT_DIR/version.json" ] && cp "$ROOT_DIR/version.json" "$TEMP_DIR/"
[ -f "$ROOT_DIR/options.txt" ] && cp "$ROOT_DIR/options.txt" "$TEMP_DIR/"

echo "[2/3] Compressing base-v1.0.0.zip..."
(cd "$TEMP_DIR" && zip -q -r "$BASE_ZIP" .)

SHA256=$(sha256sum "$BASE_ZIP" | awk '{print $1}')
SIZE=$(du -h "$BASE_ZIP" | awk '{print $1}')

echo "[3/3] Base Package Ready!"
echo "File:   $BASE_ZIP ($SIZE)"
echo "SHA256: $SHA256"
