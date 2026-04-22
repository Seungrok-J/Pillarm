# 도메인 모델 & ERD

## ERD (텍스트)

```
┌──────────────┐       ┌─────────────────┐       ┌────────────────┐
│  Medication  │ 1   N │    Schedule      │ 1   N │   DoseEvent    │
│──────────────│───────│─────────────────│───────│────────────────│
│ id (PK)      │       │ id (PK)         │       │ id (PK)        │
│ name         │       │ medicationId(FK)│       │ scheduleId(FK) │
│ dosageValue? │       │ scheduleType    │       │ medicationId   │
│ dosageUnit?  │       │ startDate       │       │ plannedAt      │
│ color?       │       │ endDate?        │       │ status         │
│ isActive     │       │ daysOfWeek?     │       │ takenAt?       │
│ createdAt    │       │ times           │       │ snoozeCount    │
│ updatedAt    │       │ withFood        │       │ source         │
└──────────────┘       │ graceMinutes    │       │ note?          │
                       │ isActive        │       │ createdAt      │
                       │ createdAt       │       │ updatedAt      │
                       │ updatedAt       │       └────────────────┘
                       └─────────────────┘

┌──────────────────┐
│   UserSettings   │
│──────────────────│
│ userId = 'local' │  ← MVP는 단일 로컬 사용자
│ timeZone         │
│ quietHoursStart? │
│ quietHoursEnd?   │
│ defaultSnooze    │
│ maxSnoozeCount   │
│ missedToLate     │
│ autoMarkMissed   │
└──────────────────┘
```

## 상태 전이 다이어그램 (DoseEvent.status)

```
                  ┌──────────────────────────────┐
                  │                              │
              scheduled ──[사용자 탭]──→ taken    │
                  │                              │
                  │ [plannedAt + grace 초과]      │
                  ↓                              │
                late ───[사용자 탭]──→ taken      │
                  │                              │
                  │ [plannedAt + missedToLate 초과]│
                  ↓                              │
               missed                            │
                  │                              │
                  └──────────────────────────────┘

              [미루기] → snoozeCount +1, 상태 유지(scheduled)
              [건너뜀] → skipped (언제든 사용자가 선택 가능)
```

## 핵심 비즈니스 규칙

| # | 규칙 |
|---|------|
| R1 | Schedule 하나에 times 여러 개 → DoseEvent도 여러 개 생성 |
| R2 | Schedule 수정 시 미래 DoseEvent 전체 삭제 후 재생성 |
| R3 | DoseEvent는 과거 기록이므로 삭제하지 않음 (soft delete 없음) |
| R4 | graceMinutes 이내 완료 = taken, 초과 = late로 분류 |
| R5 | missedToLateMinutes 초과 시 시스템이 missed로 자동 처리 |
| R6 | 조용한 시간대 알림은 삭제하지 않고 quietHoursEnd 시점으로 이동 |
| R7 | 미루기는 maxSnoozeCount 초과 불가 |
