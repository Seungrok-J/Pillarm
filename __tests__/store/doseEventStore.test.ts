import { useDoseEventStore } from '../../src/store/doseEventStore';
import { DoseEvent } from '../../src/domain';

// DB 레이어 전체를 mock — 스토어 로직만 격리해서 검증합니다.
jest.mock('../../src/db', () => ({
  getDoseEventsByDate: jest.fn(),
  getDoseEventsByDateRange: jest.fn(),
  updateDoseEventStatus: jest.fn().mockResolvedValue(undefined),
  updateDoseEventSnooze: jest.fn().mockResolvedValue(undefined),
}));

// 포인트 엔진 — 복용 완료와 독립적으로 fire-and-forget 으로 동작
jest.mock('../../src/features/points/pointEngine', () => ({
  awardDoseTaken: jest.fn().mockResolvedValue(null),
  awardStreakBonus: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/notifications/scheduler', () => ({
  cancelNotificationForDoseEvent: jest.fn().mockResolvedValue(undefined),
  checkAndMarkMissed: jest.fn().mockResolvedValue(undefined),
}));

// mock 모듈 참조를 가져와서 각 테스트에서 spy/assert 합니다.
import * as db from '../../src/db';

const mockUpdateStatus = db.updateDoseEventStatus as jest.Mock;
const mockUpdateSnooze = db.updateDoseEventSnooze as jest.Mock;

// ── 픽스처 ─────────────────────────────────────────────────────────────────

function makeEvent(overrides?: Partial<DoseEvent>): DoseEvent {
  return {
    id: 'evt-1',
    scheduleId: 'sched-1',
    medicationId: 'med-1',
    plannedAt: '2026-04-22T08:00:00.000Z',
    status: 'scheduled',
    snoozeCount: 0,
    source: 'notification',
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
    ...overrides,
  };
}

// ── 초기화 ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // 스토어 상태를 초기값으로 리셋
  useDoseEventStore.setState({
    todayEvents: [],
    isLoading: false,
    error: null,
  });
  jest.clearAllMocks();
});

// ─── import db mocks for error tests ──────────────────────────────────────
const mockGetByDate      = db.getDoseEventsByDate      as jest.Mock;
const mockGetByDateRange = db.getDoseEventsByDateRange as jest.Mock;

// ═══════════════════════════════════════════════════════════════════════════
// fetchTodayEvents
// ═══════════════════════════════════════════════════════════════════════════

describe('fetchTodayEvents', () => {
  it('정상 조회 시 todayEvents 를 업데이트한다', async () => {
    const events = [makeEvent()];
    mockGetByDate.mockResolvedValue(events);

    await useDoseEventStore.getState().fetchTodayEvents('2026-04-22');

    expect(useDoseEventStore.getState().todayEvents).toEqual(events);
    expect(useDoseEventStore.getState().isLoading).toBe(false);
  });

  it('DB 에러 시 isLoading=false 이고 error 를 설정한다', async () => {
    mockGetByDate.mockRejectedValue(new Error('조회 실패'));

    await useDoseEventStore.getState().fetchTodayEvents('2026-04-22');

    expect(useDoseEventStore.getState().isLoading).toBe(false);
    expect(useDoseEventStore.getState().error).toBe('조회 실패');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// fetchByDateRange
// ═══════════════════════════════════════════════════════════════════════════

describe('fetchByDateRange', () => {
  it('기간별 이벤트를 반환한다', async () => {
    const events = [makeEvent()];
    mockGetByDateRange.mockResolvedValue(events);

    const result = await useDoseEventStore.getState().fetchByDateRange('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z');

    expect(result).toEqual(events);
  });

  it('DB 에러 시 빈 배열 반환하고 error 를 설정한다', async () => {
    mockGetByDateRange.mockRejectedValue(new Error('범위 조회 실패'));

    const result = await useDoseEventStore.getState().fetchByDateRange('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z');

    expect(result).toEqual([]);
    expect(useDoseEventStore.getState().error).toBe('범위 조회 실패');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// markSkipped
// ═══════════════════════════════════════════════════════════════════════════

describe('markSkipped', () => {
  it('status 를 skipped 로 변경한다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent()] });

    await useDoseEventStore.getState().markSkipped('evt-1');

    expect(useDoseEventStore.getState().todayEvents[0]?.status).toBe('skipped');
  });

  it('updateDoseEventStatus 를 "skipped" 로 호출한다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent()] });

    await useDoseEventStore.getState().markSkipped('evt-1');

    expect(mockUpdateStatus).toHaveBeenCalledWith('evt-1', 'skipped');
  });

  it('DB 실패 시 이전 상태로 롤백하고 error 를 설정한다', async () => {
    mockUpdateStatus.mockRejectedValueOnce(new Error('건너뛰기 실패'));
    useDoseEventStore.setState({ todayEvents: [makeEvent()] });

    await expect(
      useDoseEventStore.getState().markSkipped('evt-1'),
    ).rejects.toThrow('건너뛰기 실패');

    expect(useDoseEventStore.getState().todayEvents[0]?.status).toBe('scheduled');
    expect(useDoseEventStore.getState().error).toBe('건너뛰기 실패');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// markTaken
// ═══════════════════════════════════════════════════════════════════════════

describe('markTaken', () => {
  it('즉시(낙관적) status를 taken으로 변경한다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent()] });

    const promise = useDoseEventStore.getState().markTaken('evt-1');

    // DB 응답 전에도 상태가 바뀌어 있어야 한다
    const { todayEvents } = useDoseEventStore.getState();
    expect(todayEvents[0]?.status).toBe('taken');
    expect(todayEvents[0]?.takenAt).toBeDefined();

    await promise;
  });

  it('takenAt에 현재 시각(ISO8601)을 기록한다', async () => {
    const before = new Date().toISOString();
    useDoseEventStore.setState({ todayEvents: [makeEvent()] });

    await useDoseEventStore.getState().markTaken('evt-1');

    const takenAt = useDoseEventStore.getState().todayEvents[0]?.takenAt!;
    const after = new Date().toISOString();
    expect(takenAt >= before).toBe(true);
    expect(takenAt <= after).toBe(true);
  });

  it('updateDoseEventStatus를 "taken"으로 호출한다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent()] });

    await useDoseEventStore.getState().markTaken('evt-1');

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    const [id, status] = mockUpdateStatus.mock.calls[0] as [string, string, string];
    expect(id).toBe('evt-1');
    expect(status).toBe('taken');
  });

  it('DB 실패 시 이전 상태로 롤백하고 error를 설정한다', async () => {
    mockUpdateStatus.mockRejectedValueOnce(new Error('DB error'));
    const original = makeEvent();
    useDoseEventStore.setState({ todayEvents: [original] });

    await expect(
      useDoseEventStore.getState().markTaken('evt-1'),
    ).rejects.toThrow('DB error');

    const { todayEvents, error } = useDoseEventStore.getState();
    expect(todayEvents[0]?.status).toBe('scheduled'); // 롤백
    expect(error).toBe('DB error');
  });

  it('존재하지 않는 id는 다른 이벤트에 영향을 주지 않는다', async () => {
    const evt = makeEvent();
    useDoseEventStore.setState({ todayEvents: [evt] });

    await useDoseEventStore.getState().markTaken('unknown-id');

    expect(useDoseEventStore.getState().todayEvents[0]?.status).toBe('scheduled');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// snooze
// ═══════════════════════════════════════════════════════════════════════════

describe('snooze', () => {
  it('snoozeCount를 1 증가시키고 true를 반환한다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent({ snoozeCount: 0 })] });

    const result = await useDoseEventStore.getState().snooze('evt-1', 3);

    expect(result).toBe(true);
    expect(useDoseEventStore.getState().todayEvents[0]?.snoozeCount).toBe(1);
  });

  it('status는 scheduled를 유지한다 (미루기는 상태 변경 없음)', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent({ snoozeCount: 1 })] });

    await useDoseEventStore.getState().snooze('evt-1', 3);

    expect(useDoseEventStore.getState().todayEvents[0]?.status).toBe('scheduled');
  });

  it('updateDoseEventSnooze를 증가된 count로 호출한다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent({ snoozeCount: 1 })] });

    await useDoseEventStore.getState().snooze('evt-1', 3);

    expect(mockUpdateSnooze).toHaveBeenCalledWith('evt-1', 2, expect.any(String));
  });

  it('snoozeCount가 maxSnoozeCount에 도달하면 false를 반환하고 DB를 호출하지 않는다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent({ snoozeCount: 3 })] });

    const result = await useDoseEventStore.getState().snooze('evt-1', 3);

    expect(result).toBe(false);
    expect(mockUpdateSnooze).not.toHaveBeenCalled();
    expect(useDoseEventStore.getState().todayEvents[0]?.snoozeCount).toBe(3); // 변경 없음
  });

  it('maxSnoozeCount - 1 에서는 미루기에 성공한다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent({ snoozeCount: 2 })] });

    const result = await useDoseEventStore.getState().snooze('evt-1', 3);

    expect(result).toBe(true);
    expect(useDoseEventStore.getState().todayEvents[0]?.snoozeCount).toBe(3);
  });

  it('존재하지 않는 id면 false를 반환하고 DB를 호출하지 않는다', async () => {
    useDoseEventStore.setState({ todayEvents: [makeEvent()] });

    const result = await useDoseEventStore.getState().snooze('unknown-id', 3);

    expect(result).toBe(false);
    expect(mockUpdateSnooze).not.toHaveBeenCalled();
  });

  it('DB 실패 시 이전 snoozeCount로 롤백하고 false를 반환한다', async () => {
    mockUpdateSnooze.mockRejectedValueOnce(new Error('DB error'));
    useDoseEventStore.setState({ todayEvents: [makeEvent({ snoozeCount: 1 })] });

    const result = await useDoseEventStore.getState().snooze('evt-1', 3);

    expect(result).toBe(false);
    expect(useDoseEventStore.getState().todayEvents[0]?.snoozeCount).toBe(1); // 롤백
    expect(useDoseEventStore.getState().error).toBe('DB error');
  });
});
