// Sentry 를 가장 먼저 초기화한다 — import 는 호이스팅되므로 부작용 모듈로 분리해
// App 모듈 본문보다 먼저 실행되도록 보장한다(초기화 단계 크래시도 잡기 위함).
import './src/monitoring/init';

import { registerRootComponent } from 'expo';
import { Sentry, hasSentryDsn } from './src/monitoring';

import App from './App';

// Sentry.wrap 은 에러 바운더리와 네이티브 크래시 컨텍스트를 붙여준다.
// DSN 이 없어 init 을 건너뛴 경우에는 감싸지 않는다 — 크래시 리포터 때문에
// 앱이 죽는 상황을 원천 차단한다.
const Root = hasSentryDsn ? Sentry.wrap(App) : App;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
