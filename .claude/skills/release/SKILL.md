---
name: release
description: 필람 스토어 배포 현황·Play Console 트랙·Sentry(EU 리전) 설정 — 빌드 제출, 트랙 선택, eas submit, 소스맵 업로드 작업 시 사용
---

## 배포 현황 (2026-09-23)

| 플랫폼 | 버전 | 상태 |
|--------|------|------|
| iOS | 1.0.4 (buildNumber 39) | 빌드 완료 (2026-09-10), **스토어 미제출** |
| iOS | 1.0.3 (buildNumber 38) | App Store 배포 완료 (2026-09-04) — 현재 라이브 |
| Android | 1.0.4 (versionCode 26) | 빌드 완료 (2026-09-10), **스토어 미제출** |
| Android | 1.0.3 (versionCode 25) | **`production` 트랙 배포 완료** — 현재 라이브 (Play Developer API 로 2026-09-23 확인). `ver.23` 비공개 테스트 트랙에도 동일 버전 존재 |
| Android | 1.0.2 (versionCode 24) | 비공개 테스트 `ver.23` 트랙 출시 완료 (2026-09-01) |

- 1.0.4 변경 내용: 좁은 화면(폴더폰 320dp)과 큰 글씨 배율에서 무너지던 레이아웃을
  전면 수정. 홈·기록에서 복용 카드가 한 장도 안 보이던 문제, 일정 추가에서 색상
  팔레트 마지막 색을 아예 고를 수 없던 문제(배율 무관)를 포함해 15곳. 기록 화면
  달력을 주간 스트립 + 월간 펼치기로 전환. 보호자·관리자 화면의 오프라인 오류
  모달을 배너 + 재연결 시 자동 재시도로 교체. 자세한 규칙은
  `docs/design-system.md` 의 "좁은 화면·큰 배율 대응" 절 참고.
  **빌드는 9/10 에 끝났지만 iOS·Android 모두 아직 스토어에 제출되지 않았다 — 다음 작업 시
  제출부터 확인할 것.**
- 1.0.3 변경 내용: 글씨 크기 조절(보통/크게/아주 크게) 추가, 설정의 시간 항목을
  타이핑에서 드럼롤 선택으로 교체, 관리자 통계 지표 확장.
- 1.0.2 변경 내용: 앱 아이콘을 벡터(SVG)로 교체, Sentry 소스맵 업로드 활성화.
- 빌드 36 은 업스케일된 래스터 아이콘이 들어가 폐기했다. 선명한 벡터 아이콘은 **37 부터**다.
- **Android 프로덕션 승격 완료.** 테스터 12명 14일 연속 요건을 충족해 신청했고,
  Play Developer API 조회 결과 `production` 트랙에 versionCode 25(1.0.3)가
  `status: completed` 로 올라가 있다 — 공개 스토어에서 정상 검색·설치된다.
  `docs/index.html`·`docs/download.html` 의 `PLAY_LIVE` 플래그도 이에 맞춰 `true` 로 전환함.

## Play Console 트랙 (중요)

**`production` 트랙이 이미 라이브다.** 앞으로 새 버전은 `ver.23` 을 거치지 않고
바로 `production` 트랙에 올려도 된다 — 테스터 14일 요건은 최초 1회성 관문이었고
이미 통과했다. `ver.23` 은 필요하면 프로덕션 이전 스테이징용으로 계속 쓸 수 있지만
필수는 아니다. `eas.json` 의 `submit.production.android.track` 은 아직 `ver.23` 을
가리키고 있으니, 다음에 `eas submit` 을 쓴다면 이 값을 `production` 으로 바꿀지 먼저
판단할 것.

- `alpha`(versionCode 21) · `internal`(18) 트랙은 방치된 상태다. 혼동하지 않도록 주의.
- 트랙 상태는 서비스 계정으로 Play Developer API 를 조회하면 아무것도 바꾸지 않고 확인된다
  (`edits.insert` → `edits.tracks.list` → `edits.delete`).
- `eas submit --platform android` 는 과거 서비스 계정 권한 문제로 실패했다. 2026-09-01 기준
  인증·트랙 조회는 통과하지만 번들 업로드까지는 미검증이라, 현재는 `.aab` 를 수동 업로드한다.
  (1.0.4 의 `.aab`/`.ipa` 는 EAS 에 빌드되어 있으나 아직 어느 쪽도 업로드되지 않았다.)

## Sentry (EU 리전 주의)

Sentry 조직은 **EU 데이터 리전**(`de.sentry.io`)에 있다. org slug `pillarm`, project slug `react-native`.

- Organization 토큰(`sntrys_`)은 내부에 US 호스트가 박혀 발급되고 sentry-cli 가 그걸 우선하므로
  **EU 조직에서는 401 로 실패한다. Personal auth token(`sntryu_`)을 써야 한다.**
  필요 스코프: Project=Read, Release=Admin(`project:releases`), Organization=Read.
- `app.json` 의 `@sentry/react-native` 플러그인에 `organization`·`project` 와 함께
  **`"url": "https://de.sentry.io/"` 가 반드시 있어야 한다.** 없으면 빌드가 Xcode 단계에서 실패한다.
- 토큰은 EAS production 환경변수 `SENTRY_AUTH_TOKEN` 에 **Secret** 으로 둔다. 저장소에 넣지 않는다.
