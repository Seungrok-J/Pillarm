import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
} from 'react-native';
import type { DoseEvent, DoseStatus } from '../domain';

// ── 상수 ─────────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 72;

const STATUS_LABEL: Record<DoseStatus, string> = {
  scheduled: '복용',
  taken: '완료 ✓',
  late: '늦은 복용',
  missed: '누락',
  skipped: '건너뜀',
};

const CARD_BG: Record<DoseStatus, string> = {
  scheduled: '#ffffff',
  taken: '#f0fdf4',
  late: '#fff7ed',
  missed: '#fef2f2',
  skipped: '#f3f4f6',
};

const BTN_BG: Record<DoseStatus, string> = {
  scheduled: '#3b82f6',
  taken: '#e5e7eb',
  late: '#f97316',
  missed: 'transparent',
  skipped: '#e5e7eb',
};

const BTN_TXT: Record<DoseStatus, string> = {
  scheduled: '#ffffff',
  taken: '#6b7280',
  late: '#ffffff',
  missed: '#ef4444',
  skipped: '#6b7280',
};

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export interface DoseCardProps {
  event: DoseEvent;
  medicationName: string;
  onTake: (id: string) => void;
  onSnooze?: (id: string) => void;
  maxSnoozeCount?: number;
}

export default function DoseCard({
  event,
  medicationName,
  onTake,
  onSnooze,
  maxSnoozeCount = 3,
}: DoseCardProps) {
  const isTakeable = event.status === 'scheduled' || event.status === 'late';
  const isSnoozeable =
    isTakeable && onSnooze != null && event.snoozeCount < maxSnoozeCount;

  // "HH:mm" — ISO 문자열에서 직접 추출 (타임존 독립적)
  const time = event.plannedAt.slice(11, 16);

  // ── 스와이프 ─────────────────────────────────────────────────────────────
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dx > 8 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx >= SWIPE_THRESHOLD && isSnoozeable) {
          onSnooze!(event.id);
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  return (
    <View style={{ position: 'relative', marginBottom: 8 }}>
      {/* 스와이프 뒤에 보이는 미루기 힌트 */}
      {isSnoozeable && (
        <View style={styles.swipeHint}>
          <Text style={{ color: '#fff', fontSize: 13 }}>미루기 →</Text>
        </View>
      )}

      <Animated.View
        style={[
          styles.card,
          { backgroundColor: CARD_BG[event.status], transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
        accessibilityLabel={`${medicationName} ${time} ${STATUS_LABEL[event.status]}`}
        testID={`card-${event.id}`}
      >
        {/* 시간 */}
        <Text testID={`card-time-${event.id}`} style={styles.time}>{time}</Text>

        {/* 약 이름 */}
        <Text testID={`card-name-${event.id}`} style={styles.name} numberOfLines={1}>
          {medicationName}
        </Text>

        {/* 미루기 버튼 (접근성 + 테스트용) */}
        {isSnoozeable && (
          <TouchableOpacity
            testID={`btn-snooze-${event.id}`}
            onPress={() => onSnooze!(event.id)}
            accessibilityLabel="미루기"
            style={styles.snoozeBtn}
          >
            <Text style={styles.snoozeTxt}>미루기</Text>
          </TouchableOpacity>
        )}

        {/* 복용/상태 버튼 */}
        <TouchableOpacity
          testID={`btn-take-${event.id}`}
          onPress={() => isTakeable && onTake(event.id)}
          disabled={!isTakeable}
          accessibilityRole="button"
          accessibilityLabel={`${medicationName} ${STATUS_LABEL[event.status]}`}
          style={[
            styles.actionBtn,
            { backgroundColor: BTN_BG[event.status] },
            event.status === 'missed' && styles.missedBtn,
          ]}
        >
          <Text style={[styles.actionTxt, { color: BTN_TXT[event.status] }]}>
            {STATUS_LABEL[event.status]}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  swipeHint: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
  },
  time: { fontSize: 16, fontWeight: '600', color: '#374151', width: 44 },
  name: { flex: 1, marginHorizontal: 10, fontSize: 16, color: '#111827' },
  snoozeBtn: {
    marginRight: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    minHeight: 44,
    justifyContent: 'center',
  },
  snoozeTxt: { fontSize: 14, color: '#6b7280' },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missedBtn: { backgroundColor: 'transparent' },
  actionTxt: { fontSize: 14, fontWeight: '600' },
});
