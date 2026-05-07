import type { DoseEvent } from '../domain';

/** 복용 버튼이 활성화되기 시작하는 예정 시각 기준 앞쪽 범위 (2시간) */
export const DOSE_EARLY_WINDOW_MS = 120 * 60_000;

export type DoseDisplayState =
  | 'waiting'   // 아직 활성화 창 이전
  | 'active'    // 예정 시각 2시간 전 ~ 예정 시각
  | 'late'      // 예정 시각 초과 ~ grace period 이내
  | 'missed'    // grace period 초과
  | 'taken'
  | 'skipped';

export const DOSE_DISPLAY_LABEL: Record<DoseDisplayState, string> = {
  waiting:  '예정',
  active:   '복용 가능',
  late:     '늦은 복용',
  missed:   '누락',
  taken:    '완료',
  skipped:  '건너뜀',
};

export const DOSE_DISPLAY_COLOR: Record<DoseDisplayState, string> = {
  waiting:  '#6b7280',
  active:   '#3b82f6',
  late:     '#f97316',
  missed:   '#ef4444',
  taken:    '#16a34a',
  skipped:  '#9ca3af',
};

/**
 * 현재 시각과 plannedAt을 비교해 표시 상태를 계산한다.
 * DoseCard와 HistoryScreen 양쪽에서 공유하여 일관된 상태를 표시한다.
 */
export function computeDisplayState(
  event: DoseEvent,
  nowMs: number,
  graceMs: number,
): DoseDisplayState {
  if (event.status === 'taken')   return 'taken';
  if (event.status === 'skipped') return 'skipped';
  const plannedMs = new Date(event.plannedAt).getTime();
  if (nowMs > plannedMs + graceMs)          return 'missed';
  if (nowMs > plannedMs)                    return 'late';
  if (nowMs >= plannedMs - DOSE_EARLY_WINDOW_MS) return 'active';
  return 'waiting';
}
