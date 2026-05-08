/**
 * missedDoseNotifier 단위 테스트
 *
 * AC1 — 미루기 이벤트 탐지 시 보호자 FCM 토큰으로 notifyMissedDose 호출
 * AC2 — 이미 알림 발송한 이벤트는 중복 호출하지 않음 (notifiedIds 멱등성)
 * AC3 — 보호자 토큰 없으면 notifyMissedDose 호출하지 않음
 * AC4 — DB 오류 발생 시 인터벌이 계속 실행됨 (catch 처리 확인)
 */

jest.mock('../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    doseEvent:  { findMany: jest.fn() },
    medication: { findUnique: jest.fn() },
  },
}));

jest.mock('../src/services/fcmService', () => ({
  notifyMissedDose: jest.fn().mockResolvedValue(undefined),
}));

import db from '../src/lib/prisma';
import { notifyMissedDose } from '../src/services/fcmService';
import { startMissedDoseNotifier } from '../src/services/missedDoseNotifier';

// ── 타입 별칭 ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFindMany  = (db as any).doseEvent.findMany   as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFindUnique = (db as any).medication.findUnique as jest.Mock;
const mockNotify    = notifyMissedDose as jest.Mock;

// ── 픽스처 ────────────────────────────────────────────────────────────────────

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id:           'evt-1',
    medicationId: 'med-1',
    status:       'missed',
    updatedAt:    new Date().toISOString(),
    user: {
      email: 'patient@example.com',
      ownedCircles: [
        {
          members: [
            { member: { fcmToken: 'ExponentPushToken[abc]' } },
          ],
        },
      ],
    },
    ...overrides,
  };
}

// ── beforeEach / afterEach ─────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC1 — 미누기 이벤트 탐지 → notifyMissedDose 호출
// ═══════════════════════════════════════════════════════════════════════════════

it('AC1: missed 이벤트 탐지 시 보호자 토큰으로 notifyMissedDose 를 호출한다', async () => {
  mockFindMany.mockResolvedValueOnce([makeEvent()]);
  mockFindUnique.mockResolvedValueOnce({ name: '혈압약' });

  const stop = startMissedDoseNotifier();

  jest.advanceTimersByTime(5 * 60_000);
  // 인터벌 콜백의 비동기 작업이 완료될 때까지 대기
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  expect(mockNotify).toHaveBeenCalledWith(
    ['ExponentPushToken[abc]'],
    'patient@example.com',
    '혈압약',
  );

  stop();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC2 — 중복 알림 방지 (notifiedIds 멱등성)
// ═══════════════════════════════════════════════════════════════════════════════

it('AC2: 동일 이벤트 ID 에 대해 두 번째 인터벌에서 notifyMissedDose 를 호출하지 않는다', async () => {
  const event = makeEvent();
  mockFindMany.mockResolvedValue([event]);
  mockFindUnique.mockResolvedValue({ name: '혈압약' });

  const stop = startMissedDoseNotifier();

  // 첫 번째 인터벌
  jest.advanceTimersByTime(5 * 60_000);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  // 두 번째 인터벌
  jest.advanceTimersByTime(5 * 60_000);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(mockNotify).toHaveBeenCalledTimes(1);

  stop();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC3 — 보호자 토큰 없으면 알림 skip
// ═══════════════════════════════════════════════════════════════════════════════

it('AC3: 보호자 FCM 토큰이 없으면 notifyMissedDose 를 호출하지 않는다', async () => {
  mockFindMany.mockResolvedValueOnce([
    makeEvent({
      user: {
        email: 'patient@example.com',
        ownedCircles: [
          { members: [{ member: { fcmToken: null } }] },
        ],
      },
    }),
  ]);

  const stop = startMissedDoseNotifier();
  jest.advanceTimersByTime(5 * 60_000);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(mockNotify).not.toHaveBeenCalled();
  stop();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC4 — DB 오류 시 인터벌 유지 (다음 체크 정상 실행)
// ═══════════════════════════════════════════════════════════════════════════════

it('AC4: DB 오류 발생 시 인터벌이 중단되지 않는다', async () => {
  mockFindMany
    .mockRejectedValueOnce(new Error('DB connection lost'))
    .mockResolvedValueOnce([]);

  const stop = startMissedDoseNotifier();

  // 첫 번째 인터벌: DB 오류
  jest.advanceTimersByTime(5 * 60_000);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  // 두 번째 인터벌: 정상 (빈 배열)
  jest.advanceTimersByTime(5 * 60_000);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(mockFindMany).toHaveBeenCalledTimes(2);
  expect(mockNotify).not.toHaveBeenCalled();

  stop();
});
