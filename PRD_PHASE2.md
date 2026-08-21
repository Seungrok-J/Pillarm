# PRD Phase 2 — 확장 기능

> **전제 조건:** Phase 1 MVP가 완료되어 실기기에서 정상 동작해야 한다.  
> **목표:** 포인트 리워드, 보호자 공유, 약 정보 DB 연동, AI 코칭 기능 추가

---

## 1. 추가 데이터 모델

### 1-1. MedicationCourse (복약 코스)

```ts
interface MedicationCourse {
  id: string;
  userId: string;
  title?: string;       // 예: "감기약 5일치"
  startDate: string;
  endDate?: string;
  source?: 'hospital' | 'pharmacy' | 'self';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface MedicationCourseItem {
  id: string;
  courseId: string;
  medicationId: string;
  dosePerIntakeValue?: number;
  dosePerIntakeUnit?: string;
  instructions?: string;
  sortOrder: number;
}
```

### 1-2. ReminderRule (알림 규칙 고도화)

```ts
type Channel = 'push' | 'sound' | 'vibration';
type QuietPolicy = 'delay' | 'keepSilent' | 'block';

interface ReminderRule {
  id: string;
  scheduleId: string;
  baseReminder: string;           // 예정 시간 기준
  repeatCount: number;
  repeatIntervalMinutes: number;
  channels: Channel[];
  quietHoursPolicy: QuietPolicy;
  createdAt: string;
  updatedAt: string;
}
```

### 1-3. CareCircle / CareMember / SharePolicy (보호자 그룹)

```ts
interface CareCircle {
  id: string;
  ownerUserId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

type MemberRole = 'admin' | 'viewer' | 'notifyOnly';

interface CareMember {
  id: string;
  careCircleId: string;
  memberUserId: string;
  role: MemberRole;
  createdAt: string;
}

type ShareScope = 'all' | 'specificMedication' | 'specificSchedule';
type NotificationPolicy = 'realtime' | 'dailySummary';

interface SharePolicy {
  id: string;
  careCircleId: string;
  shareScope: ShareScope;
  allowedFields: string[];  // ['status', 'time', 'note', 'photo']
  notificationPolicy: NotificationPolicy;
  createdAt: string;
  updatedAt: string;
}
```

### 1-4. PointLedger (포인트 원장)

```ts
type PointReason =
  | 'dose_taken'        // 복용 완료 +10
  | 'streak_7days'      // 7일 연속 +50
  | 'perfect_week'      // 주간 누락 0건 +30
  | 'theme_purchase'    // 테마 구매 -N
  | 'badge_unlock';     // 배지 획득 (0점)

interface PointLedger {
  id: string;
  userId: string;
  reason: PointReason;
  delta: number;          // 양수: 획득, 음수: 소비
  balance: number;        // 적립 후 잔액
  refId?: string;         // 연관 doseEventId 등
  createdAt: string;
}
```

---

## 2. 기능 요구사항

### F01 — 포인트(리워드) 시스템

**획득 규칙**

| 조건 | 포인트 | 비고 |
|------|--------|------|
| 복용 완료 1회 | +10 | graceMinutes 이내 완료만 인정 |
| 7일 연속 완료 | +50 | 연속 streak 유지 중 매 7일마다 |
| 주간 누락 0건 | +30 | 일요일 자정에 자동 집계 |

**소비 규칙**

| 항목 | 포인트 |
|------|--------|
| 앱 테마 변경 | -100 ~ -300 |
| 배지 잠금 해제 | -50 |

**UI**
- 홈 상단에 현재 포인트 및 streak 배지 표시
- 포인트 탭 → 획득/소비 내역 리스트
- 테마샵 화면 (기본 테마 5종)

**복용 버튼 활성화 창**

| 상태 | 조건 | 버튼 |
|------|------|------|
| `waiting` | plannedAt - 2시간 이전 | 숨김 (복용 불가) |
| `active` | plannedAt - 2시간 ~ plannedAt | 복용/건너뜀 활성 |
| `late` | plannedAt ~ plannedAt + graceMinutes | 복용/건너뜀 활성 |
| `missed` | plannedAt + graceMinutes 초과 | 숨김 (누락 처리) |
| `taken` | 복용 완료 | 비활성 표시 |
| `skipped` | 건너뜀 | 비활성 표시 |

DoseCard 에는 복용 가능 시각 힌트를 항상 표시한다:
- `waiting` → "{start}부터 복용 가능" (회색)
- `active` / `late` → "{end}까지 복용 가능" (회색)

`active` 와 `late` 는 내부 DB 상태로는 구분되지만, UI 상에서는 동일한 버튼·배경색·힌트로 표시한다.

**신뢰도 정책**
- 복용 완료 인정 범위 = `plannedAt - 2시간` ~ `plannedAt + graceMinutes`
- 이 범위 밖의 manual 완료는 포인트 미적립 (단, 기록은 남김)
- `DoseDisplayState` 와 `computeDisplayState` 는 `src/utils/doseDisplay.ts` 에 정의하여 DoseCard·HistoryScreen 이 동일 로직을 공유한다
- `late` 상태는 포인트·streak·AI 코칭 계산에서 `taken` 과 동일하게 취급한다

**테마 시스템**
- 5종 테마(기본·민트·코랄·라벤더·선셋) 정의 (`src/utils/themeManager.ts`)
- `useThemeStore` 를 통해 선택 테마를 AsyncStorage 에 저장하고 앱 재시작 시 복원
- `RootNavigator` 마운트 시 `loadTheme()` 호출 → 저장된 테마 즉시 적용
- 테마 primary 색상이 탭바·FAB·복용 버튼·포인트 배지·메모 저장 버튼에 반영됨

**일일 포인트 집계 (UTC 버그 수정)**
- `pointEngine.ts` 일일 5회 한도 쿼리를 `date(created_at) = ?` (UTC 기준) → `created_at >= localMidnight AND created_at < nextMidnight` (로컬 자정 UTC 범위) 방식으로 변경

**AC**
- [x] 복용 버튼이 `plannedAt - 2시간` ~ `plannedAt + graceMinutes` 창 안에서만 표시된다
- [x] 홈 화면과 기록 화면이 동일한 `computeDisplayState` 로 상태를 계산하여 일관되게 표시된다
- [x] 복용 완료 시 홈 화면에 "+10 포인트!" 토스트 표시
- [x] 일일 5회 한도 초과 시 토스트 메시지가 "오늘 포인트 한도를 채웠어요 💊"로 변경된다 (`markTaken` → `pointsAwarded` 반환)
- [x] 7일 연속 달성 시 축하 모달 표시 (`modal-streak`)
- [x] 포인트로 테마 구매 후 앱 색상 변경 적용 (탭바·FAB·복용 버튼 등 전체 반영)

---

### F02 — 보호자 공유

**플로우**

```
보호자 초대:
  1. 보호 대상자 → 초대 링크/QR 생성
  2. 보호자 앱에서 링크 수락
  3. SharePolicy 설정 (공유 범위, 알림 방식)

보호자 뷰:
  - 오늘 복용 현황 (읽기 전용)
  - 누락 발생 시 푸시 알림 수신
  - 복용 기록 열람 (SharePolicy.allowedFields 기준)
```

**백엔드 요구사항** (Phase 2에서 서버 도입 필요)

| 기능 | API |
|------|-----|
| 회원가입/로그인 | POST /auth/signup, POST /auth/login |
| 초대 링크 생성 | POST /care-circles/:id/invite |
| 초대 수락 | POST /care-circles/join |
| 복용 현황 조회 | GET /care-circles/:id/members/:userId/today |
| 실시간 알림 | Firebase Cloud Messaging |

**AC**
- [x] 회원가입/로그인 (JWT Access+Refresh token, rotation 지원) 구현
- [x] 초대 링크/코드 생성 및 수락 API 구현 (`POST /care-circles/:id/invite`, `POST /care-circles/join`)
- [x] 복용 현황 조회 API 구현 (`GET /care-circles/:id/members/:userId/today`)
- [x] 누락 발생 시 서버가 보호자에게 FCM 푸시 알림 발송 (5분 인터벌, `missedDoseNotifier.ts`)
- [x] 보호자는 보호 대상자의 오늘 복용 현황을 실시간으로 확인할 수 있다 (클라이언트 UI)
- [x] 보호 대상자가 공유를 해제하면 보호자 접근이 즉시 차단된다

---

### F03 — 약 정보 DB 연동

**데이터 소스:** 식품의약품안전처 의약품 개요 정보 API (공공데이터포털)

**기능**
- 일정 추가 시 약 이름 입력창에 자동완성 (debounce 300ms)
- 약 선택 시 용량/단위 자동 입력
- 약 색상/모양 정보 표시 (있는 경우)

**AC**
- [x] 약 이름 2글자 이상 입력 시 자동완성 드롭다운 표시
- [x] 오프라인 시에는 자동완성 숨기고 직접 입력 모드로 전환

---

### F04 — AI 코칭 (누락 패턴 기반)

**분석 조건:** 최근 30일 DoseEvent 데이터 기반

**코칭 메시지 예시**

| 패턴 | 메시지 |
|------|--------|
| 점심 복용 누락 多 | "점심 복용을 자주 놓치고 계세요. 식사 직후 알림으로 변경해볼까요?" |
| 미루기 3회 이상 | "아침 알림을 30분 늦춰보는 건 어떨까요?" |
| 7일 이상 연속 완료 | "훌륭해요! 이번 주도 이 페이스를 유지해봐요 💪" |

**구현 방식 (MVP 수준)**
- 클라이언트 측 규칙 기반 (ML 불필요)
- 통계 화면 하단 "AI 코칭" 섹션에 주 1회 메시지 표시
- 메시지 탭 시 해당 스케줄 수정 화면으로 이동 (Quick Fix)

**AC**
- [x] 주 1회 이상 누락이 있는 시간대에 코칭 메시지 자동 생성
- [x] 코칭 메시지에서 스케줄 수정으로 1탭 이동

---

### F05 — 약 봉투 QR 인식 (선택)

> ⚠️ 약국 QR 표준이 통일되지 않아 약국별 파싱 로직이 필요. 우선순위 낮음.

**기능**
- 카메라로 약 봉투 QR/바코드 스캔
- 파싱 결과를 일정 추가 화면에 자동 입력
- 인식 실패 시 수동 입력 폴백

---

## 3. Phase 2 완료 기준

- [x] 복용 버튼이 plannedAt ± 2시간 / graceMinutes 창 내에서만 활성화된다
- [x] 홈·기록 화면이 동일한 상태 계산 로직을 공유하여 일관된 상태를 표시한다
- [x] 일정 수정 시 동일 시각의 dose_event 중복 생성이 방지된다
- [x] 포인트 적립 일일 한도가 로컬 시간 기준 자정으로 정확하게 집계된다 (UTC range 쿼리)
- [x] 회원가입/로그인 및 보호자 초대 백엔드 API 구현
- [x] 포인트로 테마 구매 후 앱 색상 변경이 탭바·FAB·카드 버튼 전체에 반영된다
- [x] 7일 연속 달성 시 홈 화면에 축하 모달이 표시된다
- [x] 누락 발생 시 서버가 보호자에게 FCM 푸시 알림을 발송한다 (5분 인터벌)
- [x] 보호자가 피보호자의 오늘 복용 현황을 앱에서 확인할 수 있다 (클라이언트 UI)
- [x] 약 이름 자동완성이 온라인 상태에서 동작한다
- [x] AI 코칭 메시지가 실제 누락 패턴에 근거하여 표시된다
- [x] 서버 연동 후 기기 교체 시 데이터 복원이 가능하다
- [x] 복용 일정 관리 화면에서 종료된 일정은 기본 숨김이며 "지난 일정 N건 보기" 토글로 확인할 수 있다
- [x] 포인트 일일 한도(5회) 초과 복용 시 토스트 메시지가 한도 초과 안내로 변경된다
