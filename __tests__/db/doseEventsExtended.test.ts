/**
 * doseEvents 확장 함수 테스트
 *
 * AC1 — deleteTodayAndFutureDoseEvents: 오늘 자정 이후 taken 아닌 이벤트 삭제
 * AC2 — deleteTodayAndFutureDoseEvents: 올바른 SQL 파라미터 전달
 */

jest.mock('expo-sqlite', () => ({}));
jest.mock('../../src/db/database', () => ({ getDatabase: jest.fn() }));

import { deleteTodayAndFutureDoseEvents } from '../../src/db/doseEvents';
import { getDatabase } from '../../src/db/database';

const mockGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

function makeMockDb(overrides: Record<string, jest.Mock> = {}) {
  return {
    getAllAsync:    jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync:      jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (m: ReturnType<typeof makeMockDb>) => m as any;

describe('deleteTodayAndFutureDoseEvents', () => {
  beforeEach(() => jest.clearAllMocks());

  it('AC1 — runAsync 를 정확히 1번 호출한다', async () => {
    const mockDb = makeMockDb();
    mockGetDatabase.mockResolvedValue(asDb(mockDb));

    await deleteTodayAndFutureDoseEvents('sch-1');

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it('AC2 — scheduleId 와 오늘 자정 ISO 문자열을 파라미터로 전달한다', async () => {
    const mockDb = makeMockDb();
    mockGetDatabase.mockResolvedValue(asDb(mockDb));

    const before = new Date();
    before.setHours(0, 0, 0, 0);

    await deleteTodayAndFutureDoseEvents('sch-99');

    const [sql, schedId, dateParam] = mockDb.runAsync.mock.calls[0] as [string, string, string];

    // SQL에 DELETE, schedule_id, taken 가 포함되어야 함
    expect(sql).toContain('DELETE');
    expect(sql).toContain('schedule_id');
    expect(sql).toContain("'taken'");

    expect(schedId).toBe('sch-99');

    // dateParam 은 오늘 자정 형식 YYYY-MM-DDTHH:mm:ss
    expect(dateParam).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);

    // 오늘 날짜와 일치
    const today = new Date();
    const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00`;
    expect(dateParam).toBe(expectedDate);
  });

  it('AC3 — DB 오류 시 예외를 전파한다', async () => {
    const mockDb = makeMockDb({
      runAsync: jest.fn().mockRejectedValue(new Error('db error')),
    });
    mockGetDatabase.mockResolvedValue(asDb(mockDb));

    await expect(deleteTodayAndFutureDoseEvents('sch-1')).rejects.toThrow('db error');
  });
});
