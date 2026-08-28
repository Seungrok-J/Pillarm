// import 는 호이스팅되므로, 초기화를 "부작용 모듈"로 분리해야
// index.ts 에서 App 보다 먼저 실행되는 것이 보장된다.
import { initSentry } from './sentry';

initSentry();
