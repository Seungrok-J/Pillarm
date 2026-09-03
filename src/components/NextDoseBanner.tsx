import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import type { DoseEvent } from '../domain';

interface Props {
  events: DoseEvent[];
  medicationNames: Record<string, string>;
}

function formatRemaining(ms: number): string {
  const totalMins = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}시간 ${mins}분 후`;
  return `${mins}분 후`;
}

export default function NextDoseBanner({ events, medicationNames }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // 가장 가까운 scheduled / late 이벤트
  const pending = events
    .filter((e) => e.status === 'scheduled' || e.status === 'late')
    .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));

  const next = pending[0];

  // 다음 복용 대상이 바뀌면 접힘 상태를 초기화한다
  useEffect(() => {
    setCollapsed(false);
  }, [next?.id]);

  if (!next) {
    return (
      <View testID="banner-all-done" style={[styles.banner, styles.doneBanner]}>
        <Text style={styles.doneText}>오늘 복용을 모두 완료했어요! 🎉</Text>
      </View>
    );
  }

  const timeSlot = next.plannedAt.slice(11, 16);
  const sameSlot = pending.filter((e) => e.plannedAt.slice(11, 16) === timeSlot);
  const firstName = medicationNames[next.medicationId] ?? '약';
  const displayName = sameSlot.length > 1
    ? `${firstName} 외 ${sameSlot.length - 1}건`
    : firstName;

  const remainingMs = new Date(next.plannedAt).getTime() - now;
  const isOverdue = remainingMs <= 0;
  const label = isOverdue ? '복용 시간이 지났어요' : '다음 복용 예정';

  if (collapsed) {
    return (
      <TouchableOpacity
        testID="banner-collapsed"
        style={styles.collapsedBar}
        onPress={() => setCollapsed(false)}
        activeOpacity={0.85}
      >
        <Ionicons name="notifications" size={14} color="#3182f6" />
        <Text style={styles.collapsedText}>{label}</Text>
        <Ionicons name="chevron-down" size={14} color="#8b95a1" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      testID="banner-next-dose"
      style={styles.banner}
      onPress={() => setCollapsed(true)}
      activeOpacity={0.9}
    >
      <View style={styles.left}>
        <View style={styles.bellWrap}>
          <Ionicons name="notifications" size={18} color="#fff" />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.label}>{label}</Text>
          {isOverdue ? (
            <Text testID="banner-message" style={styles.message}>
              {timeSlot} <Text testID="banner-med-name">{displayName}</Text>{'\n'}지금 복용해주세요
            </Text>
          ) : (
            <Text testID="banner-message" style={styles.message}>
              {timeSlot} <Text testID="banner-med-name">{displayName}</Text>{'\n'}복용까지 <Text testID="banner-remaining">{formatRemaining(remainingMs)}</Text>
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.6)" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#3182f6',
  },
  doneBanner: { backgroundColor: '#00b894' },
  doneText: { fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center', width: '100%' },

  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  bellWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  textGroup: { gap: 2, flexShrink: 1 },
  label:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  message: { fontSize: 14, color: '#fff', fontWeight: '700', lineHeight: 20 },

  collapsedBar: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#e8f3ff',
    borderWidth: 1,
    borderColor: '#d2e4fc',
  },
  collapsedText: { fontSize: 13, fontWeight: '700', color: '#3182f6' },
});
