import express from 'express';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth';
import socialAuthRouter from './routes/socialAuth';
import careCircleRouter from './routes/careCircle';
import doseSyncRouter from './routes/doseSync';
import syncRouter from './routes/sync';
import aiScanRouter from './routes/aiScan';
import adminRouter from './routes/admin';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Railway 등 리버스 프록시 뒤에서 실제 클라이언트 IP 를 인식 (rate limit 키에 필요)
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const isTest = process.env.NODE_ENV === 'test';

// 전역 완화 제한 — 비정상 트래픽 완충
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 인증 엄격 제한 — 로그인·토큰 갱신 무차별 대입 방지 (/auth, /auth/social 모두 적용)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: '인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

app.use(globalLimiter);
app.use('/auth', authLimiter);

app.use('/auth', authRouter);
app.use('/auth/social', socialAuthRouter);
app.use('/care-circles', careCircleRouter);
// doseSync shares the /care-circles prefix but handles /:id/members/:userId/today sub-paths
app.use('/care-circles', doseSyncRouter);
app.use('/sync', syncRouter);
app.use('/ai/scan-medication', aiScanRouter);
app.use('/admin', adminRouter);

app.use(errorHandler);

export default app;
