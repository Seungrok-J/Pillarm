/**
 * useScheduleStore 단위 테스트
 * fetch / add / update / delete + 알림 취소 통합 검증
 */

jest.mock('../../src/db', () => ({
  getSchedulesByMedication: jest.fn(),
  getAllSchedules: jest.fn().mockResolvedValue([]),
  upsertSchedule: jest.fn().mockResolvedValue(undefined),
  deleteSchedule: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/notifications', () => ({
  cancelForSchedule: jest.fn().mockResolvedValue(undefined),
}));

import * as db from '../../src/db';
import * as notifications from '../../src/notifications';
import { useScheduleStore } from '../../src/store';
import type { Schedule } from '../../src/domain';

const mockGetByMed = db.getSchedulesByMedication as jest.Mock;
const mockUpsert = db.upsertSchedule as jest.Mock;
const mockDelete = db.deleteSchedule as jest.Mock;
const mockCancelForSchedule = notifications.cancelForSchedule as jest.Mock;

function makeSched(id = 'sched-1'): Schedule {
  return {
    id,
    medicationId: 'med-1',
    scheduleType: 'fixed',
    startDate: '2026-04-23',
    times: ['08:00'],
    withFood: 'none',
    graceMinutes: 120,
    isActive: true,
    createdAt: '2026-04-23T00:00:00Z',
    updatedAt: '2026-04-23T00:00:00Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useScheduleStore.setState({ schedules: [], isLoading: false, error: null });
});

// ── fetchSchedules ────────────────────────────────────────────────────────────

describe('fetchSchedules', () => {
  it('medicationId 로 스케줄 목록을 가져와 상태를 갱신한다', async () => {
    const scheds = [makeSched('s-1'), makeSched('s-2')];
    mockGetByMed.mockResolvedValue(scheds);

    await useScheduleStore.getState().fetchSchedules('med-1');

    expect(mockGetByMed).toHaveBeenCalledWith('med-1', expect.any(String));
    expect(useScheduleStore.getState().schedules).toEqual(scheds);
    expect(useScheduleStore.getState().isLoading).toBe(false);
  });

  it('DB 오류 시 error 상태를 설정한다', async () => {
    mockGetByMed.mockRejectedValue(new Error('fetch fail'));

    await useScheduleStore.getState().fetchSchedules('med-1');

    expect(useScheduleStore.getState().error).toBe('fetch fail');
  });
});

// ── addSchedule ───────────────────────────────────────────────────────────────

describe('addSchedule', () => {
  it('upsertSchedule 호출 후 목록에 추가한다', async () => {
    const sched = makeSched();

    await useScheduleStore.getState().addSchedule(sched);

    expect(mockUpsert).toHaveBeenCalledWith(sched, expect.any(String));
    expect(useScheduleStore.getState().schedules).toContainEqual(sched);
  });

  it('DB 오류 시 예외를 re-throw 한다', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('add fail'));

    await expect(useScheduleStore.getState().addSchedule(makeSched())).rejects.toThrow(
      'add fail',
    );
  });
});

// ── updateSchedule ────────────────────────────────────────────────────────────

describe('updateSchedule', () => {
  const original = makeSched();
  const updated = { ...original, times: ['09:00'] };

  beforeEach(() => {
    useScheduleStore.setState({ schedules: [original] });
  });

  it('낙관적 업데이트 후 upsertSchedule 을 호출한다', async () => {
    await useScheduleStore.getState().updateSchedule(updated);

    expect(useScheduleStore.getState().schedules[0]?.times).toEqual(['09:00']);
    expect(mockUpsert).toHaveBeenCalledWith(updated, expect.any(String));
  });

  it('DB 오류 시 이전 목록으로 롤백한다', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('update fail'));

    await expect(useScheduleStore.getState().updateSchedule(updated)).rejects.toThrow(
      'update fail',
    );
    expect(useScheduleStore.getState().schedules[0]?.times).toEqual(['08:00']);
  });
});

// ── deleteSchedule ────────────────────────────────────────────────────────────

describe('deleteSchedule', () => {
  const sched = makeSched();

  beforeEach(() => {
    useScheduleStore.setState({ schedules: [sched] });
  });

  it('cancelForSchedule → deleteSchedule(DB) 순서로 호출한다', async () => {
    const callOrder: string[] = [];
    mockCancelForSchedule.mockImplementation(async () => { callOrder.push('cancel'); });
    mockDelete.mockImplementation(async () => { callOrder.push('delete'); });

    await useScheduleStore.getState().deleteSchedule('sched-1');

    expect(callOrder).toEqual(['cancel', 'delete']);
    expect(useScheduleStore.getState().schedules).toHaveLength(0);
  });

  it('cancelForSchedule 에 scheduleId 가 전달된다', async () => {
    await useScheduleStore.getState().deleteSchedule('sched-1');

    expect(mockCancelForSchedule).toHaveBeenCalledWith('sched-1');
  });

  it('DB 오류 시 목록을 복원한다', async () => {
    mockDelete.mockRejectedValueOnce(new Error('del fail'));

    await expect(useScheduleStore.getState().deleteSchedule('sched-1')).rejects.toThrow(
      'del fail',
    );
    expect(useScheduleStore.getState().schedules).toHaveLength(1);
  });
});


