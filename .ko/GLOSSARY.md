# anySCP 한국어 번역 규칙 (ko 브랜치)

## 문체
- 버튼·메뉴·탭·라벨·열 제목: 명사형, 짧게 (예: "연결", "저장", "이름 변경", "새 폴더").
- 안내·확인·에러·빈 화면 문장: 해요체 (예: "호스트를 삭제할까요?", "연결하지 못했어요", "아직 저장된 호스트가 없어요").
- placeholder: 예시값(IP, 경로, 명령어)은 그대로 두고 설명 문구만 번역 (예: "e.g. 192.168.0.10" → "예: 192.168.0.10").
- 마침표: 한 문장 안내는 마침표 없이, 여러 문장이면 원문처럼 마침표 사용.
- 복수형 분기(`file${n === 1 ? "" : "s"}`)는 한국어로 하나로 합침 (예: `${n}개 파일` 또는 `파일 ${n}개`).

## 그대로 두는 것 (번역 금지)
- 고유명사·프로토콜·제품명: SSH, SFTP, SCP, S3, AWS, MinIO, Cloudflare R2, VS Code, anySCP, Tauri, OpenSSH, PEM, RSA, Ed25519, ECDSA, ACL, URL, IP, DNS, TCP, UTF-8, JSON, CSV
- 키보드 단축키 표기(⌘K, Ctrl+C 등), 파일 경로·명령어 예시
- 코드 로직에 쓰이는 문자열: 비교값(`=== "Connected"`), switch case, 객체 키, enum/union 타입 값, id, data-testid, className, 이벤트 이름, localStorage 키, invoke 명령 이름, 로그(console.*), 정규식
- 옵션 객체에서 value 는 그대로, label 만 번역
- 백엔드(Rust, src-tauri)는 손대지 않음

## 용어집
| 영어 | 한국어 |
|---|---|
| Host / Hosts | 호스트 |
| Hostname | 호스트 이름 |
| Port | 포트 |
| Username | 사용자 이름 |
| Password | 비밀번호 |
| Private key / Key file | 개인 키 / 키 파일 |
| Passphrase | 암호 문구 |
| Authentication / Auth method | 인증 / 인증 방식 |
| Agent (ssh-agent) | SSH 에이전트 |
| Jump host / Bastion / Proxy jump | 점프 호스트 |
| Known hosts / Host key / Fingerprint | 알려진 호스트 / 호스트 키 / 지문 |
| Connect / Disconnect / Reconnect | 연결 / 연결 끊기 / 다시 연결 |
| Connected / Disconnected / Connecting… | 연결됨 / 연결 끊김 / 연결 중… |
| Connection | 연결 |
| Quick Connect | 빠른 연결 |
| Session | 세션 |
| Terminal | 터미널 |
| Split (pane) horizontally/vertically | 가로로 분할 / 세로로 분할 |
| Explorer / File browser | 파일 탐색기 |
| Local / Remote | 로컬 / 원격 |
| Transfer(s) / Transfer queue | 전송 / 전송 대기열 |
| Upload / Download | 업로드 / 다운로드 |
| Snippet(s) | 스니펫 |
| Variable / Parameter (snippet) | 변수 |
| Port Forwarding | 포트 포워딩 |
| Tunnel / Local forward / Remote forward | 터널 / 로컬 포워딩 / 원격 포워딩 |
| Bucket / Object / Prefix | 버킷 / 객체 / 접두사 |
| Endpoint / Region | 엔드포인트 / 리전 |
| Access key / Secret key | 액세스 키 / 시크릿 키 |
| Presigned URL | 미리 서명된 URL |
| Group / Tag / Color | 그룹 / 태그 / 색상 |
| Dashboard | 대시보드 |
| History | 기록 |
| Settings / Preferences | 설정 |
| General / Appearance | 일반 / 모양 |
| Theme / Light / Dark / System | 테마 / 라이트 / 다크 / 시스템 설정 따름 |
| Font / Font size | 글꼴 / 글꼴 크기 |
| Cursor (style/blink) | 커서 (모양/깜빡임) |
| Scrollback | 스크롤백 |
| Name / Size / Modified / Type / Permissions / Owner / Group | 이름 / 크기 / 수정일 / 종류 / 권한 / 소유자 / 그룹 |
| File / Folder / Directory | 파일 / 폴더 / 폴더 |
| New Folder / New File | 새 폴더 / 새 파일 |
| Rename / Delete / Move / Copy / Cut / Paste | 이름 변경 / 삭제 / 이동 / 복사 / 잘라내기 / 붙여넣기 |
| Duplicate | 복제 |
| Properties / Info | 속성 / 정보 |
| Open / Open with / Edit in VS Code | 열기 / 다음으로 열기 / VS Code에서 편집 |
| Refresh / Reload | 새로 고침 |
| Go up / Parent folder | 상위 폴더 |
| Show hidden files | 숨김 파일 보기 |
| Select all | 모두 선택 |
| Save / Cancel / OK / Close / Done / Apply | 저장 / 취소 / 확인 / 닫기 / 완료 / 적용 |
| Add / Edit / Remove / Clear | 추가 / 편집 / 제거 / 지우기 |
| Search / Filter / Sort | 검색 / 필터 / 정렬 |
| Retry / Skip / Overwrite / Replace / Keep both | 다시 시도 / 건너뛰기 / 덮어쓰기 / 바꾸기 / 둘 다 유지 |
| Import / Export | 가져오기 / 내보내기 |
| Enable(d) / Disable(d) | 사용 / 사용 안 함 (토글 라벨은 켜기/끄기도 가능) |
| Default | 기본값 |
| Optional / Required | 선택 사항 / 필수 |
| Advanced | 고급 |
| Loading… | 불러오는 중… |
| Pending / In progress / Completed / Failed / Cancelled | 대기 중 / 진행 중 / 완료 / 실패 / 취소됨 |
| Update / Check for updates | 업데이트 / 업데이트 확인 |
| Restart / Relaunch | 다시 시작 |
| Copied! | 복사했어요 |
| Failed to X | X하지 못했어요 (짧은 상태 표시는 "X 실패") |
| Are you sure you want to delete X? | X을(를) 삭제할까요? |
| This cannot be undone | 되돌릴 수 없어요 |
| No X yet / No results | 아직 X이(가) 없어요 / 결과 없음 |
| just now / 5m ago / 2h ago / 3d ago | 방금 / 5분 전 / 2시간 전 / 3일 전 |
