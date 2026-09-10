# 필람(Pillarm) — 약 복용 시간 알림 앱

## 프로젝트 개요

약을 제때 복용할 수 있도록 복용 일정 등록·알림·기록·통계를 제공하는 모바일 앱.

| 항목 | 내용 |
|------|------|
| 앱 이름 | 필람 (Pillarm) |
| 플랫폼 | iOS / Android (React Native + Expo) |
| 언어 | TypeScript |
| 상태관리 | Zustand |
| 로컬 DB | expo-sqlite (SQLite) |
| 알림 | expo-notifications |
| 내비게이션 | React Navigation v7 (Bottom Tabs + Stack) |
| 스타일 | NativeWind (Tailwind for RN) |
| 테스트 | Jest + React Native Testing Library |
| 네트워크 감지 | @react-native-community/netinfo |
| 크래시 리포팅 | @sentry/react-native (DSN 은 `EXPO_PUBLIC_SENTRY_DSN`) |

## 디렉터리 구조

```
pillarm/
├── CLAUDE.md                  ← 이 파일
├── PRD_PHASE1.md              ← MVP 상세 요구사항
├── PRD_PHASE2.md              ← 확장 기능 요구사항
├── PRD_PHASE3.md              ← 간편 로그인 & 스토어 배포 (오프라인·관리자 포함)
├── PRD_PHASE4.md              ← 약봉투 스캔 (Claude Vision AI) & 영양제 가이드
├── PRD_PHASE5.md              ← 수익 모델 (프리미엄 구독) — 기획 단계
├── PROJECT_SUMMARY.md         ← 프로젝트 진행 이력 요약 (포트폴리오·이력서용)
├── docs/
│   ├── domain-model.md        ← 엔터티 정의
│   ├── erd.md                 ← ERD 다이어그램
│   ├── design-system.md       ← 색상·타이포·간격 토큰
│   └── scan-pack-ux-requirements.md  ← 포 빌더 UI/UX 요구사항
├── src/
│   ├── app/                   ← 화면 컴포넌트
│   │   ├── home/
│   │   ├── schedule/
│   │   ├── history/
│   │   ├── stats/
│   │   ├── settings/
│   │   ├── auth/              ← 로그인·계정
│   │   ├── onboarding/
│   │   ├── scan/              ← 약봉투 스캔 결과 확인
│   │   └── supplementGuide/   ← 영양제 백과
│   ├── components/            ← 공통 UI 컴포넌트 (OfflineBanner 포함)
│   ├── domain/                ← 엔터티 타입 정의
│   ├── features/
│   │   ├── admin/             ← 관리자 패널 (AdminScreen, adminApi)
│   │   ├── careCircle/        ← 보호자 그룹
│   │   ├── socialAuth/        ← 소셜 로그인
│   │   ├── medicationScan/    ← 스캔 API·파싱 유틸
│   │   ├── medicationDB/      ← 식약처 API 자동완성
│   │   ├── supplementGuide/   ← 영양제 가이드 데이터
│   │   ├── points/            ← 포인트·리워드
│   │   └── aiCoaching/        ← AI 코칭
│   ├── store/                 ← Zustand 스토어 (networkStore 포함)
│   ├── db/                    ← SQLite 마이그레이션 & 쿼리
│   ├── monitoring/            ← Sentry 초기화·리포트 (DSN 없으면 무동작)
│   ├── notifications/         ← 알림 스케줄링 로직
│   ├── sync/                  ← 서버 동기화 (pending 큐 포함)
│   └── utils/
└── __tests__/
```

## 핵심 원칙

1. **오프라인 우선** — 모든 데이터는 기기 로컬(SQLite)에 저장한다. 네트워크 없이 완전히 동작해야 한다. 온라인 전용 기능(보호자 그룹·서버 동기화)에는 오프라인 배너로 안내하고, 재연결 시 자동 재시도한다.
2. **접근성 우선** — 글씨 크기는 최소 16sp, 터치 영역은 최소 44×44pt. 색각 이상자를 위해 색상만으로 상태를 표현하지 않는다.
3. **알림 신뢰성** — 알림은 expo-notifications로 로컬 스케줄링한다. 스케줄 변경 시 기존 알림을 취소하고 재등록한다.
4. **단순한 UX** — 복용 완료는 탭 1회로 처리한다. 화면 전환 없이 홈에서 모든 일상 액션이 가능해야 한다.

## 개발 단계

| Phase | 파일 | 목표 | 상태 |
|-------|------|------|------|
| 1 — MVP | `PRD_PHASE1.md` | 핵심 4기능: 등록·알림·체크·통계(기본) | ✅ 완료 |
| 2 — 확장 | `PRD_PHASE2.md` | 보호자 공유·약 DB 연동·포인트·AI 코칭 | ✅ 완료 |
| 3 — 배포 | `PRD_PHASE3.md` | 간편 로그인(Apple·Google·카카오) & App Store / Google Play 배포 + 오프라인 처리 + 관리자 패널 | 🔧 진행 중 (iOS 배포 ✅ · Android 비공개 테스트 중) |
| 4 — 스캔 | `PRD_PHASE4.md` | 약봉투 촬영 → Claude Vision AI 자동 일정 생성 | ✅ 완료 (2026-06 배포, 지속 개선 중) |
| 5 — 수익화 | `PRD_PHASE5.md` | 보호자 결제 기반 프리미엄 구독 | 📋 기획 (Android 프로덕션 액세스 확보 후 착수) |

## 배포 현황 (2026-09-10)

| 플랫폼 | 버전 | 상태 |
|--------|------|------|
| iOS | 1.0.4 (buildNumber 39) | 빌드·제출 진행 (2026-09-10) |
| iOS | 1.0.3 (buildNumber 38) | 배포 완료 (2026-09-04) |
| iOS | 1.0.1 (buildNumber 34) | App Store 배포 완료 |
| Android | 1.0.4 (versionCode 26) | 빌드 진행 (2026-09-10) |
| Android | 1.0.3 (versionCode 25) | 비공개 테스트 `ver.23` 트랙 출시 완료 (2026-09-04) |
| Android | 1.0.2 (versionCode 24) | 비공개 테스트 `ver.23` 트랙 출시 완료 (2026-09-01) |

- 1.0.4 변경 내용: 좁은 화면(폴더폰 320dp)과 큰 글씨 배율에서 무너지던 레이아웃을
  전면 수정. 홈·기록에서 복용 카드가 한 장도 안 보이던 문제, 일정 추가에서 색상
  팔레트 마지막 색을 아예 고를 수 없던 문제(배율 무관)를 포함해 15곳. 기록 화면
  달력을 주간 스트립 + 월간 펼치기로 전환. 보호자·관리자 화면의 오프라인 오류
  모달을 배너 + 재연결 시 자동 재시도로 교체. 자세한 규칙은
  `docs/design-system.md` 의 "좁은 화면·큰 배율 대응" 절 참고.
- 1.0.3 변경 내용: 글씨 크기 조절(보통/크게/아주 크게) 추가, 설정의 시간 항목을
  타이핑에서 드럼롤 선택으로 교체, 관리자 통계 지표 확장.
- 1.0.2 변경 내용: 앱 아이콘을 벡터(SVG)로 교체, Sentry 소스맵 업로드 활성화.
- 빌드 36 은 업스케일된 래스터 아이콘이 들어가 폐기했다. 선명한 벡터 아이콘은 **37 부터**다.
- Android 프로덕션 승격은 테스터 12명이 14일 연속 유지되어야 신청 가능 — 빠르면 **2026-09-11**.

### Play Console 트랙 (중요)

비공개 테스트 트랙 ID 는 **`ver.23`** 이다. 테스터 12명이 이 트랙에 붙어 있고,
`eas.json` 의 `submit.production.android.track` 도 여기를 가리킨다.

- **versionCode 를 올려도 새 트랙을 만들지 말고 `ver.23` 에 계속 올린다.**
  Google Play 의 "테스터 12명 14일 연속" 요건은 트랙 단위로 계산되므로 새 트랙을 만들면
  카운트가 리셋된다. 트랙 이름이 versionCode 와 안 맞는 건 표시 이름만 바꾸면 된다.
- `alpha`(versionCode 21) · `internal`(18) 트랙은 방치된 상태다. 혼동하지 않도록 주의.
- 트랙 상태는 서비스 계정으로 Play Developer API 를 조회하면 아무것도 바꾸지 않고 확인된다
  (`edits.insert` → `edits.tracks.list` → `edits.delete`).
- `eas submit --platform android` 는 과거 서비스 계정 권한 문제로 실패했다. 2026-09-01 기준
  인증·트랙 조회는 통과하지만 번들 업로드까지는 미검증이라, 현재는 `.aab` 를 수동 업로드한다.

### Sentry (EU 리전 주의)

Sentry 조직은 **EU 데이터 리전**(`de.sentry.io`)에 있다. org slug `pillarm`, project slug `react-native`.

- Organization 토큰(`sntrys_`)은 내부에 US 호스트가 박혀 발급되고 sentry-cli 가 그걸 우선하므로
  **EU 조직에서는 401 로 실패한다. Personal auth token(`sntryu_`)을 써야 한다.**
  필요 스코프: Project=Read, Release=Admin(`project:releases`), Organization=Read.
- `app.json` 의 `@sentry/react-native` 플러그인에 `organization`·`project` 와 함께
  **`"url": "https://de.sentry.io/"` 가 반드시 있어야 한다.** 없으면 빌드가 Xcode 단계에서 실패한다.
- 토큰은 EAS production 환경변수 `SENTRY_AUTH_TOKEN` 에 **Secret** 으로 둔다. 저장소에 넣지 않는다.

## 작업 시작 전 체크리스트

- [ ] `PRD_PHASE1.md` 전체 읽기
- [ ] `docs/domain-model.md` 엔터티 확인
- [ ] 각 Phase의 완료 기준(Acceptance Criteria) 확인 후 구현 시작
- [ ] 화면 1개 완성 → 테스트 작성 → 다음 화면 순서로 진행
