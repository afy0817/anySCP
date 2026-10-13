# anySCP 한국어 포크 (ko 브랜치)

- 원본: https://github.com/macnev2013/anySCP (MIT, © Nevil Macwan) — remote `upstream`
- 내 포크: git@github.com:afy0817/anySCP.git — remote `origin`
- 기준: v0.11.1 태그 위에 `ko` 브랜치
- 참고 브랜치 `ko-direct`: i18n 전에 문자열을 한국어로 직접 바꿨던 버전 (번역 원본으로 재사용)

## 바꾼 것
- **i18n (i18next + react-i18next)**: 설정 > 모양 > 인터페이스 > 언어 에서 English / 한국어 전환
  - `src/i18n/index.ts` 초기화, `src/i18n/locales/{en,ko}/<네임스페이스>.json`
  - 처음 실행 시 OS 언어를 따르고, 선택하면 설정 DB(`app_language`)와 localStorage 에 저장
  - `src/i18n/i18next.d.ts`: en 파일 기준으로 t() 키 타입 검사 → 없는 키는 tsc 에러
  - 테스트는 언어를 en 으로 고정(vitest.setup.ts) → 원본 테스트를 고치지 않고 통과
- **자동 업데이트 끔** (포크 전용): `updater-store.ts` 의 `UPDATES_DISABLED`,
  `tauri.conf.json` updater endpoints 비움 + `createUpdaterArtifacts: false`
  (원본 업데이터가 켜져 있으면 포크 빌드를 공식판으로 덮어씀)
- `tauri.conf.json`: version 0.11.1 고정, macOS ad-hoc 서명(`signingIdentity: "-"`)
- 백엔드(Rust) 에러 메시지는 원문 영어 그대로

## 검사
    pnpm exec tsc --noEmit
    pnpm exec vitest run
    node .ko/check-i18n.mjs      # en/ko 키·{{변수}} 일치

## 빌드·설치
    .ko/install.sh               # 빌드 후 /Applications/anySCP.app 교체 (첫 빌드 2분 정도)

## 원본 새 버전 따라가기
    git fetch upstream --tags
    git merge vX.Y.Z
    # 충돌: 원본이 바꾼 문구 줄 → 원본 변경을 반영하고 t() 키로 다시 감싸기
    # 원본에 새로 생긴 영어 문구 → en/ko json 에 키 추가 (tsc·check-i18n 으로 확인)
    # tauri.conf.json 의 version 을 새 버전으로
    pnpm exec tsc --noEmit && pnpm exec vitest run && node .ko/check-i18n.mjs
    .ko/install.sh

## 원본에 PR 로 보내려면
i18n 부분만(업데이터 끄기·tauri.conf 변경 제외) 별도 브랜치로 골라서 upstream 이슈 #127 에 PR.

## 공식판으로 되돌리기
GitHub 릴리스에서 `anySCP_<버전>_aarch64.dmg` 받아 /Applications 에 덮어쓰기
(공식판은 Developer ID 서명·공증됨).
