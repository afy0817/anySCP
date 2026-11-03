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
설치할 OS 에서 저장소를 받아 그 OS 스크립트 하나로 빌드하고 설치한다.

    .ko/install-mac.sh           # macOS: /Applications/anySCP.app 교체 (첫 빌드 2분 정도)
    .ko/install-linux.sh         # Debian / Ubuntu: .deb 로 빌드해서 apt 로 설치 (sudo 필요)
    powershell -ExecutionPolicy Bypass -File .ko\install-windows.ps1
                                 # Windows: NSIS 설치 파일을 조용히 실행 (사용자 단위 설치, 관리자 권한 불필요)

준비물은 Rust, Node 20 이상, pnpm. Linux 는 Tauri 시스템 패키지가 더 필요한데 없으면 스크립트가 설치 명령을 알려준다.
Windows 는 Visual Studio C++ 빌드 도구(MSVC)가 필요하다. macOS 스크립트는 cargo 를 `mise exec rust --` 로 찾는다.

설치 없이 빌드 결과물만 필요하면 GitHub Actions 의 `ko build (Windows / Linux)` 워크플로(`.github/workflows/ko-build.yml`)를 쓴다.
`ko-v*` 태그를 푸시하면 실행되고, 끝나면 그 태그로 GitHub Release 를 만들어 Linux `.deb` 와 Windows 설치 파일 `*-setup.exe` 를 올린다.
실행 페이지의 Artifacts 에도 남는다 (`anySCP-ko-windows-x64`: `*-setup.exe`, `anySCP-ko-linux-x64`: `.deb` / `.AppImage`).

    git tag ko-v0.11.1-3 && git push origin ko-v0.11.1-3   # 버전-빌드번호, 태그마다 Release 하나

Run workflow 버튼은 기본 브랜치(main)에 있는 워크플로만 실행하므로 `ko` 에만 있는 이 워크플로는 태그로 돌린다.
`v*` 태그는 원본 release 워크플로를 돌리므로 포크에서는 쓰지 않는다.

### Windows 에서 처음 실행할 때 경고가 뜨면
코드 서명 전 빌드는 "Windows의 PC 보호" 창이 뜬다. **추가 정보 › 실행**을 누른다.
- Windows 11 의 **스마트 앱 컨트롤**(Windows 보안 › 앱 및 브라우저 컨트롤)이 켜져 있으면 서명 없는 설치 파일을 막을 수 있다.
  앱 하나만 허용하는 방법이 없어서, 서명된 빌드를 쓰거나 스마트 앱 컨트롤을 꺼야 한다.
  Windows 버전에 따라 한 번 끄면 다시 설치하기 전에는 켤 수 없으니 끌지는 직접 판단한다.
- 서명이 붙었는지는 설치 파일 · `anyscp.exe` 속성 › **디지털 서명**에 'SignPath Foundation' 이 있는지로 본다.
- 직접 빌드한 파일(`.ko/install-windows.ps1`)은 인터넷에서 받은 표시가 없어서 이 경고가 뜨지 않는다.

### Windows 코드 서명 (SignPath)
GodseonSync 와 같은 방식이다. 워크플로가 `anyscp.exe` 를 먼저 빌드해 서명 요청하고, 서명된 exe 로 설치 파일을 만든 뒤
설치 파일을 한 번 더 서명 요청한다. 요청마다 SignPath 에서 승인해야 빌드가 이어진다(최대 1시간 대기).
저장소에 아래 값이 없으면 서명 단계는 건너뛰고 서명 없이 빌드한다.

1. [SignPath Foundation](https://signpath.org) 에 이 포크로 오픈 소스 무료 서명을 신청한다. 신청에는 아래 Code signing policy 가 필요하다.
2. SignPath 에서 프로젝트 `anySCP`, 서명 정책 `release-signing` 을 만들고,
   아티팩트 설정 `binaries` · `installer` 에 `.signpath/artifact-configurations/{binaries,installer}.xml` 내용을 넣는다.
3. GitHub 저장소 설정 › Secrets and variables › Actions:
   - Secret `SIGNPATH_API_TOKEN`
   - Variable `SIGNPATH_ORGANIZATION_ID`
   - 이름을 다르게 만들었으면 Variable `SIGNPATH_PROJECT_SLUG` · `SIGNPATH_SIGNING_POLICY_SLUG`

제거 프로그램(`uninstall.exe`)은 설치 파일이 설치할 때 만들어서 따로 서명되지 않는다.

### Code signing policy
Windows 배포 파일(`anyscp.exe`, 설치 파일)은 SignPath Foundation 인증서로 코드 서명한다.
Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

- 서명하는 파일은 이 저장소의 소스로 GitHub Actions 가 빌드한 것뿐이고, 빌드마다 승인자가 서명 요청을 직접 승인한다.
- Committers and reviewers: [afy0817](https://github.com/afy0817)
- Approvers: [afy0817](https://github.com/afy0817)
- 개인정보: anySCP 는 사용자가 연결한 서버 · 저장소(SSH / SFTP / SCP / S3) 말고는 원본(macnev2013/anySCP)에 들어 있는
  익명 사용 통계(PostHog)만 보낸다. 호스트 주소 · 계정 · 파일 내용은 보내지 않고, 기기별 무작위 ID · 앱 버전 · OS 와
  기능 사용 이벤트만 보낸다(PostHog 는 접속 IP 로 지역을 추정한다). 환경 변수 `ANYSCP_DISABLE_TELEMETRY` 를 설정하면 보내지 않는다.

## 원본 새 버전 따라가기
    git fetch upstream --tags
    git merge vX.Y.Z
    # 충돌: 원본이 바꾼 문구 줄 → 원본 변경을 반영하고 t() 키로 다시 감싸기
    # 원본에 새로 생긴 영어 문구 → en/ko json 에 키 추가 (tsc·check-i18n 으로 확인)
    # tauri.conf.json 의 version 을 새 버전으로
    pnpm exec tsc --noEmit && pnpm exec vitest run && node .ko/check-i18n.mjs
    .ko/install-mac.sh

## 원본에 PR 로 보내려면
i18n 부분만(업데이터 끄기·tauri.conf 변경 제외) 별도 브랜치로 골라서 upstream 이슈 #127 에 PR.

## 공식판으로 되돌리기
GitHub 릴리스에서 `anySCP_<버전>_aarch64.dmg` 받아 /Applications 에 덮어쓰기
(공식판은 Developer ID 서명·공증됨).
