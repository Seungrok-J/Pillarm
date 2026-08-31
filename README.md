# 필람 (Pillarm) — 약 복용 시간 알림 앱

약을 제때 복용할 수 있도록 복용 일정 등록·알림·기록·통계를 제공하는 모바일 앱입니다.

## 개발 단계

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 — MVP | 약 등록·알림·복용 체크·통계 | ✅ 완료 |
| 2 — 확장 | 보호자 공유·포인트·AI 코칭·약 DB | ✅ 완료 |
| 3 — 배포 | 소셜 로그인·EAS 빌드·스토어 배포 | 🔧 진행 중 (iOS 배포 ✅ · Android 비공개 테스트 중) |
| 4 — 스캔 | 약봉투 촬영 → AI 자동 일정 생성 | ✅ 완료 (2026-06 배포, 지속 개선 중) |

### 배포 현황 (2026-08-28)

| 플랫폼 | 버전 | 상태 |
|--------|------|------|
| iOS | 1.0.1 (buildNumber 34) | App Store 배포 완료 |
| Android | 1.0.1 (versionCode 23) | Play Console 비공개 테스트 중 (2026-08-28 시작) |

---

## 기술 스택

### 클라이언트

| 레이어 | 기술 |
|--------|------|
| 플랫폼 | iOS / Android (React Native + Expo SDK 54) |
| 언어 | TypeScript |
| 상태관리 | Zustand |
| 로컬 DB | expo-sqlite (SQLite) |
| 알림 | expo-notifications |
| 내비게이션 | React Navigation v7 (Bottom Tabs + Stack) |
| 스타일 | NativeWind (Tailwind for RN) |
| 테스트 | Jest + React Native Testing Library |
| 소셜 로그인 | expo-apple-authentication · @react-native-google-signin · @react-native-kakao |
| 크래시 리포팅 | @sentry/react-native |

### 서버

| 레이어 | 기술 |
|--------|------|
| 런타임 | Node.js + Express |
| ORM | Prisma |
| DB | PostgreSQL (Supabase) |
| 인증 | JWT (access + refresh token rotation) |
| 푸시 알림 | Firebase Admin SDK (FCM) |
| 호스팅 | Railway |
| 빌드 | EAS Build (Expo Application Services) |

---

## 클라이언트 실행

```bash
# 의존성 설치
npm install --legacy-peer-deps

# 개발 서버 시작
npm start          # Expo 개발 서버
npm run ios        # iOS 시뮬레이터
npm run android    # Android 에뮬레이터

# 테스트
npm test
npm run test:coverage
```

### 환경 변수

`.env` 파일에 필요한 항목 추가:

```
# 식약처 API (약 이름 자동완성)
EXPO_PUBLIC_MFDS_API_KEY=<공공데이터포털 API 키>

# 서버 URL (우선순위: SERVER_URL > SERVER_IP > 에뮬레이터 기본값)
EXPO_PUBLIC_SERVER_URL=https://pillarm-production.up.railway.app
EXPO_PUBLIC_SERVER_IP=192.168.0.x   # 로컬 실기기 테스트용

# Google 로그인
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS OAuth 클라이언트 ID>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web OAuth 클라이언트 ID>

# Sentry 크래시 리포팅 (없으면 리포팅 비활성화 — 앱은 정상 동작)
EXPO_PUBLIC_SENTRY_DSN=<Sentry 프로젝트 DSN>
EXPO_PUBLIC_SENTRY_DEV=1        # 개발 빌드에서도 전송하고 싶을 때만

# EAS Submit (iOS) — eas.json 에 개인 이메일을 두지 않기 위해 분리
EXPO_APPLE_ID=<Apple ID 이메일>
```

> EAS 클라우드 빌드에는 `.env` 가 올라가지 않는다. `eas env:create` 로 EAS 환경 변수에도 등록해야 한다.

---

## 서버 실행

### 환경 변수 (server/.env)

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | 필수 | PostgreSQL 연결 URL |
| `DIRECT_URL` | 필수 | Prisma 마이그레이션용 직접 연결 URL |
| `JWT_ACCESS_SECRET` | 필수 | Access token 서명 키 (64바이트 hex) |
| `JWT_REFRESH_SECRET` | 필수 | Refresh token 서명 키 (access와 다르게) |
| `APPLE_CLIENT_ID` | 필수 | `com.seungrokj.pillarm` |
| `GOOGLE_CLIENT_ID` | 필수 | Google 웹 OAuth 클라이언트 ID |
| `GOOGLE_IOS_CLIENT_ID` | 필수 | Google iOS OAuth 클라이언트 ID |
| `ANTHROPIC_API_KEY` | 필수 | 약봉투 스캔 AI (Claude Vision) |
| `FIREBASE_PROJECT_ID` | 선택 | FCM 보호자 알림 활성화 시 필수 |
| `FIREBASE_CLIENT_EMAIL` | 선택 | Firebase 서비스 계정 이메일 |
| `FIREBASE_PRIVATE_KEY` | 선택 | Firebase 서비스 계정 프라이빗 키 |

```bash
cd server
npm install
npm run db:generate
npm run db:migrate
npm run dev     # 포트 3000
```

---

## 주요 기능

### Phase 1 — 오프라인 MVP ✅
- **복용 일정 등록** — 약 이름(식약처 API 자동완성), 복용 시간, 반복 주기, 식전/식후 설정
- **복용 체크** — graceMinutes 경과 전까지 복용 버튼 활성화, 탭 1회로 완료 처리
- **알림** — expo-notifications 로컬 스케줄링, 조용한 시간대 정책, 스누즈(최대 3회)
- **기록·통계** — 달력 기반 기록, 주간/월별 복용률 차트, 누락 패턴 분석

### Phase 2 — 확장 ✅
- **포인트 리워드** — 복용 완료 +10P, 7일 연속 +50P, 5종 테마 포인트 구매
- **보호자 공유** — 6자리 코드/QR 초대, 오늘 복용 현황 실시간 확인, 누락 시 FCM 푸시 알림
- **약 정보 DB 연동** — 식약처 e약은요 API 자동완성 (debounce 300ms)
- **AI 코칭** — 최근 30일 누락 패턴 분석, 통계 화면 하단 코칭 메시지
- **기기 교체 데이터 복원** — 로그인 시 서버 데이터 자동 복원

### Phase 3 — 소셜 로그인 & 배포 🔧 진행 중
- **소셜 로그인** — Apple(iOS 전용) · Google · 카카오 (이메일 로그인 완전 제거)
- **pillarm.app 도메인** — 초대 링크·개인정보처리방침 URL 반영
- **알림 로그인 연동** — 로그아웃 시 알림 전체 취소, 로그인 시 재스케줄, 계정별 알림 분리
- **EAS Build** — iOS/Android 프로덕션 빌드 자동화
- **Railway 서버 배포** — `https://pillarm-production.up.railway.app`
- **iOS App Store** — v1.0.1 (build 34) 정식 배포 완료
- **Android 비공개 테스트** — v1.0.1 (versionCode 23), 2026-08-28 시작
- **크래시 리포팅** — Sentry 연동 (개인정보 차단 설정 적용)

### Phase 4 — 약봉투 스캔 ✅ 완료
- **약봉투 촬영 → 자동 일정 생성** — 카메라로 조제약 봉투 촬영 시 Claude Vision AI가 약 이름·용량·복용 횟수·기간·식전후를 인식하여 일정 초안 자동 생성
- 식사 시간 설정 기반 복용 시간 자동 계산, 용량 단위(정/mg/ml) 버튼 선택
- 자세한 내용: `PRD_PHASE4.md` 참조

---

## 로컬 DB 마이그레이션 이력

| 버전 | 내용 |
|------|------|
| v1 | 기본 테이블: `medications`, `schedules`, `dose_events`, `user_settings` |
| v2 | Phase 2: `medication_courses`, `medication_course_items`, `reminder_rules`, `point_ledger` |
| v3 | `dose_events.photo_path` 추가 (사진 첨부) |
| v4 | `medications`, `schedules`, `dose_events`에 `user_id` 추가 (멀티 계정) |
| v5 | `user_settings`에 식사 시간 컬럼 추가 (`breakfast_time`, `lunch_time`, `dinner_time`) |
| v6 | `schedules`, `dose_events`에 `packet_id` 추가 (포 그룹화) |
| v7 | `user_settings`에 `font_scale` 추가 |
| v8 | `schedules`, `dose_events`에 `packet_name` 추가 |

마이그레이션은 `src/db/migrations.ts`의 `runMigrations()`가 멱등적으로 실행합니다.

---

## 디렉터리 구조

```
pillarm/
├── src/
│   ├── app/              # 화면 (home, schedule, history, stats, settings, auth, onboarding, scan, supplementGuide)
│   ├── components/       # 공통 UI 컴포넌트
│   ├── db/               # SQLite 마이그레이션 & 쿼리
│   ├── domain/           # 엔터티 타입
│   ├── features/
│   │   ├── careCircle/   # 보호자 공유 API & UI
│   │   ├── medicationDB/ # 식약처 API 자동완성
│   │   ├── medicationScan/ # 약봉투 스캔 (Claude Vision AI)
│   │   ├── supplementGuide/ # 영양제 복용 가이드 데이터
│   │   ├── points/       # 포인트·리워드
│   │   ├── aiCoaching/   # AI 코칭
│   │   └── socialAuth/   # 소셜 로그인 (Apple·Google·Kakao)
│   ├── monitoring/       # Sentry 초기화·리포트
│   ├── navigation/       # React Navigation 설정
│   ├── notifications/    # 알림 스케줄링
│   ├── store/            # Zustand 스토어
│   ├── sync/             # 서버 동기화 서비스
│   └── utils/
├── server/               # 백엔드 (Express + Prisma, Railway 배포)
│   ├── src/
│   │   ├── routes/       # auth, socialAuth, careCircle, doseSync, sync, aiScan, admin
│   │   ├── services/     # fcmService, missedDoseNotifier
│   │   ├── middleware/   # requireAuth, errorHandler
│   │   └── lib/          # prisma, jwt
│   └── prisma/
│       └── schema.prisma
├── docs/                 # 개인정보 처리방침, 디자인 시스템, 도메인 모델, OAuth 콜백
├── eas.json              # EAS Build 프로파일
├── PRD_PHASE1.md
├── PRD_PHASE2.md
├── PRD_PHASE3.md
└── PRD_PHASE4.md
```

---

## 테스트

| 대상 | 개수 |
|------|------|
| 클라이언트 (Jest + RNTL) | 445 |
| 서버 (Jest) | 70 |

```bash
npm test              # 클라이언트
cd server && npm test # 서버
```

---

## EAS Build

소셜 로그인 라이브러리는 네이티브 모듈을 포함하므로 **Expo Go 대신 개발 빌드** 필요.

```bash
npm install -g eas-cli
eas login

# 개발 빌드 (실기기 테스트)
eas build --platform ios --profile development

# 프로덕션 빌드 + TestFlight 자동 제출
eas build --platform ios --profile production --auto-submit

# Android 프로덕션 빌드 (.aab)
eas build --platform android --profile production
```

> **Android 제출 주의** — `eas submit --platform android` 는 현재 Google Play 서비스 계정
> 권한 부족으로 실패한다. 권한을 정리하기 전까지는 빌드된 `.aab` 를 Play Console 에
> 수동 업로드해야 한다.

### 주요 빌드 정보

| 항목 | 값 |
|------|-----|
| Bundle ID | `com.seungrokj.pillarm` |
| Apple Team ID | `9AU7GMJTRW` |
| App Store Connect ID | `6770390217` |
| 현재 iOS buildNumber | `34` (v1.0.1) |
| 현재 Android versionCode | `23` (v1.0.1) |

---

## 보안 참고 사항

- **Refresh token rotation**: 사용 시 기존 토큰 삭제 → 탈취 토큰 재사용 불가
- 모든 `/care-circles/*` 엔드포인트는 JWT 인증 필수
- `/sync` PUT 엔드포인트에서 기존 레코드 소유권(userId) 검증 → 타인 데이터 덮어쓰기 차단
- 보호자는 자신이 속한 서클의 데이터만 조회 가능 (비구성원 → 403)
- 소셜 로그인 동일 이메일 중복 시 409 처리 + 연결 확인 Alert
