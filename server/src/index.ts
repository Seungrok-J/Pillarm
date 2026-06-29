import app from './app';
import { initFcm } from './services/fcmService';
import { startMissedDoseNotifier } from './services/missedDoseNotifier';

// 프로덕션에서 기본 시크릿 사용 방지 — 위조 토큰으로 admin 권한 탈취 가능
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.error('[FATAL] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in production');
    process.exit(1);
  }
}

const PORT = process.env.PORT ?? 3000;

initFcm();
startMissedDoseNotifier();

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
