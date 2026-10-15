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
PATCH_ZIP="$OUTPUT_DIR/patch-v${NEW_VERSION}.zip"

mkdir -p "$OUTPUT_DIR"

cd "$ROOT_DIR"

# Determine previous version tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v1.0.0")
PREV_VERSION="${LAST_TAG#v}"

echo "=== Generating Delta Patch: v${PREV_VERSION} -> v${NEW_VERSION} ==="

# Stash uncommitted changes in git commit first if needed
if [ -n "$(git status --porcelain)" ]; then
    git add .
    git commit -m "feat(modpack): update files for v${NEW_VERSION} - ${CHANGELOG}"
fi

# Detect deleted files compared to previous release
DELETED_FILES=()
while IFS= read -r file; do
    if [ -n "$file" ] && [ "$file" != "manifest.json" ] && [[ "$file" != scripts/* ]]; then
        DELETED_FILES+=("$file")
    fi
done < <(git diff --name-only --diff-filter=D "$LAST_TAG" HEAD)

# Detect added / modified files compared to previous release
CHANGED_FILES=()
while IFS= read -r file; do
    if [ -n "$file" ] && [ -f "$file" ] && [ "$file" != "manifest.json" ] && [[ "$file" != scripts/* ]] && [[ "$file" != .github/* ]]; then
        CHANGED_FILES+=("$file")
    fi
done < <(git diff --name-only --diff-filter=AM "$LAST_TAG" HEAD)

if [ ${#CHANGED_FILES[@]} -eq 0 ] && [ ${#DELETED_FILES[@]} -eq 0 ]; then
    echo "No files modified or deleted since $LAST_TAG. Nothing to patch!"
    exit 0
fi

echo "Changed files to package (${#CHANGED_FILES[@]}):"
for f in "${CHANGED_FILES[@]}"; do
    echo "  + $f"
done

echo "Deleted files to remove on clients (${#DELETED_FILES[@]}):"
for f in "${DELETED_FILES[@]}"; do
    echo "  - $f"
done

# Build the patch zip
rm -f "$PATCH_ZIP"
TEMP_PATCH_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_PATCH_DIR"' EXIT

for f in "${CHANGED_FILES[@]}"; do
    DIR=$(dirname "$TEMP_PATCH_DIR/$f")
    mkdir -p "$DIR"
    cp "$ROOT_DIR/$f" "$TEMP_PATCH_DIR/$f"
done

(cd "$TEMP_PATCH_DIR" && zip -q -r "$PATCH_ZIP" .)

SHA256=$(sha256sum "$PATCH_ZIP" | awk '{print $1}')
PATCH_SIZE=$(du -h "$PATCH_ZIP" | awk '{print $1}')

echo "Patch archive created: $PATCH_ZIP ($PATCH_SIZE)"

# Update manifest.json using python helper
python3 - <<EOF
import json

manifest_path = "$MANIFEST_FILE"
with open(manifest_path, "r") as f:
    data = json.load(f)

data["latest_version"] = "$NEW_VERSION"

# Format deleted files list
deleted = json.loads('''$(printf '%s\n' "${DELETED_FILES[@]}" | jq -R . | jq -s .)''')

new_patch = {
    "from_version": "$PREV_VERSION",
    "to_version": "$NEW_VERSION",
    "url": f"https://github.com/JaviDaBomb/create-modpack/releases/download/v$NEW_VERSION/patch-v$NEW_VERSION.zip",
    "sha256": "$SHA256",
    "delete_files": deleted,
    "changelog": "$CHANGELOG"
}

# Append to patches list
data.setdefault("patches", []).append(new_patch)

with open(manifest_path, "w") as f:
    json.dump(data, f, indent=2)

print("Updated manifest.json with v$NEW_VERSION")
EOF

# Commit manifest and tag release
git add manifest.json
git commit -m "chore(release): bump manifest to v${NEW_VERSION}" || true
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
