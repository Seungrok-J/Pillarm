import * as Sentry from '@sentry/react-native';

/**
 * Sentry 크래시 리포팅 초기화.
 *
 * 이 앱은 복약 정보(건강 데이터)를 다루므로 개인정보가 리포트에 섞이지 않도록
 * 아래 규칙을 지킨다.
 *   - sendDefaultPii: false — IP·기기 식별자 등 자동 수집 PII 차단
 *   - console 브레드크럼 제거 — 앱 곳곳의 console.warn 에 약 이름·사용자 정보가
 *     실릴 수 있어 통째로 버린다
 *   - HTTP 브레드크럼의 쿼리스트링 제거 — 초대 코드 등이 URL 에 실릴 수 있다
 *   - 사용자 식별은 익명 userId 만 사용하고 이메일·이름은 보내지 않는다
 *
 * DSN 이 없으면 아무것도 하지 않는다(로컬 개발·포크 환경에서 그대로 동작).
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** 개발 빌드에서도 전송하고 싶을 때 .env 에 EXPO_PUBLIC_SENTRY_DEV=1 을 넣는다 */
const SEND_IN_DEV = process.env.EXPO_PUBLIC_SENTRY_DEV === '1';

/** DSN 이 설정돼 있는지 — Sentry.init 이 호출됐는지와 같다 */
export const hasSentryDsn = Boolean(DSN);

/** 실제로 이벤트를 전송하는지 (개발 빌드는 기본적으로 전송하지 않는다) */
export const isSentryEnabled = hasSentryDsn && (!__DEV__ || SEND_IN_DEV);

/** URL 에서 쿼리스트링·프래그먼트를 떼어낸다 */
function stripQuery(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function initSentry(): void {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    enabled: isSentryEnabled,
    environment: __DEV__ ? 'development' : 'production',

    // 개발 빌드에서 전송을 켠 경우에만 SDK 로그를 남긴다(연동 확인용)
    debug: SEND_IN_DEV,

    // 개인정보 자동 수집 차단
    sendDefaultPii: false,

    // 크래시 리포팅에 집중 — 성능 트레이싱은 쿼터만 소모하므로 끈다
    tracesSampleRate: 0,

    beforeBreadcrumb(breadcrumb) {
      // 콘솔 로그에는 약 이름·사용자 정보가 실릴 수 있어 전부 버린다
      if (breadcrumb.category === 'console') return null;

      // 네트워크 요청 URL 의 쿼리스트링 제거 (초대 코드 등)
      if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
        if (breadcrumb.data) {
          breadcrumb.data = { ...breadcrumb.data, url: stripQuery(breadcrumb.data.url) };
        }
      }
      return breadcrumb;
    },

    beforeSend(event) {
      // 혹시 자동 수집된 개인 식별 정보가 있으면 익명 id 만 남긴다
      if (event.user) {
        event.user = event.user.id ? { id: event.user.id } : undefined;
      }
      return event;
    },
  });
}

/**
 * 로그인·로그아웃 시 사용자 컨텍스트를 갱신한다.
 * 이메일·이름은 넘기지 않는다 — 어떤 계정에서 났는지만 알면 충분하다.
 */
export function setSentryUser(userId: string | null): void {
  if (!DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/** 예상치 못한 예외를 수동으로 보고할 때 사용 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export { Sentry };
