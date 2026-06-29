import { upsertMedication } from '../db/medications';
import { upsertSchedule } from '../db/schedules';
import { insertDoseEvent } from '../db/doseEvents';
import type { DoseEvent, Medication, Schedule } from '../domain';

function localDateStr(daysOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function plannedAt(dateStr: string, hhmm: string): string {
  return `${dateStr}T${hhmm}:00`;
}

type PastStatus = 'taken' | 'missed' | 'skipped';

interface EventSpec {
  schedId: string;
  medId: string;
  time: string;
  // index 0 = D-6, ..., 5 = D-1
  pastStatuses: PastStatus[];
  todayMorning: boolean; // 오늘 이 시간이 아침(이미 지남)이면 taken, 아니면 scheduled
}

export async function seedDemoData(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const startDate = localDateStr(-30);

  // ── IDs ────────────────────────────────────────────────────────────────────
  const tag = userId.slice(0, 6);
  const MED = {
    aspirin:   `demo-aspirin-${tag}`,
    metformin: `demo-metformin-${tag}`,
    tylenol:   `demo-tylenol-${tag}`,
    vitd:      `demo-vitd-${tag}`,
    omega3:    `demo-omega3-${tag}`,
  };
  const SCHED = {
    aspirin:      `demo-sa-${tag}`,
    metforminAm:  `demo-smAm-${tag}`,
    metforminPm:  `demo-smPm-${tag}`,
    tylenolAm:    `demo-staAm-${tag}`,
    tylenolPm:    `demo-staPm-${tag}`,
    vitd:         `demo-svd-${tag}`,
    omega3:       `demo-so3-${tag}`,
  };

  // ── 약 목록 ────────────────────────────────────────────────────────────────
  const medications: Medication[] = [
    { id: MED.aspirin,   name: '아스피린 프로텍트 100mg', dosageValue: 100,  dosageUnit: 'mg',  color: '#dc2626', isActive: true, createdAt: now, updatedAt: now },
    { id: MED.metformin, name: '메트포르민 500mg',        dosageValue: 500,  dosageUnit: 'mg',  color: '#2563eb', isActive: true, createdAt: now, updatedAt: now },
    { id: MED.tylenol,   name: '타이레놀 500mg',          dosageValue: 500,  dosageUnit: 'mg',  color: '#f59e0b', isActive: true, createdAt: now, updatedAt: now },
    { id: MED.vitd,      name: '비타민 D3 1000IU',        dosageValue: 1000, dosageUnit: 'IU',  color: '#10b981', isActive: true, createdAt: now, updatedAt: now },
    { id: MED.omega3,    name: '오메가-3 1000mg',         dosageValue: 1000, dosageUnit: 'mg',  color: '#8b5cf6', isActive: true, createdAt: now, updatedAt: now },
  ];

  // ── 스케줄 목록 ────────────────────────────────────────────────────────────
  const schedules: Schedule[] = [
    { id: SCHED.aspirin,     medicationId: MED.aspirin,   scheduleType: 'fixed', startDate, times: ['08:00'], withFood: 'after',  graceMinutes: 120, isActive: true, createdAt: now, updatedAt: now },
    { id: SCHED.metforminAm, medicationId: MED.metformin, scheduleType: 'fixed', startDate, times: ['07:30'], withFood: 'after',  graceMinutes: 60,  isActive: true, createdAt: now, updatedAt: now },
    { id: SCHED.metforminPm, medicationId: MED.metformin, scheduleType: 'fixed', startDate, times: ['18:30'], withFood: 'after',  graceMinutes: 60,  isActive: true, createdAt: now, updatedAt: now },
    { id: SCHED.tylenolAm,   medicationId: MED.tylenol,   scheduleType: 'fixed', startDate, times: ['09:00'], withFood: 'none',   graceMinutes: 120, isActive: true, createdAt: now, updatedAt: now },
    { id: SCHED.tylenolPm,   medicationId: MED.tylenol,   scheduleType: 'fixed', startDate, times: ['21:00'], withFood: 'none',   graceMinutes: 120, isActive: true, createdAt: now, updatedAt: now },
    { id: SCHED.vitd,        medicationId: MED.vitd,      scheduleType: 'fixed', startDate, times: ['12:00'], withFood: 'none',   graceMinutes: 180, isActive: true, createdAt: now, updatedAt: now },
    { id: SCHED.omega3,      medicationId: MED.omega3,    scheduleType: 'fixed', startDate, times: ['18:30'], withFood: 'after',  graceMinutes: 120, isActive: true, createdAt: now, updatedAt: now },
  ];

  // ── 이벤트 스펙 ────────────────────────────────────────────────────────────
  // pastStatuses: D-6, D-5, D-4, D-3, D-2, D-1 순서
  const specs: EventSpec[] = [
    { schedId: SCHED.aspirin,     medId: MED.aspirin,   time: '08:00', pastStatuses: ['taken','taken','taken','missed','taken','taken'], todayMorning: true  },
    { schedId: SCHED.metforminAm, medId: MED.metformin, time: '07:30', pastStatuses: ['taken','taken','missed','taken','taken','taken'], todayMorning: true  },
    { schedId: SCHED.metforminPm, medId: MED.metformin, time: '18:30', pastStatuses: ['taken','taken','taken','taken','skipped','taken'], todayMorning: false },
    { schedId: SCHED.tylenolAm,   medId: MED.tylenol,   time: '09:00', pastStatuses: ['taken','missed','taken','taken','taken','taken'], todayMorning: true  },
    { schedId: SCHED.tylenolPm,   medId: MED.tylenol,   time: '21:00', pastStatuses: ['taken','taken','taken','skipped','taken','taken'], todayMorning: false },
    { schedId: SCHED.vitd,        medId: MED.vitd,      time: '12:00', pastStatuses: ['taken','missed','taken','taken','taken','taken'], todayMorning: true  },
    { schedId: SCHED.omega3,      medId: MED.omega3,    time: '18:30', pastStatuses: ['taken','taken','taken','taken','taken','skipped'], todayMorning: false },
  ];

  // ── DB 삽입 ────────────────────────────────────────────────────────────────
  await Promise.all(medications.map((m) => upsertMedication(m, userId)));
  await Promise.all(schedules.map((s) => upsertSchedule(s, userId)));

  const doseEvents: Array<{ event: DoseEvent }> = [];

  for (const spec of specs) {
    // 과거 6일 (D-6 ~ D-1)
    for (let i = 0; i < 6; i++) {
      const dayOffset = -(6 - i);
      const dateStr = localDateStr(dayOffset);
      const pa = plannedAt(dateStr, spec.time);
      const status = spec.pastStatuses[i];
      const takenAt = status === 'taken'
        ? plannedAt(dateStr, spec.time).replace(':00', `:${String(Math.floor(Math.random() * 15)).padStart(2, '0')}`)
        : undefined;
      doseEvents.push({
        event: {
          id:          `demo-ev-${spec.schedId}-${dayOffset}-${tag}`,
          scheduleId:  spec.schedId,
          medicationId: spec.medId,
          plannedAt:   pa,
          status,
          takenAt,
          snoozeCount: 0,
          source:      'manual',
          createdAt:   now,
          updatedAt:   now,
        },
      });
    }

    // 오늘 이벤트
    const todayStr = localDateStr(0);
    const pa = plannedAt(todayStr, spec.time);
    const todayStatus: DoseEvent['status'] = spec.todayMorning ? 'taken' : 'scheduled';
    const takenAt = spec.todayMorning
      ? plannedAt(todayStr, spec.time).replace(':00', `:${String(Math.floor(Math.random() * 10)).padStart(2, '0')}`)
      : undefined;
    doseEvents.push({
      event: {
        id:           `demo-ev-${spec.schedId}-0-${tag}`,
        scheduleId:   spec.schedId,
        medicationId: spec.medId,
        plannedAt:    pa,
        status:       todayStatus,
        takenAt,
        snoozeCount:  0,
        source:       'manual',
        createdAt:    now,
        updatedAt:    now,
      },
    });
  }

  // insertDoseEvent는 중복 시 무시 (UNIQUE plannedAt+scheduleId 없지만, 같은 id면 충돌 없이 skip)
  for (const { event } of doseEvents) {
    try {
      await insertDoseEvent(event, userId);
    } catch {
      // 이미 존재하면 skip
    }
  }
}
