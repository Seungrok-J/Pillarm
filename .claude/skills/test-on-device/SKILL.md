---
name: test-on-device
description: 실제 안드로이드 기기에 최신 코드를 설치해서 테스트한다 — 기본은 EAS 빌드, 필요할 때만 로컬 빌드
---

## 기본 흐름 — EAS 빌드 (기본값)

이 프로젝트는 로컬 네이티브 빌드가 불안정했던 이력이 있어(메모리 부족으로 인한 clang 크래시, USB 리버스 터널 불안정 등), **특별한 이유가 없으면 EAS 빌드로 테스트한다.**

1. 이번 EAS 빌드가 서버(Railway) 쪽 변경도 포함하는지 확인 — 포함한다면 먼저 `git push`로 Railway 배포부터 끝내고(프로덕션 서버 URL을 EAS preview 프로필이 보고 있음), 배포가 `● Online`으로 뜨는지 확인한 뒤 진행한다.
2. `npx eas build --platform android --profile preview --non-interactive` 실행 (백그라운드로 돌리고 완료 알림을 기다린다. 보통 10~20분).
   - **EAS 빌드는 실행 전에 항상 사용자에게 확인받는다** — 이미 합의된 규칙([[feedback_eas_build_confirm]] 메모리 참고). 다만 사용자가 "테스트해줘"처럼 명시적으로 요청한 경우엔 그 요청 자체가 확인이므로 추가로 되묻지 않는다.
3. 빌드 완료 로그에서 `https://expo.dev/accounts/.../builds/...` 링크를 찾아 사용자에게 전달 — 사용자가 QR/링크로 직접 설치한다(내가 직접 adb install 하지 않음, EAS 결과물은 보통 사용자 폰에서 직접 받음).
4. 서명이 다른 버전이 이미 깔려있으면(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) 기존 앱 삭제 후 재설치해야 한다고 안내한다.

## 로컬 빌드 (필요할 때만 — 예: 네이티브 리소스를 자주 바꿔가며 빠르게 반복 확인해야 할 때)

로컬 빌드·Metro 연결 흐름은 훨씬 손이 많이 가고 이번 세션에서 여러 번 막혔던 경로다. 아래 순서대로, 각 단계에서 실패하면 바로 다음 항목의 원인일 가능성이 높다.

1. **app.json의 `plugins`/아이콘 등 네이티브 설정을 바꿨다면** 먼저 `npx expo prebuild --platform android --clean` 로 android/ 폴더를 재생성한다(기존 android/ 폴더는 이런 변경을 자동 반영하지 않음).
2. `android/local.properties`가 없으면 Gradle이 `SDK location not found`로 실패한다 — `prebuild --clean`이 이 파일을 지워버리므로, 없으면 직접 생성:
   ```
   sdk.dir=C:\\Users\\jsl\\AppData\\Local\\Android\\Sdk
   ```
3. `adb devices`로 기기 연결 확인. 연결 안 되어 있으면 `npx expo run:android`가 기기를 찾다가 그냥 실패하니, USB 재연결 후 `adb kill-server && adb start-server`로 재시도.
4. `npx expo run:android` 실행.
   - **네이티브 컴파일러가 signal로 죽는 크래시**(`clang frontend command failed due to signal`)가 나면 메모리 부족일 가능성이 높다 — 그냥 한 번 더 재시도한다(Gradle/ninja 캐시가 남아있어서 재시도는 빠르다).
   - **서명 불일치**(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`)로 설치가 실패하면: `adb -s <id> uninstall com.seungrokj.pillarm` 후 `adb -s <id> install -r android/app/build/outputs/apk/debug/app-debug.apk`로 직접 설치.
5. **Metro 연결**:
   - 이미 다른 Metro가 8081을 쓰고 있으면(`Port 8081 is being used by another process`) 새 dev server가 안 뜨고 "Skipping dev server"로 넘어간다 — 기존 Metro가 살아있으면(`netstat -ano | grep 8081`로 확인) 그대로 써도 되고, 죽어있으면 포트 잡고 있는 PID를 `taskkill //F //PID <pid>` 후 `npx expo start --dev-client -c`로 새로 띄운다.
   - `adb -s <id> reverse tcp:8081 tcp:8081`로 포트포워딩 연결.
   - 앱이 이미 설치돼 있으면 딥링크로 바로 Metro에 연결: `adb -s <id> shell am start -a android.intent.action.VIEW -d "pillarm://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`.
   - **"SocketTimeoutException" / "Read timed out"로 계속 실패하면** USB 리버스 터널 자체가 불안정한 상태다 — `adb reverse --remove-all` 후 다시 `adb reverse tcp:8081 tcp:8081`로 재설정, 그래도 안 되면 로컬 방식을 포기하고 EAS 빌드로 전환하는 게 빠르다(이번 세션에서 실제로 그랬음).
6. 코드를 수정하면 Metro가 Fast Refresh/전체 리로드를 하면서 **앱의 현재 화면·입력 상태가 초기화될 수 있다** — 사용자가 스캔 결과 입력 중처럼 실제 데이터를 만지고 있는 화면이면, 코드를 고치기 전에 미리 알려줄 것("화면이 초기화될 수 있어요").

## 화면 조작 시 주의

- adb로 화면을 직접 조작(tap/swipe)할 땐 **스와이프가 의도치 않게 뒤로가기로 인식되어 사용자의 실제 입력 중이던 데이터(스캔 결과 등)가 날아갈 수 있다** — 실제로 이번 세션에서 한 번 발생. 확인용 스크린샷(`adb exec-out screencap`)은 안전하지만, 사용자가 실제 데이터를 입력 중인 화면에서는 tap/swipe로 직접 조작하지 말고, 필요하면 사용자에게 직접 조작해달라고 요청할 것.
