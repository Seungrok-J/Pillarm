import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { DoseEvent } from '../domain';

interface Props {
  events: DoseEvent[];
  medicationNames: Record<string, string>;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '곧 복용 시간이에요';
  const totalMins = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}시간 ${mins}분 후`;
  return `${mins}분 후`;
}

export default function NextDoseBanner({ events, medicationNames }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // 가장 가까운 scheduled / late 이벤트
  const next = events
    .filter((e) => e.status === 'scheduled' || e.status === 'late')
    .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt))[0];

  if (!next) {
    return (
      <View testID="banner-all-done" style={[styles.banner, styles.doneBanner]}>
        <Text style={styles.doneText}>오늘 복용을 모두 완료했어요! 🎉</Text>
      </View>
    );
  }

  const name = medicationNames[next.medicationId] ?? '약';
  const time = next.plannedAt.slice(11, 16);
  const remaining = formatRemaining(new Date(next.plannedAt).getTime() - now);

  return (
    <View testID="banner-next-dose" style={[styles.banner, styles.nextBanner]}>
      <Text style={styles.nextLabel}>다음 복용</Text>
      <Text testID="banner-med-name" style={styles.nextName}>{name}</Text>
      <Text testID="banner-time" style={styles.nextTime}>{time}</Text>
      <Text testID="banner-remaining" style={styles.remaining}>({remaining})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doneBanner: { backgroundColor: '#f0fdf4' },
  doneText: { fontSize: 15, fontWeight: '600', color: '#16a34a' },
  nextBanner: { backgroundColor: '#eff6ff' },
  nextLabel: { fontSize: 12, color: '#6b7280' },
  nextName: { fontSize: 15, fontWeight: '600', color: '#1d4ed8', flex: 1 },
  nextTime: { fontSize: 15, fontWeight: '600', color: '#1d4ed8' },
  remaining: { fontSize: 13, color: '#6b7280' },
});
