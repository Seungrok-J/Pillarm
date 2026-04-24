import React from 'react';
import { View } from 'react-native';

/**
 * PRD 달력 도트 규칙:
 * - 100%        → 초록 (#22c55e)
 * - 50 ~ 99%    → 노랑 (#eab308)
 * - 1 ~ 49%     → 주황 (#f97316)
 * - 0%  (이벤트 있음) → 빨강 (#ef4444)
 * - 이벤트 없음  → null (도트 없음)
 */
export function getDotColor(total: number, taken: number): string | null {
  if (total === 0) return null;
  const rate = taken / total;
  if (rate >= 1) return '#22c55e';
  if (rate >= 0.5) return '#eab308';
  if (rate > 0) return '#f97316';
  return '#ef4444';
}

interface DayDotProps {
  color: string;
}

export default function DayDot({ color }: DayDotProps) {
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
        marginTop: 2,
      }}
    />
  );
}
