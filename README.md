# 필람 (Pillarm) — 약 복용 시간 알림 앱

약을 제때 복용할 수 있도록 복용 일정 등록·알림·기록·통계를 제공하는 모바일 앱입니다.

## 개발 단계

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 — MVP | 약 등록·알림·복용 체크·통계 | ✅ 완료 |
| 2 — 확장 | 보호자 공유·포인트·AI 코칭·약 DB | ✅ 완료 |
| 3 — 배포 | 소셜 로그인·EAS 빌드·스토어 배포 | 🔧 진행 중 (iOS build 12 TestFlight) |
| 4 — 스캔 | 약봉투 촬영 → AI 자동 일정 생성 | 📋 계획 중 |

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
```

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
- **소셜 로그인** — Apple(iOS 전용) · Google · 카카오
- **알림 로그인 연동** — 로그아웃 시 알림 전체 취소, 로그인 시 재스케줄, 계정별 알림 분리
- **일정 삭제 개선** — 삭제 시 오늘 미완료 이벤트 함께 제거
- **EAS Build** — iOS/Android 프로덕션 빌드 자동화
- **Railway 서버 배포** — `https://pillarm-production.up.railway.app`
- **iOS TestFlight** — build 12 (v1.0.0) 제출 완료

### Phase 4 — 약봉투 스캔 📋 계획 중
- **약봉투 촬영 → 자동 일정 생성** — 카메라로 조제약 봉투 촬영 시 AI가 약 이름·용량·복용 횟수·기간·식전후를 인식하여 일정 초안 자동 생성
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

마이그레이션은 `src/db/migrations.ts`의 `runMigrations()`가 멱등적으로 실행합니다.

---

## 디렉터리 구조

```
pillarm/
├── src/
│   ├── app/              # 화면 컴포넌트 (home, schedule, history, stats, settings, auth)
│   ├── components/       # 공통 UI 컴포넌트
│   ├── db/               # SQLite 마이그레이션 & 쿼리
│   ├── domain/           # 엔터티 타입
│   ├── features/
│   │   ├── careCircle/   # 보호자 공유 API & UI
│   │   ├── medicationDB/ # 식약처 API 자동완성
│   │   ├── points/       # 포인트·리워드
│   │   ├── aiCoaching/   # AI 코칭
│   │   └── socialAuth/   # 소셜 로그인 (Apple·Google·Kakao)
│   ├── navigation/       # React Navigation 설정
│   ├── notifications/    # 알림 스케줄링
│   ├── store/            # Zustand 스토어
│   ├── sync/             # 서버 동기화 서비스
│   └── utils/
├── server/               # 백엔드 (Express + Prisma, Railway 배포)
│   ├── src/
│   │   ├── routes/       # auth, socialAuth, careCircle, doseSync, sync
│   │   ├── services/     # fcmService, missedDoseNotifier
│   │   ├── middleware/   # requireAuth, errorHandler
│   │   └── lib/          # prisma, jwt
│   └── prisma/
│       └── schema.prisma
├── docs/                 # 개인정보 처리방침, OAuth 콜백 페이지
├── eas.json              # EAS Build 프로파일
├── PRD_PHASE1.md
├── PRD_PHASE2.md
├── PRD_PHASE3.md
└── PRD_PHASE4.md
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

# Android 프로덕션 빌드
eas build --platform android --profile production
```

---

## 보안 참고 사항

- **Refresh token rotation**: 사용 시 기존 토큰 삭제 → 탈취 토큰 재사용 불가
- 모든 `/care-circles/*` 엔드포인트는 JWT 인증 필수
- `/sync` PUT 엔드포인트에서 기존 레코드 소유권(userId) 검증 → 타인 데이터 덮어쓰기 차단
- 보호자는 자신이 속한 서클의 데이터만 조회 가능 (비구성원 → 403)
