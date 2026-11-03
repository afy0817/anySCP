#!/usr/bin/env bash
# Linux (Debian / Ubuntu 계열): 한국어 포크를 .deb 로 빌드해서 설치한다.
# 필요: Rust, Node 20 이상, pnpm, 아래 Tauri 시스템 패키지
set -euo pipefail
cd "$(dirname "$0")/.."

# Tauri 가 링크하는 라이브러리. 없으면 cargo 가 한참 돌다가 실패하므로 먼저 본다.
if ! pkg-config --exists webkit2gtk-4.1 libsoup-3.0 javascriptcoregtk-4.1 librsvg-2.0; then
  echo "빌드에 필요한 시스템 패키지가 없다. 먼저 설치:" >&2
  echo "  sudo apt-get install -y build-essential curl wget file pkg-config libssl-dev libxdo-dev \\" >&2
  echo "    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev" >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm tauri build --bundles deb

DEB=$(ls -t src-tauri/target/release/bundle/deb/*.deb | head -n 1)
pkill -x anyscp || true
sudo apt-get install -y --reinstall "./$DEB"
echo "설치 완료: $(basename "$DEB") ($(git rev-parse --short HEAD))"
