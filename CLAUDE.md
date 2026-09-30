# 필람(Pillarm) — 약 복용 시간 알림 앱

## 프로젝트 개요

약을 제때 복용할 수 있도록 복용 일정 등록·알림·기록·통계를 제공하는 모바일 앱.

| 항목 | 내용 |
|------|------|
| 앱 이름 | 필람 (Pillarm) |
| 플랫폼 | iOS / Android (React Native + Expo) |
| 크래시 리포팅 | @sentry/react-native (DSN 은 `EXPO_PUBLIC_SENTRY_DSN`) |

## 핵심 원칙

1. **오프라인 우선** — 모든 데이터는 기기 로컬(SQLite)에 저장한다. 네트워크 없이 완전히 동작해야 한다. 온라인 전용 기능(보호자 그룹·서버 동기화)에는 오프라인 배너로 안내하고, 재연결 시 자동 재시도한다.
2. **접근성 우선** — 글씨 크기는 최소 16sp, 터치 영역은 최소 44×44pt. 색각 이상자를 위해 색상만으로 상태를 표현하지 않는다.
3. **알림 신뢰성** — 알림은 expo-notifications로 로컬 스케줄링한다. 스케줄 변경 시 기존 알림을 취소하고 재등록한다.
4. **단순한 UX** — 복용 완료는 탭 1회로 처리한다. 화면 전환 없이 홈에서 모든 일상 액션이 가능해야 한다.

## 개발 단계

| Phase | 파일 | 목표 | 상태 |
|-------|------|------|------|
| 1 — MVP | `PRD_PHASE1.md` | 핵심 4기능: 등록·알림·체크·통계(기본) | ✅ 완료 |
| 2 — 확장 | `PRD_PHASE2.md` | 보호자 공유·약 DB 연동·포인트·AI 코칭 | ✅ 완료 |
| 3 — 배포 | `PRD_PHASE3.md` | 간편 로그인(Apple·Google·카카오) & App Store / Google Play 배포 + 오프라인 처리 + 관리자 패널 | ✅ 완료 (iOS App Store 배포 ✅ · Android **프로덕션 배포 완료**) |
| 4 — 스캔 | `PRD_PHASE4.md` | 약봉투 촬영 → Claude Vision AI 자동 일정 생성 | ✅ 완료 (2026-06 배포, 지속 개선 중) |
| 5 — 수익화 | `PRD_PHASE5.md` | 보호자 결제 기반 프리미엄 구독 | 📋 기획 (Android 프로덕션 액세스 확보 완료 — 착수 가능) |

## 배포

- **1.0.4 (iOS 39 / Android 26) 는 빌드만 끝났고 스토어에 미제출 — 다음 작업 시 제출부터 확인할 것.**
- Sentry 토큰은 EAS Secret 으로만 둔다. 저장소에 넣지 않는다.
- 배포 현황·Play Console 트랙·Sentry(EU 리전) 설정은 `/release` 스킬(`.claude/skills/release/SKILL.md`) 참고.

## 작업 시작 전 체크리스트

- [ ] `PRD_PHASE1.md` 전체 읽기
- [ ] `docs/domain-model.md` 엔터티 확인
- [ ] 각 Phase의 완료 기준(Acceptance Criteria) 확인 후 구현 시작
- [ ] 화면 1개 완성 → 테스트 작성 → 다음 화면 순서로 진행
