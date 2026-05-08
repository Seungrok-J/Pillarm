# 필람 (Pillarm) — 약 복용 시간 알림 앱

약을 제때 복용할 수 있도록 복용 일정 등록·알림·기록·통계를 제공하는 모바일 앱입니다.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 앱 | React Native + Expo SDK 54 (iOS / Android) |
| 언어 | TypeScript |
| 상태관리 | Zustand |
| 로컬 DB | expo-sqlite (SQLite) |
| 알림 | expo-notifications |
| 내비게이션 | React Navigation v7 (Bottom Tabs + Stack) |
| 스타일 | NativeWind (Tailwind for RN) |
| 테스트 | Jest + React Native Testing Library |
| 서버 (Phase 2) | Express + Prisma + PostgreSQL |

---

## 클라이언트 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm start          # Expo 개발 서버
npm run android    # Android 에뮬레이터
npm run ios        # iOS 시뮬레이터

# 테스트
npm test
npm run test:coverage
```

### 환경 변수 (선택)

식품의약품안전처 API 연동 시 `.env` 파일에 추가:

```
EXPO_PUBLIC_MFDS_API_KEY=<공공데이터포털 API 키>
```

---

## 서버 실행 (Phase 2 — 보호자 공유 기능)

### 전제 조건

- Node.js 18+
- PostgreSQL 15+

### 직접 실행

```bash
cd server

# 의존성 설치
npm install

# .env 파일 생성 후 아래 환경 변수 설정
npm run db:generate
npm run db:migrate

# 개발 서버 시작 (포트 3000)
npm run dev
```

### Docker Compose

`server/` 디렉터리에 `docker-compose.yml` 생성:

```yaml
version: "3.9"

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: pillarm
      POSTGRES_USER: pillarm
      POSTGRES_PASSWORD: pillarm
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://pillarm:pillarm@db:5432/pillarm
      JWT_ACCESS_SECRET: change-me-in-production
      JWT_REFRESH_SECRET: change-me-in-production-refresh
      NODE_ENV: production
    depends_on:
      - db

volumes:
  pgdata:
```

```bash
# 실행
docker-compose up -d

# Prisma 마이그레이션 (초기 1회)
docker-compose exec server npm run db:migrate
```

### 서버 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | 필수 | PostgreSQL 연결 URL (예: `postgresql://user:pass@host:5432/db`) |
| `JWT_ACCESS_SECRET` | 필수 | Access token 서명 키 (32자 이상 권장) |
| `JWT_REFRESH_SECRET` | 필수 | Refresh token 서명 키 (access secret 과 다르게 설정) |
| `PORT` | 선택 | 서버 포트 (기본: 3000) |
| `NODE_ENV` | 선택 | `production` 으로 설정 시 스택 트레이스 미노출 |
| `FIREBASE_PROJECT_ID` | 선택 | FCM 보호자 알림 활성화 시 필수 |
| `FIREBASE_CLIENT_EMAIL` | 선택 | Firebase 서비스 계정 이메일 |
| `FIREBASE_PRIVATE_KEY` | 선택 | Firebase 서비스 계정 프라이빗 키 (`\\n` 이스케이프 포함) |

### 서버 테스트

```bash
cd server
npm test
npm run test:coverage  # 목표: 70% 이상
```

---

## 주요 기능

### Phase 1 — 오프라인 MVP
- **복용 일정 등록** — 약 이름(식약처 API 자동완성), 복용 시간, 반복 주기, 식전/식후 설정
- **복용 체크** — 예정 시간 2시간 전부터 graceMinutes(기본 2시간) 경과 전까지 복용 버튼 활성화, 탭 1회로 완료 처리
- **알림** — expo-notifications 로컬 스케줄링, 조용한 시간대 정책, 스누즈
- **기록·통계** — 주간/월별 복용률 차트, 누락 패턴 분석

### Phase 2 — 확장
- **포인트 리워드** — 복용 완료 +10P (일일 5회 한도), 7일 연속 +50P, 완벽한 주 +30P
  - 일일 한도 초과 시 토스트 메시지 별도 안내
  - 5종 테마(기본·민트·코랄·라벤더·선셋) 포인트로 구매
- **복용 일정 관리**
  - 종료된 일정은 기본 숨김 → "지난 일정 N건 보기" 토글로 확인
  - 지난 일정 삭제 시 별도 확인 메시지 ("복용 기록은 유지됩니다")
- **보호자 공유** — 6자리 코드/QR 초대, 오늘 복용 현황 실시간 확인, 누락 시 FCM 푸시 알림
- **약 정보 DB 연동** — 식약처 e약은요 API 자동완성 (debounce 300ms), 오프라인 시 직접 입력 전환
- **AI 코칭** — 최근 30일 누락 패턴 분석, 통계 화면 하단 코칭 메시지 + 스케줄 수정 Quick Fix
- **기기 교체 데이터 복원** — 로그인 시 `GET /sync/pull`로 서버 데이터 자동 복원

---

## Phase 1 → Phase 2 마이그레이션 가이드

### DB 스키마 마이그레이션 (로컬 SQLite)

Phase 1 앱이 설치된 기기에 Phase 2 앱을 업데이트하면 앱 시작 시 자동 실행됩니다.

| 버전 | 내용 |
|------|------|
| v1 | 기본 테이블: `medications`, `schedules`, `dose_events`, `user_settings` |
| v2 | Phase 2 테이블: `medication_courses`, `medication_course_items`, `reminder_rules`, `point_ledger` |
| v3 | `dose_events` 에 `photo_path TEXT` 컬럼 추가 (사진 첨부 기능) |
| v4 | `medications`, `schedules`, `dose_events` 에 `user_id TEXT` 컬럼 추가 (멀티 계정 지원) |
| v5 | `user_settings` 에 `breakfast_time`, `lunch_time`, `dinner_time` 컬럼 추가 (식사 시간 기반 알림) |

마이그레이션은 `src/db/migrations.ts` 의 `runMigrations()` 가 멱등적으로 실행합니다.
이미 적용된 버전은 `schema_migrations` 테이블로 추적하며 재실행되지 않습니다.

### 서버 연동 설정

```typescript
// src/features/careCircle/careCircleApi.ts
export const API_BASE_URL = 'http://localhost:3000'; // 서버 주소로 변경
// Android 에뮬레이터: 'http://10.0.2.2:3000'
// 실기기: 'http://<서버IP>:3000'
```

Phase 1 기능(복용 등록, 알림, 체크, 통계)은 서버 없이 오프라인에서도 완전히 동작합니다.
Phase 2 기능(보호자 공유, 약 정보 DB 연동)은 서버 연동 후 활성화됩니다.

### 서버 백그라운드 서비스

서버 기동 시 다음 서비스가 자동으로 시작됩니다:

| 서비스 | 파일 | 동작 |
|--------|------|------|
| FCM 초기화 | `services/fcmService.ts` | Firebase Admin SDK 초기화 |
| 누락 알림 발송 | `services/missedDoseNotifier.ts` | 5분마다 `status='missed'` 이벤트 탐지 → 보호자 FCM 푸시 발송 |

---

## 디렉터리 구조

```
pillarm/
├── src/
│   ├── app/           # 화면 컴포넌트 (home, schedule, history, stats, settings, auth)
│   ├── components/    # 공통 UI 컴포넌트
│   ├── db/            # SQLite 마이그레이션 & 쿼리
│   ├── domain/        # 엔터티 타입
│   ├── features/      # 기능 모듈 (careCircle, medicationDB, points, aiCoaching)
│   ├── navigation/    # React Navigation 설정
│   ├── notifications/ # 알림 스케줄링
│   ├── store/         # Zustand 스토어 (themeStore 포함)
│   └── utils/
│       ├── date.ts        # toLocalISOString, todayString 등 날짜 유틸
│       ├── doseDisplay.ts # DoseDisplayState·computeDisplayState (DoseCard·History 공유)
│       ├── themeManager.ts # 5종 테마 정의·AsyncStorage 저장
│       ├── statsCalculator.ts
│       └── uuid.ts
├── server/            # Phase 2 백엔드 (Express + Prisma)
│   ├── src/
│   │   ├── routes/    # auth, careCircle, doseSync, sync
│   │   ├── services/  # inviteService, fcmService, missedDoseNotifier
│   │   ├── middleware/ # requireAuth, errorHandler
│   │   └── lib/       # prisma, jwt
│   └── prisma/
│       └── schema.prisma
└── __tests__/         # Jest 테스트
```

---

## 보안 참고 사항

- **Refresh token rotation**: 사용 시 기존 토큰 삭제 → 탈취된 토큰 재사용 불가
- 모든 `/care-circles/*` 엔드포인트는 JWT 인증 필수
- 보호자는 자신이 속한 서클의 데이터만 조회 가능 (비구성원 → 403)
- **TODO**: `SharePolicy.allowedFields` 기반 필드 레벨 접근 제어 미구현 (현재 구성원이면 스냅샷 전체 필드 접근 가능)
- 보호 그룹 삭제 후 보호자가 스냅샷 재조회 시 403 응답 → 클라이언트에서 "접근이 차단되었습니다" 안내
