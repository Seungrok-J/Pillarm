# PRD Phase 3 — 간편 로그인 & 스토어 배포

> **전제 조건:** Phase 2가 완료되어 보호자 공유·포인트·AI 코칭이 실기기에서 정상 동작해야 한다.  
> **목표:** 소셜 간편 로그인 추가, Railway 서버 배포, App Store 우선 배포 후 Google Play 배포
>
> **진행 상태 (2026-05-13):** 소셜 로그인 코드·EAS 빌드 설정·Railway 배포 완료. App Store / Google Play 배포 진행 전.

---

## 1. 간편 로그인 (Social OAuth)

### 1-1. 지원 플랫폼

| 제공자 | iOS | Android | 구현 상태 | 비고 |
|--------|-----|---------|-----------|------|
| Apple | ✅ 필수 | ❌ | ✅ 완료 | App Store 규정상 타사 소셜 로그인 제공 시 Apple 로그인 필수 |
| Google | ✅ | ✅ | ✅ 완료 | `@react-native-google-signin/google-signin` |
| Kakao | ✅ | ✅ | ✅ 완료 | `@react-native-kakao/core` + `@react-native-kakao/user` |
| Naver | ✅ | ✅ | ✅ 완료 | `expo-auth-session` OAuth2 방식 (네이티브 SDK 불필요) |
| Facebook | — | — | ❌ 제외 | 우선순위 낮아 미구현 |

> ⚠️ Apple·Google·Kakao는 네이티브 모듈을 포함하므로 **Expo Go 사용 불가**, 개발 빌드(`expo-dev-client`) 필요.  
> Naver는 `expo-auth-session` 기반 순수 JS OAuth2 구현으로 Expo Go에서도 동작.

---

### 1-2. 데이터 모델 변경

#### 서버 — Prisma 스키마 추가

```prisma
model User {
  // 기존 필드 유지
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String?  // 소셜 전용 계정은 null
  name         String?
  fcmToken     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Phase 3 추가
  provider   Provider @default(LOCAL)
  providerId String?  // 소셜 제공자의 고유 ID

  refreshTokens RefreshToken[]

  @@unique([provider, providerId])
}

enum Provider {
  LOCAL
  APPLE
  GOOGLE
  KAKAO
  NAVER
  FACEBOOK
}
```

---

### 1-3. 백엔드 API

#### 공통 소셜 로그인 엔드포인트

```
POST /auth/social
Body: {
  provider: 'apple' | 'google' | 'kakao' | 'naver' | 'facebook'
  idToken?: string      // Apple, Google
  accessToken?: string  // Kakao, Naver, Facebook
  name?: string         // Apple은 최초 로그인 시에만 이름 전달
}
Response: { accessToken, refreshToken, userId, name, isNewUser }
```

**서버 검증 로직 (제공자별)**

| 제공자 | 검증 방법 |
|--------|-----------|
| Apple | `apple-signin-auth` 라이브러리로 idToken JWT 검증 |
| Google | `google-auth-library`로 idToken 검증 |
| Kakao | `https://kapi.kakao.com/v2/user/me` 호출 |
| Naver | `https://openapi.naver.com/v1/nid/me` 호출 |
| Facebook | `https://graph.facebook.com/me` 호출 |

**신규/기존 계정 처리 흐름**

```
1. 제공자 토큰 검증 → providerId, email 획득
2. DB에서 [provider, providerId]로 User 조회
   - 있으면 → 기존 계정, 토큰 발급
   - 없고 email 동일한 LOCAL 계정 있으면 → 소셜 연결 (provider/providerId 업데이트)
   - 없으면 → 신규 User 생성
3. AccessToken + RefreshToken 발급 후 반환
```

---

### 1-4. 클라이언트 구현

#### 설치 패키지 (완료)

```bash
# 개발 빌드 클라이언트 (필수)
npx expo install expo-dev-client

# Apple Sign In
npx expo install expo-apple-authentication

# Google Sign In
npm install @react-native-google-signin/google-signin

# Kakao
npm install @react-native-kakao/core @react-native-kakao/user

# Naver (expo-auth-session 방식 — react-native-naver-login 미사용)
npx expo install expo-auth-session expo-web-browser
```

> **네이버 구현 변경 이유:** `react-native-naver-login`은 네이티브 모듈 빌드 복잡도가 높아 `expo-auth-session` 기반 OAuth2 Authorization Code Flow로 대체.  
> iOS URL Scheme(`naveridlogin_ios_<CLIENT_ID>`)은 `app.json` infoPlist의 `CFBundleURLTypes`에 등록.

#### app.json 플러그인 설정 (실제 구성)

```json
{
  "expo": {
    "scheme": "pillarm",
    "plugins": [
      "expo-apple-authentication",
      ["@react-native-google-signin/google-signin", {
        "iosUrlScheme": "com.googleusercontent.apps.<IOS_CLIENT_ID>"
      }],
      ["@react-native-kakao/core", {
        "nativeAppKey": "KAKAO_NATIVE_APP_KEY",
        "isKakaoTalkLoginAvailable": true
      }],
      "expo-web-browser",
      ["expo-build-properties", {
        "android": {
          "extraMavenRepos": ["https://devrepo.kakao.com/nexus/content/groups/public/"]
        }
      }]
    ],
    "ios": {
      "infoPlist": {
        "CFBundleURLTypes": [
          { "CFBundleURLSchemes": ["naveridlogin_ios_<NAVER_CLIENT_ID>"] }
        ]
      }
    }
  }
}
```

#### 파일 구조 (완료)

```
src/
├── features/
│   └── socialAuth/
│       ├── appleAuth.ts       ← expo-apple-authentication 래퍼 ✅
│       ├── googleAuth.ts      ← google-signin 래퍼 ✅
│       ├── kakaoAuth.ts       ← @react-native-kakao/user 래퍼 ✅
│       ├── naverAuth.ts       ← expo-auth-session OAuth2 흐름 ✅
│       ├── socialAuthApi.ts   ← POST /auth/social 호출 ✅
│       └── index.ts           ← re-export ✅
└── app/
    └── auth/
        └── LoginScreen.tsx    ← 소셜 버튼 추가
```

#### LoginScreen 버튼 추가 (UI)

```
[기존 이메일 로그인 폼]

─────────── 또는 ───────────

[ 🍎  Apple로 계속하기   ]   ← iOS만 표시
[ G   Google로 계속하기  ]
[ K   카카오로 계속하기  ]
[ N   네이버로 계속하기  ]
```

---

### 1-5. 제공자별 설정 요구사항

#### Apple
- Apple Developer Console → Certificates, Identifiers & Profiles → App ID에서 `Sign In with Apple` 활성화
- App Store Connect에서 `Sign In with Apple` 기능 활성화
- `expo-apple-authentication`은 iOS 시뮬레이터에서도 동작

#### Google
- Firebase Console → Authentication → Google 제공자 활성화
- OAuth 2.0 클라이언트 ID (iOS용, Android용 각각 생성)
- Google Cloud Console에서 `iOS Bundle ID` 및 `SHA-1 인증서 지문` 등록

#### Kakao
- [Kakao Developers](https://developers.kakao.com) → 앱 등록
- iOS Bundle ID, Android 패키지명 및 키 해시 등록
- `카카오 로그인` 기능 활성화, `profile`, `account_email` 동의 항목 설정

#### Naver
- [Naver Developers](https://developers.naver.com) → 앱 등록 → `네이버 로그인` API 추가
- Callback URL 등록: `pillarm://oauth` (expo-auth-session redirect URI)
- iOS: `app.json` infoPlist의 `CFBundleURLSchemes`에 `naveridlogin_ios_<CLIENT_ID>` 추가
- CLIENT_ID / CLIENT_SECRET은 `.env`의 `EXPO_PUBLIC_NAVER_CLIENT_ID` / `EXPO_PUBLIC_NAVER_CLIENT_SECRET`으로 관리 (현재 `naverAuth.ts` 하드코딩 → 배포 전 환경변수로 이동 필요)

---

### 1-6. 완료 기준 (AC)

- [x] 소셜 로그인 클라이언트 코드 구현 (Apple / Google / Kakao / Naver)
- [x] `POST /auth/social` API 연동 (`socialAuthApi.ts`)
- [x] EAS Build 설정 (`eas.json`) 및 app.json 플러그인 등록
- [ ] Apple 로그인 → 신규 계정 생성 후 앱 진입 (실기기 테스트)
- [ ] Apple 로그인 → 기존 계정 재로그인 시 데이터 유지
- [ ] Google 로그인 (iOS/Android) → 신규·재로그인 모두 정상 동작
- [ ] 카카오 로그인 (iOS/Android) → 신규·재로그인 모두 정상 동작
- [ ] 네이버 로그인 (iOS/Android) → 신규·재로그인 모두 정상 동작
- [ ] 이메일 계정과 동일 이메일의 소셜 로그인 시 계정이 자동 연결됨
- [ ] 소셜 로그인 후 기존 기능(복용 기록, 보호자 공유 등) 정상 동작
- [ ] 소셜 전용 계정은 비밀번호 변경 메뉴가 노출되지 않음
- [x] `naverAuth.ts` CLIENT_ID/SECRET 환경변수 이전 (`EXPO_PUBLIC_NAVER_CLIENT_ID/SECRET`)

---

## 2. Railway 서버 배포 ✅ 완료

스토어 배포 전 클라우드 서버가 필요하다. 로컬 IP(`192.168.0.x`)로는 앱 심사 시 서버 연결 실패로 거절됨.

### 2-1. 배포 구성

| 항목 | 내용 |
|------|------|
| 플랫폼 | [Railway](https://railway.app) |
| 빌더 | Nixpacks (자동 감지) |
| 빌드 커맨드 | `npm install && npm run build && npx prisma generate` |
| 시작 커맨드 | `npx prisma migrate deploy && npm start` |
| 재시작 정책 | 실패 시 자동 재시작 (최대 10회) |

### 2-2. 설정 파일 (`server/railway.toml`)

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install && npm run build && npx prisma generate"

[deploy]
startCommand = "npx prisma migrate deploy && npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### 2-3. Railway 환경 변수 설정

Railway 대시보드 → 프로젝트 → Variables에서 설정:

| 변수 | 값 |
|------|-----|
| `DATABASE_URL` | Railway PostgreSQL 플러그인 자동 주입 |
| `JWT_ACCESS_SECRET` | 32자 이상 랜덤 문자열 |
| `JWT_REFRESH_SECRET` | 위와 다른 32자 이상 랜덤 문자열 |
| `NODE_ENV` | `production` |
| `FIREBASE_PROJECT_ID` | FCM 사용 시 |
| `FIREBASE_CLIENT_EMAIL` | FCM 사용 시 |
| `FIREBASE_PRIVATE_KEY` | FCM 사용 시 |
| `APPLE_TEAM_ID` | Apple 로그인 서버 검증 시 |

### 2-4. 클라이언트 환경 변수

앱에서 Railway URL 우선 사용:

```bash
# .env 또는 EAS Secrets
EXPO_PUBLIC_SERVER_URL=https://<your-app>.up.railway.app
```

우선순위: `EXPO_PUBLIC_SERVER_URL` (클라우드) > `EXPO_PUBLIC_SERVER_IP` (로컬 실기기) > `10.0.2.2:3000` (에뮬레이터)

### 2-5. 완료 기준 (AC)

- [x] `server/railway.toml` 생성
- [x] `API_BASE_URL` 우선순위 로직 적용 (`careCircleApi.ts`)
- [x] Railway 배포 후 엔드포인트 정상 응답 확인
- [x] `EXPO_PUBLIC_SERVER_URL` EAS Secrets에 등록
- [x] `EXPO_PUBLIC_NAVER_CLIENT_ID` / `EXPO_PUBLIC_NAVER_CLIENT_SECRET` EAS Secrets에 등록

---

## 3. App Store 배포 (우선)

### 2-1. 사전 준비

| 항목 | 내용 |
|------|------|
| Apple Developer Program | $99/년 등록 필요 ([애플 개발자 사이트](https://developer.apple.com)) |
| Bundle ID | `com.pillarm.app` (고유값, 등록 후 변경 불가) |
| 앱 이름 | 필람 (App Store 검색용 영문명: Pillarm) |
| 카테고리 | Health & Fitness (주), Medical (부) |
| 연령 등급 | 4+ |

---

### 2-2. EAS Build 설정

#### 패키지 설치

```bash
npm install -g eas-cli
eas login
eas build:configure
```

#### eas.json (완료)

```json
{
  "cli": { "version": ">= 13.0.0", "appVersionSource": "local" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "apk" }
    },
    "production": {
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "seungrokjeong@gmail.com",
        "ascAppId": "APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "APPLE_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "production"
      }
    }
  }
}
```

#### app.json 필수 설정

```json
{
  "expo": {
    "name": "필람",
    "slug": "pillarm",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.pillarm.app",
      "buildNumber": "1",
      "infoPlist": {
        "NSCameraUsageDescription": "약 봉투 QR 코드 스캔에 사용됩니다",
        "NSUserNotificationsUsageDescription": "복용 시간 알림을 보내기 위해 필요합니다"
      },
      "supportsTablet": false
    }
  }
}
```

---

### 2-3. App Store Connect 설정

#### 앱 정보 (메타데이터)

| 항목 | 내용 |
|------|------|
| 앱 이름 | 필람 - 약 복용 알림 |
| 부제목 | 스마트 복약 관리 |
| 키워드 | 약알림, 복약관리, 처방약, 건강관리, 약복용, 리마인더 |
| 설명 | 약을 제때 복용할 수 있도록 도와주는 스마트 복약 관리 앱입니다. 복용 일정 등록, 시간 알림, 복용 기록, 보호자 공유 기능을 제공합니다. |
| 지원 URL | 개인 웹사이트 또는 GitHub Pages |
| 개인정보 처리방침 URL | 필수 (서버에 사용자 데이터 저장하므로) |

#### 스크린샷 규격 (필수)

| 기기 | 해상도 | 필요 장수 |
|------|--------|-----------|
| iPhone 6.9" (15 Pro Max) | 1320×2868 | 3~10장 |
| iPhone 6.7" (14 Plus) | 1284×2778 | 3~10장 |
| iPad Pro 13" (선택) | 2064×2752 | 3~10장 |

> 💡 스크린샷은 실기기 또는 Xcode 시뮬레이터로 촬영. 한국어 스크린샷 준비.

#### 스크린샷 추천 구성 (5장)

1. 홈 화면 — 오늘의 복용 목록
2. 복용 완료 — 탭 1회로 완료 처리
3. 일정 추가 — 약 검색 및 시간 설정
4. 통계 화면 — 주간 복용률 그래프
5. 보호자 공유 — 초대 및 현황 확인

---

### 2-4. 개인정보 처리방침 필수 항목

서버에 이메일, 이름, 복용 기록을 저장하므로 앱 심사 전 개인정보 처리방침 페이지 필요.

**최소 포함 내용:**
- 수집 항목: 이메일, 이름, 약 복용 기록
- 수집 목적: 계정 관리, 보호자 공유 서비스 제공
- 보관 기간: 회원 탈퇴 시 즉시 삭제
- 제3자 제공: 없음 (Firebase FCM 제외)
- 문의처: 개발자 이메일

> 💡 GitHub Pages로 간단한 개인정보 처리방침 페이지를 만들어 URL로 등록하면 됨.

---

### 2-5. App Store 배포 절차

```
1. EAS Build로 프로덕션 빌드 생성
   eas build --platform ios --profile production

2. TestFlight 내부 테스트 (선택 권장)
   eas submit --platform ios  (TestFlight 업로드)
   → App Store Connect에서 내부 테스터 초대 → 실기기 테스트

3. 앱 심사 제출
   App Store Connect → 새 버전 생성 → 스크린샷·메타데이터 입력
   → 심사 제출

4. 심사 기간: 통상 24~48시간 (주말 포함 최대 7일)

5. 승인 후 → 출시 (즉시 또는 예약 출시)
```

#### 심사 거절 주요 사유 및 대비

| 사유 | 대비 |
|------|------|
| 개인정보 처리방침 URL 없음 | 2-4 항목 사전 준비 |
| Apple 로그인 미구현 | 소셜 로그인 제공 시 Apple 로그인 필수 |
| 크래시 발생 | TestFlight에서 충분히 테스트 후 제출 |
| 앱 설명과 실제 기능 불일치 | 스크린샷과 설명이 실제 UI와 동일해야 함 |
| 의료 앱 관련 규정 위반 | "의학적 진단/처방" 기능 없음을 설명에 명시 |

---

### 2-6. 완료 기준 (AC)

- [x] EAS Build 설정 완료 (`eas.json`, iOS + Android 프로파일)
- [ ] EAS Build 프로덕션 빌드 성공 (`eas build --platform ios --profile production`)
- [ ] TestFlight에서 실기기 테스트 완료 (크래시 없음)
- [x] 개인정보 처리방침 페이지 생성 (https://seungrok-j.github.io/Pillarm/privacy-policy.html)
- [ ] App Store Connect에 개인정보 처리방침 URL 등록
- [ ] App Store Connect 메타데이터·스크린샷 업로드
- [ ] Apple 앱 심사 통과
- [ ] App Store 출시 확인

---

## 4. Google Play 배포

### 4-1. 사전 준비

| 항목 | 내용 |
|------|------|
| Google Play Console | 1회 등록비 $25 ([play.google.com/console](https://play.google.com/console)) |
| 패키지명 | `com.pillarm.app` (app.json의 android.package와 동일) |
| 서명 키 | EAS Credentials로 자동 관리 권장 |

#### app.json Android 설정 추가

```json
{
  "expo": {
    "android": {
      "package": "com.pillarm.app",
      "versionCode": 1,
      "permissions": [
        "POST_NOTIFICATIONS",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE"
      ],
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

---

### 4-2. Google Play 배포 절차

```
1. EAS Build로 Android AAB 생성
   eas build --platform android --profile production

2. Google Play Console → 새 앱 등록
   → 내부 테스트 트랙 업로드 (AAB 파일)
   → 내부 테스터 최대 100명 초대

3. 프로덕션 트랙 제출
   → 스토어 등록정보 입력 (한국어)
   → 개인정보 처리방침 URL 입력
   → 앱 콘텐츠 설문 응답 (의료 앱 아님, 약 복용 보조 도구임을 명시)

4. 심사 기간: 통상 1~3일 (처음 제출 시 최대 7일)

5. 승인 후 → 단계적 출시 (10% → 50% → 100%)
```

#### 스크린샷 규격

| 항목 | 규격 |
|------|------|
| 스마트폰 스크린샷 | 최소 2장, 최대 8장 (16:9 또는 9:16) |
| 피처드 이미지 | 1024×500 (선택이나 권장) |

---

### 4-3. 완료 기준 (AC)

- [x] EAS Build Android AAB 빌드 프로파일 설정 (`eas.json` production android)
- [ ] EAS Build Android AAB 빌드 성공
- [ ] Google Play 내부 테스트 트랙 등록 및 테스트 완료
- [ ] 스토어 등록정보·스크린샷 업로드 (한국어)
- [ ] Google Play 앱 심사 통과
- [ ] Google Play 출시 확인

---

## 5. Phase 3 전체 완료 기준

- [x] 소셜 로그인 클라이언트 코드 구현 (Apple / Google / Kakao / Naver)
- [x] EAS Build 설정 완료
- [x] Railway 서버 배포 설정 완료
- [ ] Apple·Google·카카오·네이버 로그인이 iOS에서 모두 정상 동작 (실기기 테스트)
- [ ] Google·카카오·네이버 로그인이 Android에서 모두 정상 동작
- [ ] 소셜 로그인 후 기존 이메일 계정 데이터와 연결이 가능
- [ ] `naverAuth.ts` CLIENT_ID/SECRET 환경변수 이전
- [ ] App Store에 정식 출시 완료
- [ ] Google Play에 정식 출시 완료
- [ ] 개인정보 처리방침 페이지 공개

---

## 6. 참고 — 배포 체크리스트

### App Store 제출 전 최종 점검

- [ ] 앱 버전 및 빌드 번호 업데이트 (`version`, `buildNumber`)
- [ ] 프로덕션 서버 URL로 변경 (로컬 IP 제거)
- [ ] 불필요한 console.log 제거
- [ ] 앱 아이콘 모든 해상도 준비 (`icon.png` 1024×1024)
- [ ] 스플래시 스크린 준비
- [ ] Apple Sign In 구현 확인 (필수)
- [ ] 개인정보 처리방침 URL 유효성 확인
- [ ] 앱 설명에 "진단·처방 기능 없음" 명시

### 환경 변수 분리 (로컬 → 프로덕션)

```bash
# .env (개발)
EXPO_PUBLIC_SERVER_IP=192.168.0.x   # 로컬 실기기 테스트용

# EAS Secrets (프로덕션 빌드)
EXPO_PUBLIC_SERVER_URL=https://<your-app>.up.railway.app
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS OAuth 클라이언트 ID>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web OAuth 클라이언트 ID>
```

> ✅ `EXPO_PUBLIC_SERVER_URL` 우선순위 로직이 이미 `careCircleApi.ts`에 적용됨.  
> Railway URL이 설정되면 자동으로 클라우드 서버를 사용함.

### 소셜 로그인 사전 등록 체크

- [ ] Naver Developers: Callback URL `pillarm://oauth` 등록
- [ ] Google Cloud Console: iOS Bundle ID `com.pillarm.app`, SHA-1 등록
- [ ] Kakao Developers: iOS Bundle ID, Android 패키지명, 키 해시 등록
- [ ] Apple Developer: `Sign In with Apple` 기능 활성화
