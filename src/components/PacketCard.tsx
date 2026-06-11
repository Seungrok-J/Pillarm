import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { DoseEvent } from '../domain';
import { useThemeStore } from '../store/themeStore';

interface PacketCardProps {
  events: DoseEvent[];
  medicationNames: Record<string, string>;
  medicationColors?: Record<string, string | undefined>;
  onTakePacket: (ids: string[]) => void;
  onSkipPacket: (ids: string[]) => void;
}

export default function PacketCard({
  events,
  medicationNames,
  medicationColors = {},
  onTakePacket,
  onSkipPacket,
}: PacketCardProps) {
  const theme = useThemeStore((s) => s.activeTheme);

  const time       = events[0]?.plannedAt.slice(11, 16) ?? '';
  const takenCount = events.filter((e) => e.status === 'taken').length;
  const total      = events.length;
  const allTaken   = takenCount === total;
  const allDone    = events.every(
    (e) => e.status === 'taken' || e.status === 'skipped' || e.status === 'missed',
  );

  const pendingIds = events
    .filter((e) => e.status === 'scheduled' || e.status === 'late')
    .map((e) => e.id);

  const isTakeable = pendingIds.length > 0;
  const hasLate    = events.some((e) => e.status === 'late');

  function statusColor(): string {
    if (allTaken)  return '#10b981';
    if (allDone)   return '#9ca3af';
    return hasLate ? '#f59e0b' : theme.primary;
  }

  const cardBg = allTaken ? '#f0fdf4' : '#ffffff';

  // 가장 많이 쓰인 색상을 색상 바에 사용 (없으면 파란색)
  const primaryColor = events
    .map((e) => medicationColors[e.medicationId])
    .find(Boolean) ?? theme.primary;

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      {/* 색상 바 — DoseCard 스타일 */}
      <View style={[styles.colorBar, { backgroundColor: primaryColor }]} />

      {/* 상단: 시간 + 약 이름들 + 상태 */}
      <View style={styles.topRow}>
        <Text style={styles.time}>{time}</Text>
        <View style={styles.nameCol}>
          <View style={styles.packetLabelRow}>
            <View style={[styles.packetBadge, { backgroundColor: statusColor() }]}>
              <Text style={styles.packetBadgeText}>포</Text>
            </View>
            <Text style={[styles.packetTitle, allTaken && styles.textDone]}>
              {allTaken ? `${total}개 모두 복용 완료` : `${takenCount}/${total}개 복용`}
            </Text>
          </View>
          <View style={styles.medList}>
            {events.map((e) => {
              const name  = medicationNames[e.medicationId] ?? e.medicationId;
              const done  = e.status === 'taken' || e.status === 'skipped';
              const color = medicationColors[e.medicationId] ?? '#9ca3af';
              return (
                <View key={e.id} style={styles.medRow}>
                  <View style={[styles.dot, { backgroundColor: done ? '#d1d5db' : color }]} />
                  <Text
                    style={[styles.medName, done && styles.medNameDone]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  {e.status === 'taken'   && <Text style={styles.takenMark}>✓</Text>}
                  {e.status === 'skipped' && <Text style={styles.skippedMark}>건너뜀</Text>}
                </View>
              );
            })}
          </View>
        </View>
        {allTaken && <Text style={styles.doneCheck}>✓</Text>}
      </View>

      {/* 하단: 액션 버튼 — DoseCard 레이아웃과 동일 */}
      {!allDone && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.skipActionBtn}
            onPress={() => onSkipPacket(pendingIds)}
            disabled={!isTakeable}
          >
            <Text style={styles.skipActionTxt}>건너뜀</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.takeBtn, { backgroundColor: theme.primary }, !isTakeable && styles.btnDisabled]}
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
    borderRadius: 12,
    paddingLeft: 20,  // colorBar 공간 확보
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    position: 'relative',
  },

  colorBar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  time: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    width: 44,
    marginTop: 2,
  },
  nameCol: {
    flex: 1,
    marginLeft: 10,
  },
  packetLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  packetBadge: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  packetBadgeText: {
    fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: -0.5,
  },
  packetTitle: {
    fontSize: 14, fontWeight: '600', color: '#374151',
  },
  textDone: { color: '#10b981' },

  medList: { gap: 4 },
  medRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#3b82f6',
  },
  medName: {
    flex: 1, fontSize: 13, color: '#374151', fontWeight: '500',
  },
  medNameDone: {
    color: '#9ca3af', textDecorationLine: 'line-through',
  },
  takenMark:   { fontSize: 12, color: '#10b981', fontWeight: '700' },
  skippedMark: { fontSize: 11, color: '#9ca3af' },
  doneCheck:   { fontSize: 18, color: '#10b981', fontWeight: '700', marginLeft: 4 },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  skipActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 44,
    justifyContent: 'center',
  },
  skipActionTxt: { fontSize: 14, color: '#9ca3af' },
  takeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeTxt: { fontSize: 14, color: '#fff', fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
