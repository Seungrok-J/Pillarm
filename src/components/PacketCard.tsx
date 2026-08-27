import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DoseEvent, WithFood } from '../domain';
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
  /** 이 포의 식전/식후 여부 — 'none'이거나 없으면 표시하지 않는다. */
  withFood?: WithFood;
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
  withFood,
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
  const anyMissed  = events.some((e) => e.status === 'missed');

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

  // 가장 많이 쓰인 색상을 색상 바에 사용 (없으면 테마 기본색)
  const primaryColor = events
    .map((e) => medicationColors[e.medicationId])
    .find(Boolean) ?? theme.primary;

  const medListText = events
    .map((e) => medicationNames[e.medicationId] ?? e.medicationId)
    .join(', ');

  // ── 상태별 라벨/색상 ──────────────────────────────────────────────────────
  let label = '복용 예정';
  let labelColor = '#8b95a1';
  let timeColor = '#8b95a1';
  if (allTaken) {
    label = '복용 완료'; labelColor = '#00b894'; timeColor = '#8b95a1';
  } else if (anyMissed && allDone) {
    label = '복용 누락'; labelColor = '#ff7675'; timeColor = '#8b95a1';
  } else if (isTakeable) {
    label = hasLate ? '복용 지연' : '복용 가능';
    labelColor = hasLate ? '#ff7675' : '#3182f6';
    timeColor = '#191f28';
  } else if (allDone) {
    label = '건너뜀'; labelColor = '#8b95a1'; timeColor = '#8b95a1';
  }

  return (
    <View style={[styles.row, displayState === 'waiting' && !allDone && styles.dimmed]}>
      <View style={styles.leftTime}>
        <Text style={[styles.time, { color: timeColor }]}>{time}</Text>
        <Text style={[styles.stateLabel, { color: labelColor }]} numberOfLines={1}>{label}</Text>
      </View>

      <TouchableOpacity
        style={[styles.card, isTakeable ? styles.cardHighlighted : styles.cardPlain]}
        activeOpacity={0.85}
        onPress={() => setExpanded((v) => !v)}
        accessibilityLabel={`${packetName || `약 ${total}개`} 포, 눌러서 ${expanded ? '접기' : '포함된 약 보기'}`}
      >
        <View style={[styles.colorBar, { backgroundColor: primaryColor }]} />

        <View style={styles.infoRow}>
          <View style={styles.info}>
            <View style={[styles.statusDot, { backgroundColor: labelColor }]} />
            <View style={styles.nameCol}>
              <View style={styles.titleRow}>
                <View style={[styles.packetBadge, { backgroundColor: labelColor }]}>
                  <Text style={styles.packetBadgeText}>포</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>{packetName || `약 ${total}개`}</Text>
                {withFood && withFood !== 'none' && (
                  <Text style={styles.foodTag}>({withFood === 'before' ? '식전' : '식후'})</Text>
                )}
              </View>
              <Text style={styles.hintGray} numberOfLines={expanded ? undefined : 1}>{medListText}</Text>
              {!allTaken && displayState === 'waiting' && (
                <Text style={styles.hintGray}>{start}부터 복용 가능</Text>
              )}
              {!allTaken && displayState === 'active' && (
                <Text style={styles.hintGray}>{end}까지 복용 가능</Text>
              )}
              {!allTaken && displayState === 'late' && (
                <Text style={[styles.hintGray, { color: '#ff7675' }]}>예정 시각이 지났어요 · {end}까지 복용 가능</Text>
              )}
              {!allTaken && displayState === 'missed' && (
                <Text style={styles.hintGray}>복용 시간이 지났어요</Text>
              )}
            </View>
          </View>
          {allTaken && <Ionicons name="checkmark-circle" size={20} color="#00b894" />}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#8b95a1" />
        </View>

        {/* 포함된 약 리스트 — 펼치면 개별 복용 상태를 보여준다 */}
        {expanded && (
          <View style={styles.medList}>
            {events.map((e) => {
              const name  = medicationNames[e.medicationId] ?? e.medicationId;
              const done  = e.status === 'taken' || e.status === 'skipped';
              const color = medicationColors[e.medicationId] ?? '#8b95a1';
              return (
                <View key={e.id} style={styles.medRow}>
                  <View style={[styles.dot, { backgroundColor: done ? '#d2e4fc' : color }]} />
                  <Text style={[styles.medName, done && styles.medNameDone]} numberOfLines={1}>
                    {name}
                  </Text>
                  {e.status === 'taken'   && <Text style={styles.takenMark}>✓</Text>}
                  {e.status === 'skipped' && <Text style={styles.skippedMark}>건너뜀</Text>}
                </View>
              );
            })}
          </View>
        )}

        {/* 하단: 액션 버튼 — DoseCard와 동일하게 시간창 안에서만 노출 */}
        {isTakeable && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.skipActionBtn} onPress={() => onSkipPacket(pendingIds)}>
              <Text style={styles.skipActionTxt}>건너뜀</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.takeBtn} onPress={() => onTakePacket(pendingIds)}>
              <Text style={styles.takeTxt}>복용 완료</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  dimmed: { opacity: 0.7 },

  leftTime: { width: 46, paddingTop: 12 },
  time:       { fontSize: 14, fontWeight: '700' },
  stateLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },

  card: {
    flex: 1,
    borderRadius: 14,
    paddingLeft: 20,
    paddingRight: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    position: 'relative',
  },
  cardPlain: { borderWidth: 1, borderColor: '#e5e8eb' },
  cardHighlighted: {
    borderWidth: 1.5, borderColor: '#d2e4fc',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },

  colorBar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  info: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12, marginTop: 4 },
  nameCol: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  packetBadge: {
    width: 20, height: 20, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  packetBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  foodTag: { fontSize: 12, fontWeight: '600', color: '#8b95a1' },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: '#191f28' },

  hintGray: { fontSize: 12, color: '#8b95a1', marginTop: 2 },

  medList: { gap: 6, marginTop: 12, paddingLeft: 4 },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3182f6' },
  medName: { flex: 1, fontSize: 13, color: '#4e5968', fontWeight: '500' },
  medNameDone: { color: '#8b95a1', textDecorationLine: 'line-through' },
  takenMark:   { fontSize: 12, color: '#00b894', fontWeight: '700' },
  skippedMark: { fontSize: 11, color: '#8b95a1' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  skipActionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#f2f3f4', minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  skipActionTxt: { fontSize: 12, fontWeight: '700', color: '#4e5968' },
  takeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#3182f6', minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  takeTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
