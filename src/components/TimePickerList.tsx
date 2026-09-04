import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText as Text } from './AppText';
import TimeWheelSheet from './TimeWheelSheet';

/**
 * 복용 시간 목록 — 추가·삭제.
 * 시간을 고르는 드럼롤 자체는 `TimeWheelSheet` 가 담당한다(설정 화면과 공유).
 */

interface Props {
  times: string[];
  onAdd: (time: string) => void;
  onRemove: (time: string) => void;
  /** 'card'(기본) — 화면 너비 카드 목록(포 수정 등). 'pill' — 인라인 태그 형태(일정 등록의 복용 시간 섹션 등) */
  variant?: 'card' | 'pill';
}

export default function TimePickerList({ times, onAdd, onRemove, variant = 'card' }: Props) {
  const [open, setOpen] = useState(false);

  function handleConfirm(time: string) {
    if (!times.includes(time)) onAdd(time);
    setOpen(false);
  }

  const isPill = variant === 'pill';

  return (
    <View>
      {isPill ? (
        // 인라인 태그 형태 — 추가된 시간과 "+ 시간 추가"가 한 줄로 함께 흐른다
        <View style={styles.pillWrap}>
          {times.map((time) => (
            <View key={time} style={styles.pill}>
              <Text testID={`time-chip-${time}`} style={styles.pillTime}>{time}</Text>
              <TouchableOpacity
                testID={`btn-remove-time-${time}`}
                onPress={() => onRemove(time)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.pillDel}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity testID="btn-add-time" onPress={() => setOpen(true)} style={styles.addPill}>
            <Text style={styles.addPillTxt}>+ 시간 추가</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* 화면 너비 카드 목록 */}
          {times.map((time) => (
            <View key={time} style={styles.cardRow}>
              <Text testID={`time-chip-${time}`} style={styles.cardRowTime}>{time}</Text>
              <TouchableOpacity
                testID={`btn-remove-time-${time}`}
                onPress={() => onRemove(time)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.cardRowDel}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity testID="btn-add-time" onPress={() => setOpen(true)} style={styles.addBtn}>
            <Text style={styles.addBtnTxt}>+ 시간 추가</Text>
          </TouchableOpacity>
        </>
      )}

      <TimeWheelSheet
        visible={open}
        initialTime="08:00"
        title="복용 시간 선택"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // 카드 목록(기본)
  cardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  cardRowTime: { fontSize: 17, color: '#111827', fontWeight: '600' },
  cardRowDel:  { color: '#ef4444', fontSize: 16, fontWeight: '700' },

  addBtn: {
    paddingVertical: 14, marginTop: 2, borderRadius: 14,
    borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'dashed', alignItems: 'center',
  },
  addBtnTxt: { color: '#3b82f6', fontSize: 15, fontWeight: '600' },

  // 인라인 태그(pill) 목록
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#3b82f6',
    borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14,
  },
  pillTime: { fontSize: 15, fontWeight: '700', color: '#1d4ed8' },
  pillDel:  { fontSize: 13, color: '#93c5fd', fontWeight: '700' },
  addPill: {
    borderRadius: 20, borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'dashed',
    paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center',
  },
  addPillTxt: { fontSize: 14, fontWeight: '600', color: '#3b82f6' },
});
