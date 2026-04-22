import { DoseEvent, DoseStatus } from '../src/domain';

describe('DoseEvent type', () => {
  it('can be constructed with required fields', () => {
    const event: DoseEvent = {
      id: 'test-id',
      scheduleId: 'sched-1',
      medicationId: 'med-1',
      plannedAt: '2026-04-22T10:00:00.000Z',
      status: 'scheduled',
      snoozeCount: 0,
      source: 'notification',
      createdAt: '2026-04-22T00:00:00.000Z',
      updatedAt: '2026-04-22T00:00:00.000Z',
    };
    expect(event.status).toBe('scheduled');
  });

  it('covers all valid status values', () => {
    const statuses: DoseStatus[] = ['scheduled', 'taken', 'late', 'missed', 'skipped'];
    expect(statuses).toHaveLength(5);
  });
});
