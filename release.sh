#!/bin/bash

# Release script for OOT Foundry module (mirror of release.ps1)
# Increments the minor version, zips the module, commits, tags, pushes
# and creates the GitHub release.
# Usage: ./release.sh [version]   (version defaults to current minor + 1)

set -euo pipefail

MODULE_DIR="foundry-data/Data/modules/oot"
MODULE_JSON="$MODULE_DIR/module.json"
OUTPUT_FILE="module.zip"

CURRENT=$(jq -r '.version' "$MODULE_JSON")
if [ -n "${1:-}" ]; then
    VERSION="$1"
else
    MAJOR="${CURRENT%%.*}"
    MINOR="${CURRENT#*.}"
    VERSION="${MAJOR}.$((MINOR + 1))"
fi

echo "Creating release for OOT module ${VERSION} (was ${CURRENT})..."

# Update version and download URL in module.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$MODULE_JSON"
sed -i '' "s|releases/download/[^/]*/module.zip|releases/download/${VERSION}/module.zip|" "$MODULE_JSON"
echo "Updated module.json with version ${VERSION}"

# Create zip with module contents at root
rm -f "$OUTPUT_FILE"
(cd "$MODULE_DIR" && zip -qr "$OLDPWD/$OUTPUT_FILE" . -x "*.DS_Store")
echo "Created $OUTPUT_FILE"

# Commit, tag, and push
git add "$MODULE_JSON"
git commit -m "${VERSION}"
git tag "${VERSION}"
git push
git push origin "${VERSION}"
echo "Pushed commit and tag ${VERSION}"

# Create GitHub release and upload assets
gh release create "${VERSION}" "$OUTPUT_FILE" "$MODULE_JSON" \
    --title "${VERSION}" \
    --notes "Release ${VERSION}"
echo "GitHub release ${VERSION} created with module.zip and module.json"
