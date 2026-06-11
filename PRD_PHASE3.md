# PRD Phase 3 — 간편 로그인 & 스토어 배포

> **전제 조건:** Phase 2가 완료되어 보호자 공유·포인트·AI 코칭이 실기기에서 정상 동작해야 한다.  
> **목표:** 소셜 간편 로그인 추가, Railway 서버 배포, App Store 우선 배포 후 Google Play 배포
>
> **진행 상태 (2026-06-10):** iOS build 15 TestFlight 제출 완료. 소셜 로그인 전체 정상. pillarm.app 도메인 연결 완료. Android 빌드 대기. 오프라인 처리 및 관리자 패널 구현 완료.

---

## 현재 진행 상황

### 소셜 로그인

| 제공자 | 상태 | 비고 |
|--------|------|------|
| Apple | ✅ 완료 | 실기기 정상 동작 확인 |
| Google | ✅ 완료 | Railway GOOGLE_CLIENT_ID / GOOGLE_IOS_CLIENT_ID 설정 후 정상 동작 확인 |
| 카카오 | ✅ 완료 | 실기기 정상 동작 확인 |
| 네이버 | ❌ 제거됨 | 복잡도 대비 사용자 효용 낮아 2026-05-26 제거 |

### 빌드 / 배포

| 항목 | 상태 |
|------|------|
| iOS build 15 (v1.0.0) | ✅ TestFlight 제출 완료 (2026-06-02) |
| Android build | 📋 미시작 (iOS 안정화 후 진행 예정) |
| Google Play Console | 📋 미등록 |
| App Store 정식 심사 | 📋 테스트 완료 후 제출 예정 |

### 서버 (Railway)

| 항목 | 상태 |
|------|------|
| Railway 배포 | ✅ `https://pillarm-production.up.railway.app` |
| Apple 로그인 서버 검증 | ✅ |
| Google 로그인 서버 검증 | ✅ (iOS + 웹 클라이언트 ID 모두 허용하도록 개선) |
| 카카오 로그인 서버 검증 | ✅ |
| Firebase FCM | ✅ |
| 누락 알림 발송 (missedDoseNotifier) | ✅ |

### 주요 개선 사항 (2026-06-01 기준)

| 항목 | 내용 |
|------|------|
| 일정 삭제 개선 | 삭제 시 오늘 미완료 DoseEvent(taken 제외) 함께 제거 |
| 알림 로그인 연동 | 로그아웃 시 전체 알림 취소, 로그인 후 재스케줄 |
| 계정별 알림 분리 | 알림 data에 userId 포함, 포그라운드 핸들러에서 불일치 시 무음 처리 |
| Google 서버 검증 강화 | `GOOGLE_CLIENT_ID` + `GOOGLE_IOS_CLIENT_ID` 두 audience 모두 허용 |
| 날짜 일관성 수정 | 한국 자정~오전9시 날짜 불일치 (UTC vs 로컬) 해소 |
| 소유권 검증 추가 | PUT /sync 엔드포인트에서 userId 소유권 검증 → 타인 레코드 403 |

### 주요 개선 사항 (2026-06-02 기준, build 15)

| 항목 | 내용 |
|------|------|
| 커스텀 도메인 | `pillarm.app` 연결 — 초대 링크·개인정보처리방침 URL 반영 |
| QR 스캔 활성화 | `expo-camera` 설치로 보호 그룹 참여 QR 스캔 기능 동작 |
| 설정 화면 개편 | 계정 섹션 최상단 이동, 보호자 공유 우선순위 상향, 개발자 정보 제거 |
| 간편로그인 텍스트 | "소셜 로그인으로 시작하기" → "간편로그인으로 시작하기" |
| 약봉투 스캔 개선 | 용량 단위 드롭다운(정/mg/ml), 복용 시간 버튼 06~23시 전체 확장, 식사 시간 설정 반영 |
| 홈 배너 그룹핑 | 동일 시간대 2개 이상 약 → "비타민 외 N건" 형식 표시 |
| 수정 화면 검색 버그 수정 | 일정 수정 진입 시 기존 약 이름으로 자동 검색되던 문제 해결 |
| 스캔 결과 이탈 경고 | 스캔 결과 화면에서 뒤로가기 시 확인 Alert 추가 |

---

## 1. 간편 로그인 (Social OAuth)

### 1-1. 지원 플랫폼

| 제공자 | iOS | Android | 구현 상태 | 비고 |
|--------|-----|---------|-----------|------|
| Apple | ✅ 필수 | ❌ | ✅ 완료 | App Store 규정상 타사 소셜 로그인 제공 시 필수 |
| Google | ✅ | ✅ | ✅ 완료 | `@react-native-google-signin/google-signin` |
| Kakao | ✅ | ✅ | ✅ 완료 | `@react-native-kakao/core` + `@react-native-kakao/user` |
| Naver | — | — | ❌ 제거됨 | 2026-05-26 사용자 요청으로 완전 삭제 |
| Facebook | — | — | ❌ 제외 | 우선순위 낮아 미구현 |

> ⚠️ Apple·Google·Kakao는 네이티브 모듈을 포함하므로 **Expo Go 사용 불가**, 개발 빌드(`expo-dev-client`) 필요.

---

### 1-2. 데이터 모델

#### 서버 — Prisma User 모델

```prisma
model User {
  id           String   @id @default(uuid())
  email        String?  @unique
  passwordHash String?  // 소셜 전용 계정은 null
  name         String?
  fcmToken     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  /// OAuth provider (null = 이메일 가입, "apple" | "google" | "kakao")
  provider   String?
  providerId String?  // 소셜 제공자의 고유 ID

  refreshTokens RefreshToken[]
  @@unique([provider, providerId])
}
```

---

### 1-3. 백엔드 API

#### POST /auth/social

```
Body: {
  provider: 'apple' | 'google' | 'kakao'
  idToken?: string      // Apple, Google
  accessToken?: string  // Kakao
  name?: string         // Apple 최초 로그인 시 이름 전달
  fcmToken?: string
}
Response: { accessToken, refreshToken, userId, name, isNewUser }
```

**서버 검증 로직**

| 제공자 | 검증 방법 |
|--------|-----------|
| Apple | `apple-signin-auth`로 idToken JWT 검증 (`APPLE_CLIENT_ID` audience) |
| Google | `google-auth-library`로 idToken 검증 (`GOOGLE_CLIENT_ID` + `GOOGLE_IOS_CLIENT_ID` 두 audience 허용) |
| Kakao | `https://kapi.kakao.com/v2/user/me` 호출 |

**Railway 필수 환경 변수**

| 변수 | 값 |
|------|-----|
| `APPLE_CLIENT_ID` | `com.seungrokj.pillarm` |
| `GOOGLE_CLIENT_ID` | `131302702516-83s151jjadkcqrhdrh054b3986brte5r.apps.googleusercontent.com` |
| `GOOGLE_IOS_CLIENT_ID` | `131302702516-igvegcggjg5mk6pc8nfllaalda99scul.apps.googleusercontent.com` |

**신규/기존 계정 처리 흐름**

```
1. 제공자 토큰 검증 → providerId, email 획득
2. DB에서 [provider, providerId]로 User 조회
   - 있으면 → 기존 계정, JWT 발급
   - 없고 email 동일한 이메일/비밀번호 계정 있으면 → 409 (자동 연결 금지)
   - 없고 email 동일한 다른 소셜 계정 있으면 → 409 (제공자 안내)
   - 없으면 → 신규 User 생성
3. AccessToken + RefreshToken 발급 후 반환
```

---

### 1-4. 클라이언트 구현

#### 파일 구조

```
src/features/socialAuth/
├── appleAuth.ts      ← expo-apple-authentication 래퍼
├── googleAuth.ts     ← @react-native-google-signin 래퍼
├── kakaoAuth.ts      ← @react-native-kakao/user 래퍼
├── socialAuthApi.ts  ← POST /auth/social 공통 API 호출
└── index.ts          ← re-export
```

#### app.json 플러그인 설정

```json
{
  "expo": {
    "scheme": "pillarm",
    "plugins": [
      "expo-apple-authentication",
      ["@react-native-google-signin/google-signin", {
        "iosUrlScheme": "com.googleusercontent.apps.131302702516-igvegcggjg5mk6pc8nfllaalda99scul"
      }],
      ["@react-native-kakao/core", {
        "nativeAppKey": "8dc3f74482bc4d09a9c1c8502acf99c4",
        "isKakaoTalkLoginAvailable": true
      }]
    ]
  }
}
```

---

### 1-5. 완료 기준 (AC)

- [x] 소셜 로그인 클라이언트 코드 구현 (Apple / Google / Kakao)
- [x] POST /auth/social API 연동
- [x] EAS Build 설정 및 app.json 플러그인 등록
- [x] Apple 로그인 실기기 정상 동작 확인
- [x] 카카오 로그인 실기기 정상 동작 확인
- [x] Google 로그인 실기기 정상 동작 확인
- [x] 이메일/비밀번호 계정과 동일 이메일 소셜 로그인 시 409 처리
- [x] 이메일 로그인 화면(SignupScreen·ForgotPasswordScreen) 완전 제거
- [x] 소셜 전용 계정 비밀번호 변경 메뉴 미노출
- [x] 로그아웃 시 알림 전체 취소
- [x] 로그인 후 스케줄 알림 재등록

---

## 2. Railway 서버 배포 ✅ 완료

| 항목 | 내용 |
|------|------|
| 플랫폼 | Railway |
| 서버 URL | `https://pillarm-production.up.railway.app` |
| DB | Supabase PostgreSQL (ap-southeast-2) |
| 빌드 | Nixpacks 자동 감지 |
| 배포 트리거 | GitHub `master` 브랜치 push 시 자동 배포 |

### 설정 파일 (`server/railway.toml`)

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install && npm run build && npx prisma generate"

[deploy]
startCommand = "npx prisma migrate deploy && npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

---

## 3. EAS Build 설정 ✅ 완료

### 주요 설정값

| 항목 | 값 |
|------|-----|
| Bundle ID | `com.seungrokj.pillarm` |
| Apple Team ID | `9AU7GMJTRW` |
| App Store Connect App ID | `6770390217` |
| 현재 iOS buildNumber | `15` |
| 현재 Android versionCode | `10` |

### EAS Secrets (등록 완료)

| 키 | 용도 |
|----|------|
| `EXPO_PUBLIC_SERVER_URL` | Railway 서버 URL |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google iOS OAuth |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Web OAuth |
| `EXPO_PUBLIC_MFDS_API_KEY` | 식약처 API |

---

## 4. App Store 배포

### 사전 준비 현황

| 항목 | 상태 |
|------|------|
| Apple Developer 계정 승인 | ✅ (2026-05-18) |
| App Store Connect 앱 등록 | ✅ 앱 이름: 필람 - 약 복용 알림 |
| 개인정보 처리방침 | ✅ `https://pillarm.app/privacy-policy.html` |
| TestFlight 내부 테스트 | 🔧 진행 중 (build 15) |
| 스크린샷 준비 | 📋 미완료 |
| App Store 정식 심사 제출 | 📋 미완료 |

### 완료 기준 (AC)

- [x] EAS Build 프로덕션 빌드 성공
- [x] TestFlight 제출 완료
- [x] 개인정보 처리방침 페이지 공개
- [ ] TestFlight 실기기 테스트 완료 (크래시 없음, 소셜 로그인 모두 정상)
- [ ] App Store Connect 스크린샷·메타데이터 업로드
- [ ] App Store 정식 심사 통과
- [ ] App Store 출시

---

## 5. Google Play 배포

| 항목 | 상태 |
|------|------|
| Google Play Console 등록 | 📋 미완료 |
| Android AAB 빌드 | 📋 미완료 (versionCode: 10 준비) |
| 스토어 등록정보 | 📋 미완료 |

### 완료 기준 (AC)

- [ ] Android AAB 빌드 성공 (`eas build --platform android --profile production`)
- [ ] Google Play Console 앱 등록
- [ ] 내부 테스트 트랙 등록 및 테스트 완료
- [ ] 스토어 등록정보·스크린샷 업로드
- [ ] Google Play 심사 통과 및 출시

---

## 6. Phase 3 전체 완료 기준

- [x] 소셜 로그인 구현 (Apple / Google / Kakao)
- [x] EAS Build 설정 완료
- [x] Railway 서버 배포
- [x] iOS TestFlight build 15 제출
- [x] 개인정보 처리방침 공개
- [ ] Google 로그인 실기기 테스트 통과
- [ ] App Store 정식 출시
- [ ] Google Play 정식 출시

---

## 7. 오프라인 처리 ✅ 구현 완료 (2026-06-10)

### 설계 원칙

핵심 기능(홈·기록·통계·알림)은 로컬 SQLite 기반이므로 **오프라인에서 완전 동작**한다.
온라인 전용 기능(보호자 그룹, 서버 동기화)에만 가드 UI를 적용한다.

### 구현 내용

| 항목 | 파일 | 내용 |
|------|------|------|
| 네트워크 상태 스토어 | `src/store/networkStore.ts` | `isOnline` + `hasPendingSync` Zustand 스토어 |
| 오프라인 배너 | `src/components/OfflineBanner.tsx` | 오프라인 시 화면 하단에 절대 위치로 표시 |
| NetInfo 구독 | `App.tsx` | 앱 전역 연결 감지, 재연결 시 `retrySyncIfPending()` 호출 |
| 동기화 큐잉 | `src/sync/syncService.ts` | `initialPush` 실패 시 pending 마킹 → 재연결 시 자동 재시도 |
| 보호자 그룹 가드 | `src/features/careCircle/CareCircleScreen.tsx` | 오프라인 시 배너로 안내 |

### 오프라인 동작 매트릭스

| 기능 | 오프라인 | 재연결 시 |
|------|---------|-----------|
| 홈·복용 체크 | ✅ 완전 동작 | — |
| 기록·통계 | ✅ 완전 동작 | — |
| 로컬 알림 | ✅ 완전 동작 | — |
| 서버 동기화 | ⏸ pending 마킹 | 자동 재시도 |
| 보호자 그룹 | ⚠️ 배너 안내 | 자동 갱신 |
| 소셜 로그인 | ❌ 불가 (인터넷 필수) | — |
| 약봉투 스캔 AI | ❌ 불가 (서버 필수) | — |

### 서버 요구사항

없음 — 순수 클라이언트 측 구현.

---

## 8. 관리자 패널 ✅ 구현 완료 (2026-06-10)

### 설계 원칙

- 서버에서 로그인 응답에 `isAdmin: boolean` 포함 → 클라이언트에서 관리자 여부 판단
- 설정 화면에 관리자 전용 섹션 조건부 렌더링 (일반 사용자에게는 보이지 않음)
- 관리자 API는 서버에서 별도 권한 미들웨어로 보호

### 구현 내용

| 항목 | 파일 | 내용 |
|------|------|------|
| 관리자 상태 저장 | `src/store/authStore.ts` | `isAdmin` 필드, `@pillarm/is_admin` AsyncStorage 키 |
| 로그인 응답 | `src/features/socialAuth/socialAuthApi.ts` | `SocialAuthResponse.isAdmin?: boolean` |
| 관리자 API | `src/features/admin/adminApi.ts` | 통계·전체 push·기능 플래그 API 래퍼 |
| 관리자 화면 | `src/features/admin/AdminScreen.tsx` | 통계 대시보드·전체 push 발송·기능 플래그 토글 |
| 설정 진입점 | `src/app/settings/SettingsScreen.tsx` | `isAdmin` 일 때만 "관리자 패널" 항목 노출 |
| 네비게이션 | `src/navigation/types.ts`, `ScheduleStackNavigator.tsx` | `Admin` 라우트 추가 |

### 관리자 화면 기능

| 기능 | 설명 |
|------|------|
| 유저 통계 | 전체 유저 수 / 오늘 활성 유저 / 이번 주 신규 가입자 |
| 전체 push 발송 | 제목·내용 입력 후 모든 사용자에게 push 알림 발송 |
| 기능 플래그 | 서버 등록 기능 플래그 목록 조회 및 on/off 토글 |

### 서버 구현 현황 ✅ 완료 (2026-06-10)

| 항목 | 파일 | 내용 |
|------|------|------|
| Prisma 스키마 | `server/prisma/schema.prisma` | `User.isAdmin Boolean @default(false)`, `FeatureFlag` 모델 추가 |
| DB 마이그레이션 | `server/prisma/migrations/20260610000000_add_admin_and_feature_flags/` | `ALTER TABLE User ADD COLUMN isAdmin`, `CREATE TABLE FeatureFlag` |
| JWT 페이로드 | `server/src/lib/jwt.ts` | `TokenPayload.isAdmin?: boolean` 추가 |
| 관리자 미들웨어 | `server/src/middleware/auth.ts` | `requireAdmin` — JWT `isAdmin` 검증, 403 반환 |
| 로그인 응답 | `server/src/routes/socialAuth.ts` | `issueTokens`에서 DB `isAdmin` 읽어 JWT + 응답에 포함 |
| 토큰 갱신 | `server/src/routes/auth.ts` | `/auth/refresh`에서 DB `isAdmin` 최신값으로 재발급 |
| 관리자 라우터 | `server/src/routes/admin.ts` | `GET /admin/stats`, `POST /admin/broadcast`, `GET/PUT /admin/feature-flags` |
| 앱 등록 | `server/src/app.ts` | `app.use('/admin', adminRouter)` |

**관리자 계정 설정:** 서버 DB에서 직접 `UPDATE "User" SET "isAdmin" = true WHERE email = '이메일';`로 지정한다.

```
POST /auth/social 응답 (isAdmin 포함):
  { accessToken, refreshToken, userId, name, isNewUser, isAdmin }

GET  /admin/stats                → { totalUsers, activeToday, newThisWeek }
POST /admin/broadcast            → { title, body }  →  { sent, failed, total }
GET  /admin/feature-flags        → FeatureFlag[]
PUT  /admin/feature-flags/:key   → { enabled, description? }

모든 /admin/* 엔드포인트: requireAdmin 미들웨어 (isAdmin=false → 403)
```

---

## 9. 배포 전 최종 체크리스트

- [ ] 모든 소셜 로그인 실기기 정상 동작 확인
- [ ] 앱 버전 및 빌드 번호 확인 (`version`, `buildNumber` / `versionCode`)
- [ ] 불필요한 console.log 제거
- [ ] Apple Sign In 구현 확인 (필수)
- [ ] 개인정보 처리방침 URL 유효성 확인
- [ ] 앱 설명에 "진단·처방 기능 없음" 명시

### Railway 환경 변수 최종 확인

| 변수 | 확인 |
|------|------|
| `DATABASE_URL` | - |
| `DIRECT_URL` | - |
| `JWT_ACCESS_SECRET` | - |
| `JWT_REFRESH_SECRET` | - |
| `APPLE_CLIENT_ID` | - |
| `GOOGLE_CLIENT_ID` | - |
| `GOOGLE_IOS_CLIENT_ID` | - |
| `FIREBASE_PROJECT_ID` | - |
| `FIREBASE_CLIENT_EMAIL` | - |
| `FIREBASE_PRIVATE_KEY` | - |
