#!/bin/bash

# Release script for OOT Foundry module
# Creates a zip file for GitHub release

set -e

MODULE_DIR="foundry-data/Data/modules/oot"
VERSION=$(grep -o '"version": "[^"]*"' "$MODULE_DIR/module.json" | cut -d'"' -f4)
OUTPUT_FILE="oot-v${VERSION}.zip"

echo "Creating release for OOT module v${VERSION}..."

# Remove old zip if exists
rm -f "$OUTPUT_FILE"

# Create zip from module directory
cd foundry-data/Data/modules
zip -r "../../../$OUTPUT_FILE" oot -x "*.DS_Store"

cd ../../..
echo "Created $OUTPUT_FILE"
echo "Ready to upload to GitHub release v${VERSION}"
