# Pillarm Server

필람 앱의 Phase 2 백엔드 서버.  
Express + Prisma + PostgreSQL 기반으로 인증, 보호자 공유, 데이터 동기화를 처리한다.

---

## 구현된 API

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| POST | `/auth/signup` | — | 이메일+비밀번호 회원가입 |
| POST | `/auth/login` | — | 로그인 → Access/Refresh 토큰 반환 |
| POST | `/auth/refresh` | — | Access 토큰 갱신 (Refresh 토큰 rotation) |
| GET  | `/auth/me` | ✓ | 내 프로필 조회 |
| PATCH | `/auth/me` | ✓ | 이름 변경 |
| POST | `/auth/reset-password` | — | 이름+이메일로 비밀번호 초기화 |
| POST | `/care-circles` | ✓ | 보호 그룹 생성 |
| GET  | `/care-circles` | ✓ | 내가 속한 보호 그룹 목록 |
| GET  | `/care-circles/:id` | ✓ | 보호 그룹 상세 |
| DELETE | `/care-circles/:id` | ✓ | 보호 그룹 삭제 (소유자 전용) |
| POST | `/care-circles/:id/invite` | ✓ | 초대 코드 생성 (24h TTL) |
| POST | `/care-circles/join` | ✓ | 초대 코드로 그룹 참여 |
| DELETE | `/care-circles/:id/members/:memberId` | ✓ | 멤버 제거 |
| PATCH | `/care-circles/:id/members/:memberId` | ✓ | 멤버 별칭 수정 |
| PUT  | `/care-circles/:id/members/:userId/today` | ✓ | 오늘 복용 스냅샷 업로드 |
| GET  | `/care-circles/:id/members/:userId/today` | ✓ | 오늘 복용 스냅샷 조회 |
| POST | `/sync/push` | ✓ | 로컬 데이터 일괄 업로드 |
| GET  | `/sync/pull` | ✓ | 서버 데이터 다운로드 (`?since=ISO`) |
| PUT  | `/sync/medications/:id` | ✓ | 약 단건 upsert |
| PUT  | `/sync/schedules/:id` | ✓ | 일정 단건 upsert |
| PUT  | `/sync/dose-events/:id` | ✓ | 복용 이벤트 단건 upsert |

---

## 로컬 개발 환경 셋업

### 사전 요구사항

- Node.js 20+
- PostgreSQL 15+ (로컬 설치 또는 Docker)

### 1단계 — 의존성 설치

```bash
cd server
npm install
```

### 2단계 — PostgreSQL 데이터베이스 생성

```sql
-- psql 로 접속 후
CREATE DATABASE pillarm;
```

Docker를 쓴다면:

```bash
docker run -d \
  --name pillarm-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=pillarm \
  -p 5432:5432 \
  postgres:15-alpine
```

### 3단계 — 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 다음 항목을 채운다:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pillarm?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/pillarm?schema=public"

# 아래 명령으로 각각 생성 (두 값은 반드시 다르게)
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET="생성한_64바이트_hex_1"
JWT_REFRESH_SECRET="생성한_64바이트_hex_2"
```

FCM은 선택 사항 — 없으면 보호자 푸시 알림만 비활성화된다.

### 4단계 — DB 마이그레이션 실행

```bash
# Prisma Client 생성
npm run db:generate

# 마이그레이션 적용 (테이블 생성)
npm run db:migrate
```

### 5단계 — 개발 서버 시작

```bash
npm run dev
```

`[server] listening on :3000` 메시지가 뜨면 준비 완료.

---

## 앱(클라이언트) 연결

### 실기기 (Expo Go QR)

컴퓨터의 로컬 IP를 확인 후 `pillarm/.env` 파일에 추가:

```env
# Windows: ipconfig, Mac: ifconfig
EXPO_PUBLIC_SERVER_IP=192.168.0.xxx
```

### Android 에뮬레이터

`careCircleApi.ts`가 자동으로 `10.0.2.2:3000`을 사용하므로 별도 설정 불필요.

### iOS 시뮬레이터

`EXPO_PUBLIC_SERVER_IP`를 설정하지 않으면 `localhost:3000`을 사용.

---

## 테스트

```bash
npm test              # 전체 테스트 (60개)
npm run test:coverage # 커버리지 포함
```

모든 테스트는 Prisma를 mock 처리하므로 DB 없이 실행 가능.

---

## 프로덕션 배포 (Railway 기준)

1. [Railway](https://railway.app) 프로젝트 생성
2. PostgreSQL 플러그인 추가 → `DATABASE_URL` 자동 주입
3. `DIRECT_URL`을 `DATABASE_URL`과 동일하게 설정
4. `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` 환경 변수 추가
5. `npm run build && npm start` 빌드 커맨드 설정
6. 배포 후 앱의 `EXPO_PUBLIC_SERVER_IP`를 Railway 도메인으로 변경

---

## 토큰 구조

| 종류 | 만료 | 저장 위치 |
|------|------|-----------|
| Access Token | 15분 | AsyncStorage (클라이언트) |
| Refresh Token | 30일 | DB `RefreshToken` 테이블 + AsyncStorage |

401 응답 시 클라이언트의 Axios 인터셉터가 자동으로 `/auth/refresh`를 호출해 갱신한다.  
Refresh Token은 사용 즉시 교체(rotation)되어 탈취 시 재사용이 불가능하다.
