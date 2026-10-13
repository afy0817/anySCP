#!/bin/zsh
# 한국어 포크를 빌드해서 /Applications/anySCP.app 을 교체한다.
set -euo pipefail
cd "${0:A:h}/.."

mise exec rust -- pnpm install --frozen-lockfile
mise exec rust -- pnpm tauri build --bundles app

APP=src-tauri/target/release/bundle/macos/anySCP.app
osascript -e 'tell application "anySCP" to quit' 2>/dev/null || true
sleep 1
rm -rf /Applications/anySCP.app
ditto "$APP" /Applications/anySCP.app
echo "설치 완료: $(defaults read /Applications/anySCP.app/Contents/Info.plist CFBundleShortVersionString) ($(git rev-parse --short HEAD))"
