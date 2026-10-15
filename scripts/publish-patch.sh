#!/usr/bin/env bash
set -e

NEW_VERSION="$1"
CHANGELOG="$2"

if [ -z "$NEW_VERSION" ] || [ -z "$CHANGELOG" ]; then
    echo "Usage: ./scripts/publish-patch.sh <NEW_VERSION> \"<CHANGELOG>\""
    echo "Example: ./scripts/publish-patch.sh 1.0.1 \"Added new voting mod and bugfixes\""
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist-patches"
MANIFEST_FILE="$ROOT_DIR/manifest.json"
INDEX_FILE="$ROOT_DIR/files_index.json"
PATCH_ZIP="$OUTPUT_DIR/patch-v${NEW_VERSION}.zip"
TEMP_DIFF_JSON="$OUTPUT_DIR/diff-v${NEW_VERSION}.json"

mkdir -p "$OUTPUT_DIR"
cd "$ROOT_DIR"

export GH_TOKEN="${GH_TOKEN:-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}"

echo "=== Computing Differential Changes for v${NEW_VERSION} ==="

python3 - <<EOF
import os, sys, json, hashlib

root = "$ROOT_DIR"
index_file = "$INDEX_FILE"
diff_file = "$TEMP_DIFF_JSON"
new_version = "$NEW_VERSION"
changelog = "$CHANGELOG"

# Load previous index
old_index = {}
if os.path.exists(index_file):
    with open(index_file, "r") as f:
        old_index = json.load(f)

# Directories and files to scan
dirs_to_index = ["mods", "config", "defaultconfigs", "fancymenu_data", "kubejs", "tacz", "resourcepacks", "shaderpacks"]
files_to_index = ["servers.dat", "options.txt"]

current_index = {}

for d in dirs_to_index:
    p = os.path.join(root, d)
    if os.path.exists(p):
        for r, ds, fs in os.walk(p):
            for f in fs:
                # Ignore temp/log files
                if f.endswith(".log") or f == ".DS_Store":
                    continue
                rel = os.path.relpath(os.path.join(r, f), root)
                h = hashlib.sha256()
                with open(os.path.join(r, f), "rb") as fp:
                    while chunk := fp.read(65536):
                        h.update(chunk)
                current_index[rel] = h.hexdigest()

for f in files_to_index:
    p = os.path.join(root, f)
    if os.path.exists(p):
        h = hashlib.sha256()
        with open(p, "rb") as fp:
            while chunk := fp.read(65536):
                h.update(chunk)
        current_index[f] = h.hexdigest()

# Detect deleted files (in old index but not in current)
deleted_files = [rel for rel in old_index if rel not in current_index]

# Detect changed/added files (in current index and either new or different hash)
changed_files = [rel for rel, h in current_index.items() if rel not in old_index or old_index[rel] != h]

print(f"Detected {len(changed_files)} added/modified files and {len(deleted_files)} removed files.")

with open(diff_file, "w") as f:
    json.dump({
        "changed": changed_files,
        "deleted": deleted_files,
        "new_index": current_index
    }, f, indent=2)

EOF

CHANGED_COUNT=$(jq '.changed | length' "$TEMP_DIFF_JSON")
DELETED_COUNT=$(jq '.deleted | length' "$TEMP_DIFF_JSON")

if [ "$CHANGED_COUNT" -eq 0 ] && [ "$DELETED_COUNT" -eq 0 ]; then
    echo "No files modified, added, or removed. Nothing to patch!"
    rm -f "$TEMP_DIFF_JSON"
    exit 0
fi

echo "Packaging $CHANGED_COUNT changed files into $PATCH_ZIP..."
rm -f "$PATCH_ZIP"
TEMP_PATCH_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_PATCH_DIR" "$TEMP_DIFF_JSON"' EXIT

# Copy changed files into temp archive directory
python3 - <<EOF
import os, json, shutil

diff_file = "$TEMP_DIFF_JSON"
root = "$ROOT_DIR"
temp_dir = "$TEMP_PATCH_DIR"

with open(diff_file, "r") as f:
    data = json.load(f)

for rel in data["changed"]:
    src = os.path.join(root, rel)
    dst = os.path.join(temp_dir, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
EOF

(cd "$TEMP_PATCH_DIR" && zip -q -r "$PATCH_ZIP" .)

SHA256=$(sha256sum "$PATCH_ZIP" | awk '{print $1}')
PATCH_SIZE=$(du -h "$PATCH_ZIP" | awk '{print $1}')

echo "Patch archive created: $PATCH_ZIP ($PATCH_SIZE)"
echo "SHA256: $SHA256"

# Determine previous version from manifest
PREV_VERSION=$(jq -r '.latest_version' "$MANIFEST_FILE")

echo "Updating manifest.json and files_index.json..."
python3 - <<EOF
import json

diff_file = "$TEMP_DIFF_JSON"
manifest_path = "$MANIFEST_FILE"
index_path = "$INDEX_FILE"
new_version = "$NEW_VERSION"
prev_version = "$PREV_VERSION"
sha256 = "$SHA256"
changelog = "$CHANGELOG"

with open(diff_file, "r") as f:
    diff_data = json.load(f)

with open(manifest_path, "r") as f:
    manifest = json.load(f)

manifest["latest_version"] = new_version

new_patch = {
    "from_version": prev_version,
    "to_version": new_version,
    "url": f"https://github.com/JaviDaBomb/create-modpack/releases/download/v{new_version}/patch-v{new_version}.zip",
    "sha256": sha256,
    "delete_files": diff_data["deleted"],
    "changelog": changelog
}

manifest.setdefault("patches", []).append(new_patch)

with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)

with open(index_path, "w") as f:
    json.dump(diff_data["new_index"], f, indent=2, sort_keys=True)

print(f"Successfully bumped manifest to v{new_version} from v{prev_version}")
EOF

echo "Committing manifest and index to Git..."
git add "$MANIFEST_FILE" "$INDEX_FILE"
[ -d config ] && git add config/ || true
[ -d fancymenu_data ] && git add fancymenu_data/ || true
[ -d defaultconfigs ] && git add defaultconfigs/ || true
[ -d kubejs ] && git add kubejs/ || true
[ -d tacz ] && git add tacz/ || true
[ -f servers.dat ] && git add servers.dat || true
[ -f options.txt ] && git add options.txt || true
[ -f .gitignore ] && git add .gitignore || true
[ -d scripts ] && git add scripts/ || true

git commit -m "chore(release): bump modpack to v${NEW_VERSION} - ${CHANGELOG}" || true
git tag -f "v${NEW_VERSION}"

echo "Pushing commit and tag to GitHub..."
git push origin main
git push origin "v${NEW_VERSION}" --force

echo "Creating GitHub Release and uploading patch asset..."
mise exec -- gh release create "v${NEW_VERSION}" "$PATCH_ZIP" \
    --repo JaviDaBomb/create-modpack \
    --title "Create Modpack v${NEW_VERSION}" \
    --notes "$CHANGELOG"

echo "=== Release v${NEW_VERSION} Published Successfully! ==="
