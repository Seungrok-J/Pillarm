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
| 내비게이션 | React Navigation v6 (Bottom Tabs + Stack) |
| 스타일 | NativeWind (Tailwind for RN) |
| 테스트 | Jest + React Native Testing Library |

## 디렉터리 구조

```
pillarm/
├── CLAUDE.md                  ← 이 파일
├── PRD_PHASE1.md              ← MVP 상세 요구사항
├── PRD_PHASE2.md              ← 확장 기능 요구사항
├── PRD_PHASE3.md              ← 간편 로그인 & 스토어 배포
├── docs/
│   ├── domain-model.md        ← 엔터티 정의
│   └── erd.md                 ← ERD 다이어그램
├── src/
│   ├── app/                   ← 화면 컴포넌트
│   │   ├── home/
│   │   ├── schedule/
│   │   ├── history/
│   │   ├── stats/
│   │   └── settings/
│   ├── components/            ← 공통 UI 컴포넌트
│   ├── domain/                ← 엔터티 타입 정의
│   ├── store/                 ← Zustand 스토어
│   ├── db/                    ← SQLite 마이그레이션 & 쿼리
│   ├── notifications/         ← 알림 스케줄링 로직
│   └── utils/
└── __tests__/
```

## 핵심 원칙

1. **오프라인 우선** — 모든 데이터는 기기 로컬(SQLite)에 저장한다. 네트워크 없이 완전히 동작해야 한다.
2. **접근성 우선** — 글씨 크기는 최소 16sp, 터치 영역은 최소 44×44pt. 색각 이상자를 위해 색상만으로 상태를 표현하지 않는다.
3. **알림 신뢰성** — 알림은 expo-notifications로 로컬 스케줄링한다. 스케줄 변경 시 기존 알림을 취소하고 재등록한다.
4. **단순한 UX** — 복용 완료는 탭 1회로 처리한다. 화면 전환 없이 홈에서 모든 일상 액션이 가능해야 한다.

## 개발 단계

| Phase | 파일 | 목표 |
|-------|------|------|
| 1 — MVP | `PRD_PHASE1.md` | 핵심 4기능: 등록·알림·체크·통계(기본) |
| 2 — 확장 | `PRD_PHASE2.md` | 보호자 공유·약 DB 연동·포인트·AI 코칭 |
| 3 — 배포 | `PRD_PHASE3.md` | 간편 로그인(Apple·Google·카카오·네이버) & App Store / Google Play 배포 |

## 작업 시작 전 체크리스트

- [ ] `PRD_PHASE1.md` 전체 읽기
- [ ] `docs/domain-model.md` 엔터티 확인
- [ ] 각 Phase의 완료 기준(Acceptance Criteria) 확인 후 구현 시작
- [ ] 화면 1개 완성 → 테스트 작성 → 다음 화면 순서로 진행
