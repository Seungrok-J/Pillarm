import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { DoseEvent } from '../domain';

interface PacketCardProps {
  events: DoseEvent[];
  medicationNames: Record<string, string>;
  onTakePacket: (ids: string[]) => void;
  onSkipPacket: (ids: string[]) => void;
}

export default function PacketCard({
  events,
  medicationNames,
  onTakePacket,
  onSkipPacket,
}: PacketCardProps) {
  const time = events[0]?.plannedAt.slice(11, 16) ?? '';
  const takenCount = events.filter((e) => e.status === 'taken').length;
  const total = events.length;
  const allTaken = takenCount === total;
  const allDone = events.every((e) => e.status === 'taken' || e.status === 'skipped' || e.status === 'missed');

  const pendingIds = events
    .filter((e) => e.status === 'scheduled' || e.status === 'late')
    .map((e) => e.id);

  const isTakeable = pendingIds.length > 0;

  function statusColor(): string {
    if (allTaken) return '#10b981';
    if (allDone) return '#9ca3af';
    const hasLate = events.some((e) => e.status === 'late');
    return hasLate ? '#f59e0b' : '#3b82f6';
  }

  return (
    <View style={[styles.card, allTaken && styles.cardTaken]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.timeRow}>
          <View style={[styles.packetBadge, { backgroundColor: statusColor() }]}>
            <Text style={styles.packetBadgeText}>포</Text>
          </View>
          <Text style={styles.time}>{time}</Text>
          <Text style={styles.count}>{takenCount}/{total} 복용</Text>
        </View>
        {allTaken && <Text style={styles.doneCheck}>✓</Text>}
      </View>

      {/* 약 목록 */}
      <View style={styles.medList}>
        {events.map((e) => {
          const name = medicationNames[e.medicationId] ?? e.medicationId;
          const done = e.status === 'taken' || e.status === 'skipped';
          return (
            <View key={e.id} style={styles.medRow}>
              <View style={[styles.dot, done && styles.dotDone]} />
              <Text style={[styles.medName, done && styles.medNameDone]} numberOfLines={1}>
                {name}
              </Text>
              {e.status === 'taken' && <Text style={styles.takenMark}>✓</Text>}
            </View>
          );
        })}
      </View>

      {/* 버튼 */}
      {!allDone && (
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => onSkipPacket(pendingIds)}
            disabled={!isTakeable}
          >
            <Text style={styles.skipTxt}>건너뛰기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.takeBtn, !isTakeable && styles.btnDisabled]}
            onPress={() => onTakePacket(pendingIds)}
            disabled={!isTakeable}
          >
            <Text style={styles.takeTxt}>💊 복용</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e0eaff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTaken: {
    borderColor: '#d1fae5',
    backgroundColor: '#f0fdf4',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packetBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packetBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  time: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  count: {
    fontSize: 13,
    color: '#6b7280',
  },
  doneCheck: {
    fontSize: 18,
    color: '#10b981',
    fontWeight: '700',
  },

  medList: {
    gap: 6,
    marginBottom: 12,
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  dotDone: {
    backgroundColor: '#d1d5db',
  },
  medName: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  medNameDone: {
    color: '#9ca3af',
    textDecorationLine: 'line-through',
  },
  takenMark: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '700',
  },

  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  skipTxt: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  takeBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  takeTxt: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
