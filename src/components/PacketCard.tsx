import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { DoseEvent } from '../domain';
import { useThemeStore } from '../store/themeStore';
import {
  DOSE_EARLY_WINDOW_MS,
  DoseDisplayState,
  computeDisplayState,
} from '../utils/doseDisplay';

function fmtHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 복용 가능 창의 시작·종료 시각(HH:MM)을 반환한다 — DoseCard와 동일 로직 */
function windowHint(plannedAt: string, graceMinutes: number): { start: string; end: string } {
  const plannedMs = new Date(plannedAt).getTime();
  return {
    start: fmtHHMM(plannedMs - DOSE_EARLY_WINDOW_MS),
    end:   fmtHHMM(plannedMs + graceMinutes * 60_000),
  };
}

interface PacketCardProps {
  events: DoseEvent[];
  medicationNames: Record<string, string>;
  medicationColors?: Record<string, string | undefined>;
  onTakePacket: (ids: string[]) => void;
  onSkipPacket: (ids: string[]) => void;
  /** 현재 시각 — HomeScreen 에서 1분마다 갱신해 전달. 없으면 렌더 시점 기준. */
  now?: Date;
  /** 복용 허용 범위(분). 기본 120(2시간). DoseCard와 동일 창으로 버튼 표시 여부를 맞춘다. */
  graceMinutes?: number;
}

export default function PacketCard({
  events,
  medicationNames,
  medicationColors = {},
  onTakePacket,
  onSkipPacket,
  now,
  graceMinutes = 120,
}: PacketCardProps) {
  const theme = useThemeStore((s) => s.activeTheme);
  const [expanded, setExpanded] = useState(false);

  const time       = events[0]?.plannedAt.slice(11, 16) ?? '';
  const packetName = events.find((e) => e.packetName)?.packetName;
  const total      = events.length;
  const takenCount = events.filter((e) => e.status === 'taken').length;
  const allTaken   = takenCount === total;
  const allDone    = events.every(
    (e) => e.status === 'taken' || e.status === 'skipped' || e.status === 'missed',
  );

  const pendingIds = events
    .filter((e) => e.status === 'scheduled' || e.status === 'late')
    .map((e) => e.id);
  const hasLate = events.some((e) => e.status === 'late');

  // 포 안의 이벤트는 전부 같은 plannedAt을 공유하므로, 대표 이벤트 하나로
  // DoseCard와 동일한 시간창 로직(computeDisplayState)을 적용해 버튼 표시 여부를 맞춘다.
  const nowMs   = (now ?? new Date()).getTime();
  const graceMs = graceMinutes * 60_000;
  const representative = events[0];
  const displayState: DoseDisplayState = representative
    ? computeDisplayState(representative, nowMs, graceMs)
    : 'waiting';
  const isTakeable = (displayState === 'active' || displayState === 'late') && pendingIds.length > 0;
  const { start, end } = representative
    ? windowHint(representative.plannedAt, graceMinutes)
    : { start: '', end: '' };

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
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cardBg }]}
      activeOpacity={0.85}
      onPress={() => setExpanded((v) => !v)}
      accessibilityLabel={`${packetName || `약 ${total}개`} 포, 눌러서 ${expanded ? '접기' : '포함된 약 보기'}`}
    >
      {/* 색상 바 — DoseCard 스타일 */}
      <View style={[styles.colorBar, { backgroundColor: primaryColor }]} />

      {/* 상단: 시간 + 제목 + 복용 가능 시간 힌트 — 일반 일정 카드(DoseCard)와 동일한 정보 구조 */}
      <View style={styles.topRow}>
        <Text style={styles.time} numberOfLines={1}>{time}</Text>
        <View style={styles.nameCol}>
          <View style={styles.packetLabelRow}>
            <View style={[styles.packetBadge, { backgroundColor: statusColor() }]}>
              <Text style={styles.packetBadgeText}>포</Text>
            </View>
            <Text style={[styles.packetTitle, allTaken && styles.textDone]} numberOfLines={1}>
              {packetName || `약 ${total}개`}
            </Text>
            <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
          </View>

          {allTaken && <Text style={styles.hintGreen}>{total}개 모두 복용 완료</Text>}
          {!allTaken && displayState === 'waiting' && (
            <Text style={styles.hintGray}>{start}부터 복용 가능</Text>
          )}
          {!allTaken && (displayState === 'active' || displayState === 'late') && (
            <Text style={styles.hintGray}>{end}까지 복용 가능</Text>
          )}
          {!allTaken && displayState === 'missed' && (
            <Text style={styles.missedHint}>누락</Text>
          )}

          {/* 포함된 약 리스트 — 카드를 눌러야 펼쳐지는 상세보기 형태 */}
          {expanded && (
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
          )}
        </View>
        {allTaken && <Text style={styles.doneCheck}>✓</Text>}
      </View>

      {/* 하단: 액션 버튼 — DoseCard와 동일하게 시간창 안에서만 노출 */}
      {!allDone && (
        <View style={styles.actionRow}>
          {isTakeable ? (
            <>
              <TouchableOpacity
                style={styles.skipActionBtn}
                onPress={() => onSkipPacket(pendingIds)}
              >
                <Text style={styles.skipActionTxt}>건너뜀</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.takeBtn, { backgroundColor: theme.primary }]}
                onPress={() => onTakePacket(pendingIds)}
              >
                <Text style={styles.takeTxt}>복용</Text>
              </TouchableOpacity>
            </>
          ) : displayState === 'missed' ? (
            <Text style={styles.missedText}>누락</Text>
          ) : (
            <Text style={styles.waitingText}>예정</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
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
    minWidth: 48,
    flexShrink: 0,
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
    marginBottom: 4,
  },
  packetBadge: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  packetBadgeText: {
    fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: -0.5,
  },
  packetTitle: {
    flex: 1, fontSize: 16, color: '#111827',
  },
  textDone: { color: '#10b981' },
  expandIcon: { fontSize: 11, color: '#9ca3af', marginLeft: 4 },

  hintGray:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  hintGreen:  { fontSize: 11, color: '#10b981', marginTop: 2 },
  missedHint: { fontSize: 11, color: '#ef4444', marginTop: 2 },

  medList: { gap: 4, marginTop: 10 },
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
    marginTop: 8,
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
  missedText:  { fontSize: 14, fontWeight: '500', color: '#ef4444', paddingHorizontal: 4, paddingVertical: 10 },
  waitingText: { fontSize: 14, fontWeight: '500', color: '#9ca3af', paddingHorizontal: 4, paddingVertical: 10 },
});
