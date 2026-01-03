#!/bin/bash

# Release script for OOT Foundry module
# Creates a zip file for GitHub release

set -e

if [ -z "$1" ]; then
    echo "Usage: ./release.sh <version>"
    echo "Example: ./release.sh 1.2.0"
    exit 1
fi

VERSION="$1"
MODULE_DIR="foundry-data/Data/modules/oot"
MODULE_JSON="$MODULE_DIR/module.json"
OUTPUT_FILE="module.zip"

echo "Creating release for OOT module v${VERSION}..."

# Update version in module.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$MODULE_JSON"

# Update download URL in module.json
sed -i '' "s|releases/download/[^/]*/module.zip|releases/download/${VERSION}/module.zip|" "$MODULE_JSON"

echo "Updated module.json with version ${VERSION}"

# Remove old zip if exists
rm -f "$OUTPUT_FILE"

# Create zip from inside module directory (files at root level)
cd "$MODULE_DIR"
zip -r "../../../../$OUTPUT_FILE" . -x "*.DS_Store"

cd ../../../..
echo "Created $OUTPUT_FILE"
echo "Ready to upload to GitHub release v${VERSION}"
