# PRD Phase 1 — MVP

> **목표:** 약 등록 → 알림 수신 → 복용 체크 → 기록 확인까지 핵심 루프를 동작시킨다.  
> **기간:** 4주  
> **완료 기준:** 실기기에서 약을 등록하면 지정 시간에 알림이 오고, 탭 1회로 완료 처리되며, 주간 완료율이 통계 화면에 표시된다.

---

## 1. 데이터 모델 (MVP 최소 스키마)

### 1-1. Medication (약)

```ts
interface Medication {
  id: string;           // UUID
  name: string;         // 약 이름 (필수)
  dosageValue?: number; // 용량 (예: 500)
  dosageUnit?: string;  // 단위 (mg / 정 / mL)
  color?: string;       // 앱 내 색상 구분용 hex
  isActive: boolean;
  createdAt: string;    // ISO8601
  updatedAt: string;
}
```

### 1-2. Schedule (복용 스케줄)

```ts
type ScheduleType = 'fixed' | 'interval' | 'asNeeded';
type WithFood = 'before' | 'after' | 'none';

interface Schedule {
  id: string;
  medicationId: string;
  scheduleType: ScheduleType;   // MVP는 'fixed'만 구현
  startDate: string;            // YYYY-MM-DD
  endDate?: string;             // null이면 상시
  daysOfWeek?: number[];        // 0=일 ~ 6=토, null이면 매일
  times: string[];              // ["08:00", "13:00", "20:00"]
  withFood: WithFood;
  graceMinutes: number;         // 지연 허용치 (기본 120분)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 1-3. DoseEvent (복용 이벤트)

```ts
type DoseStatus = 'scheduled' | 'taken' | 'late' | 'missed' | 'skipped';
type DoseSource = 'notification' | 'manual';

interface DoseEvent {
  id: string;
  scheduleId: string;
  medicationId: string;
  plannedAt: string;            // ISO8601 — 예정 복용 일시
  status: DoseStatus;
  takenAt?: string;             // 실제 완료 일시
  snoozeCount: number;          // 미루기 횟수
  source: DoseSource;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 1-4. UserSettings (설정)

```ts
interface UserSettings {
  userId: 'local';              // MVP는 단일 로컬 사용자
  timeZone: string;             // 기기 타임존
  quietHoursStart?: string;     // "23:00"
  quietHoursEnd?: string;       // "07:00"
  defaultSnoozeMinutes: number; // 기본 15
  maxSnoozeCount: number;       // 기본 3
  missedToLateMinutes: number;  // 기본 120
  autoMarkMissedEnabled: boolean;
}
```

### 1-5. SQLite 테이블 DDL

```sql
CREATE TABLE medications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dosage_value REAL,
  dosage_unit TEXT,
  color TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  medication_id TEXT NOT NULL REFERENCES medications(id),
  schedule_type TEXT NOT NULL DEFAULT 'fixed',
  start_date TEXT NOT NULL,
  end_date TEXT,
  days_of_week TEXT,   -- JSON array string, null = 매일
  times TEXT NOT NULL, -- JSON array string e.g. '["08:00","20:00"]'
  with_food TEXT NOT NULL DEFAULT 'none',
  grace_minutes INTEGER NOT NULL DEFAULT 120,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE dose_events (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id),
  medication_id TEXT NOT NULL REFERENCES medications(id),
  planned_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  taken_at TEXT,
  snooze_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY DEFAULT 'local',
  time_zone TEXT NOT NULL,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  default_snooze_minutes INTEGER NOT NULL DEFAULT 15,
  max_snooze_count INTEGER NOT NULL DEFAULT 3,
  missed_to_late_minutes INTEGER NOT NULL DEFAULT 120,
  auto_mark_missed_enabled INTEGER NOT NULL DEFAULT 1
);
```

---

## 2. 화면 요구사항

### 화면 목록

| ID | 화면명 | 경로 |
|----|--------|------|
| S01 | 홈 (오늘의 복용) | `/home` |
| S02 | 일정 추가 | `/schedule/new` |
| S03 | 일정 수정 | `/schedule/:id/edit` |
| S04 | 복용 기록 | `/history` |
| S05 | 통계 | `/stats` |
| S06 | 설정 | `/settings` |
| S07 | 온보딩 (최초 1회) | `/onboarding` |

---

### S01 — 홈 (오늘의 복용)

**레이아웃**

```
┌─────────────────────────────────┐
│  오늘 4월 22일 화요일             │  ← 날짜 헤더
│  다음 복용: 혈압약  13:00 (2시간 후) │  ← 다음 알림 배너
│  남은 복용 3건                   │
├─────────────────────────────────┤
│  ● 08:00  혈압약 500mg   [완료✓] │  ← 완료 카드
│  ○ 13:00  혈압약          [복용] │  ← 예정 카드
│  ○ 20:00  비타민D        [복용] │
│  ✕ 07:00  철분제   (어제 누락)  │  ← 누락 카드
├─────────────────────────────────┤
│  [+ 약 추가]                    │  ← FAB
└─────────────────────────────────┘
```

**상태별 카드 스타일**

| status | 배경색 | 버튼 |
|--------|--------|------|
| scheduled | 흰색 | `복용` (primary) |
| taken | 연초록 | `완료 ✓` (disabled) |
| late | 연주황 | `늦은 복용` (warning) |
| missed | 연빨강 | `누락` (error, 텍스트만) |
| skipped | 회색 | `건너뜀` (disabled) |

**액션**
- `복용` 버튼 탭 → DoseEvent.status = 'taken', takenAt = now() 저장
- `미루기` (카드 좌→우 스와이프) → snoozeCount +1, 알림 defaultSnoozeMinutes 후 재등록
- 미루기 maxSnoozeCount 초과 시 미루기 비활성화
- FAB 탭 → S02로 이동

**AC (Acceptance Criteria)**
- [ ] 오늘 날짜의 DoseEvent가 시간순으로 표시된다
- [ ] `복용` 탭 시 즉시 카드가 '완료' 상태로 변한다 (낙관적 업데이트)
- [ ] 스와이프 미루기 후 지정 시간에 알림이 재발송된다
- [ ] 모든 복용 완료 시 "오늘 복용을 모두 완료했어요! 🎉" 메시지 표시

---

### S02/S03 — 일정 추가/수정

**입력 항목**

| 필드 | 컴포넌트 | 유효성 |
|------|----------|--------|
| 약 이름 | TextInput | 필수, 최대 50자 |
| 용량 | TextInput (숫자) + Picker (단위) | 선택 |
| 색상 | ColorPicker (6색 팔레트) | 선택 |
| 복용 시간 | TimePicker (복수 추가 가능) | 최소 1개 필수 |
| 반복 | SegmentedControl (매일 / 요일 선택 / 기간) | 필수 |
| 요일 선택 | 토글 버튼 (월화수목금토일) | 반복=요일 선택 시 활성 |
| 시작일 | DatePicker | 필수, 기본값 오늘 |
| 종료일 | DatePicker | 선택, 시작일 이후 |
| 식전/식후 | SegmentedControl | 필수 |

**저장 로직**

```
저장 버튼 탭
  → 유효성 검사 (이름, 시간 1개 이상, 종료일 > 시작일)
  → Medication upsert
  → Schedule insert/update
  → 기존 알림 전체 취소 (scheduleId 기준)
  → DoseEvent 생성 (오늘~30일치 또는 종료일까지)
  → 알림 재등록 (expo-notifications)
  → 홈으로 이동
```

**AC**
- [ ] 저장 시 조용한 시간대 알림은 자동으로 quietHoursEnd 시점으로 이동된다
- [ ] 수정 시 기존 미래 DoseEvent는 삭제 후 재생성된다
- [ ] 종료일이 시작일보다 이전이면 저장 불가, 에러 메시지 표시

---

### S04 — 복용 기록

**레이아웃**

```
┌─────────────────────────────────┐
│  < 2025년 4월  >                │  ← 월 네비게이션
│  Mon Tue Wed Thu Fri Sat Sun    │
│   7   8   9  10  11  12  13    │  ← 달력 (완료율 도트 표시)
├─────────────────────────────────┤
│  4월 10일 목요일                 │  ← 선택된 날짜
│  ● 08:00 혈압약  완료 08:03     │
│  ✕ 13:00 혈압약  누락           │
│  ● 20:00 비타민D 완료 20:15    │
└─────────────────────────────────┘
```

**달력 도트 규칙**
- 완료율 100% → 초록 도트
- 완료율 50~99% → 노랑 도트
- 완료율 1~49% → 주황 도트
- 완료율 0% (복용 있었으나 전부 누락) → 빨강 도트
- 복용 일정 없음 → 도트 없음

**AC**
- [ ] 날짜 탭 시 해당 날짜 DoseEvent 목록 표시
- [ ] 기록 화면에서도 '늦은 복용 처리' 버튼 제공 (오늘 날짜 한정)

---

### S05 — 통계

**표시 항목**

```
┌─────────────────────────────────┐
│  [이번 주] [이번 달]            │  ← 탭
├─────────────────────────────────┤
│         주간 완료율              │
│         ████ 78%               │  ← 원형 게이지
│  완료 22건 / 전체 28건          │
├─────────────────────────────────┤
│  요일별 완료율 (막대)            │
│  월 ████████░░ 80%             │
│  화 ██████████ 100%            │
│  수 ████░░░░░░ 40%             │
│  ...                           │
├─────────────────────────────────┤
│  가장 많이 누락된 시간대         │
│  1위  13:00  (점심 복용) 5회    │
│  2위  08:00  (아침 복용) 2회    │
└─────────────────────────────────┘
```

**AC**
- [ ] 주간/월간 탭 전환 시 데이터 즉시 반영
- [ ] 완료율은 `taken / (taken + missed + late)` 로 계산
- [ ] 누락 0건 주간에는 "이번 주 완벽해요! 🏆" 메시지 표시

---

### S06 — 설정

| 항목 | 컴포넌트 | 기본값 |
|------|----------|--------|
| 조용한 시간 시작 | TimePicker | 23:00 |
| 조용한 시간 종료 | TimePicker | 07:00 |
| 기본 미루기 시간 | Stepper (5분 단위) | 15분 |
| 최대 미루기 횟수 | Stepper | 3회 |
| 누락 자동 처리 | Toggle | ON |
| 누락 판정 기준 | Stepper (30분 단위) | 120분 |

---

### S07 — 온보딩 (최초 1회)

**페이지 구성 (3 슬라이드)**

1. "제때 약을 챙기기 어렵지 않으셨나요?" — 알림 기능 소개
2. "한 번의 탭으로 복용 완료" — 체크 UX 소개
3. "꾸준히 복용하는 습관을 만들어요" — 통계 소개

**마지막 슬라이드 → 알림 권한 요청 → 홈으로 이동**

---

## 3. 알림 시스템

### 알림 스케줄링 규칙

```
스케줄 저장 시:
  for each time in schedule.times:
    for each day in [오늘 ~ min(종료일, 오늘+30일)]:
      if day in daysOfWeek:
        plannedAt = day + time
        if not in quietHours(plannedAt):
          expo_notifications.scheduleLocalNotification({
            title: `${medication.name} 복용 시간이에요 💊`,
            body: withFood 문구 (예: "식후 30분에 복용하세요"),
            trigger: { date: plannedAt }
          })
          DoseEvent 생성 (status: 'scheduled')
        else:
          // 조용한 시간이면 quietHoursEnd 시점으로 지연
          adjustedAt = 당일 quietHoursEnd
          expo_notifications.scheduleLocalNotification({ trigger: { date: adjustedAt } })
```

### 미루기(Snooze) 처리

```
미루기 액션 시:
  if doseEvent.snoozeCount < userSettings.maxSnoozeCount:
    기존 알림 취소
    snoozeAt = now() + userSettings.defaultSnoozeMinutes
    신규 알림 등록 (trigger: snoozeAt)
    doseEvent.snoozeCount += 1
    doseEvent.status = 'scheduled' (유지)
  else:
    미루기 버튼 비활성화, 토스트: "더 이상 미룰 수 없어요"
```

### 누락 자동 처리 (백그라운드)

```
AppState가 active로 전환될 때 또는 매 시간 백그라운드 태스크:
  SELECT * FROM dose_events
  WHERE status = 'scheduled'
    AND planned_at < now() - (missedToLateMinutes * 60초)
  → status = 'missed', updatedAt = now() 로 업데이트
```

---

## 4. 구현 순서 (추천)

| 순서 | 작업 | 예상 소요 |
|------|------|-----------|
| 1 | 프로젝트 초기화 (Expo + TS + NativeWind) | 0.5일 |
| 2 | SQLite 마이그레이션 & DB 헬퍼 함수 | 1일 |
| 3 | Zustand 스토어 (medication, schedule, doseEvent) | 1일 |
| 4 | S02 일정 추가 화면 | 1.5일 |
| 5 | 알림 스케줄링 로직 | 1일 |
| 6 | S01 홈 화면 | 1.5일 |
| 7 | S04 복용 기록 화면 | 1일 |
| 8 | S05 통계 화면 | 1일 |
| 9 | S06 설정 화면 | 0.5일 |
| 10 | S07 온보딩 | 0.5일 |
| 11 | 전체 QA + 실기기 테스트 | 1.5일 |

**총 예상: 약 11일 (4주 중 개발 버퍼 포함)**

---

## 5. Phase 1 완료 기준 (Definition of Done)

- [ ] iOS / Android 실기기에서 약 등록 → 알림 수신 → 복용 완료 루프 동작
- [ ] 앱 강제 종료 후 재시작해도 알림이 유지됨
- [ ] 조용한 시간대 알림이 발송되지 않음
- [ ] 주간 완료율이 통계 화면에 올바르게 표시됨
- [ ] Jest 단위 테스트 커버리지 60% 이상 (도메인 로직 위주)
