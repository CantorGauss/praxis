#!/bin/bash
#
# Builds a minimal macOS launcher. The bundle contains neither the frontend nor
# the Tauri binary: it points at this project and starts `npm run tauri dev`.
#
# Usage: ./scripts/build-app.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$PROJECT_DIR/Praxis.app"
STAGING_DIR="$(mktemp -d /private/tmp/praxis-launcher.XXXXXX)"
STAGED_APP="$STAGING_DIR/Praxis.app"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGED_APP/Contents/MacOS" "$STAGED_APP/Contents/Resources"
cp "$PROJECT_DIR/scripts/praxis-launcher.sh" \
  "$STAGED_APP/Contents/MacOS/PraxisLauncher"
chmod 755 "$STAGED_APP/Contents/MacOS/PraxisLauncher"
cp "$PROJECT_DIR/launcher/Info.plist" "$STAGED_APP/Contents/Info.plist"
cp "$PROJECT_DIR/src-tauri/icons/icon.icns" \
  "$STAGED_APP/Contents/Resources/icon.icns"
printf '%s\n' "$PROJECT_DIR" >"$STAGED_APP/Contents/Resources/project-path"

plutil -lint "$STAGED_APP/Contents/Info.plist" >/dev/null

# La cible est entièrement générée par ce script et strictement bornée au
# bundle attendu à la racine du projet.
if [ -e "$APP_DIR" ]; then
  rm -rf "$APP_DIR"
fi
mv "$STAGED_APP" "$APP_DIR"

echo "Créé : $APP_DIR"
echo "Ce bundle est un lanceur ; le code reste dans $PROJECT_DIR."
echo "Au double-clic, il démarre npm run tauri dev sans ouvrir de Terminal."
