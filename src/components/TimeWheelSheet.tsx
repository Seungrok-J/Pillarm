import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 시간 선택 드럼롤 바텀시트 (오전/오후 · 시 · 분).
 *
 * 시간을 고르는 UI 는 앱 전체에서 이 컴포넌트 하나만 쓴다 —
 * 일정의 복용 시간 목록(`TimePickerList`)과 설정의 단일 시간 항목이 함께 사용한다.
 */

// ── 상수 ─────────────────────────────────────────────────────────────────────

const ITEM_H  = 50;
const VISIBLE = 5;
const PAD     = Math.floor(VISIBLE / 2); // 2

const PERIODS = ['오전', '오후'] as const;
const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
/** 5분 단위 — 복약 시간에 그보다 촘촘한 단위는 의미가 없다 */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const COL_W = { period: 90, hour: 72, min: 72 };

// ── 변환 헬퍼 ─────────────────────────────────────────────────────────────────

export function parseTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const periodIdx = h < 12 ? 0 : 1;
  const hour12    = h % 12 === 0 ? 12 : h % 12;
  return {
    periodIdx,
    hourIdx: hour12 - 1,
    minIdx: Math.max(0, Math.min(11, Math.round((m ?? 0) / 5))),
  };
}

export function buildTime(periodIdx: number, hourIdx: number, minIdx: number): string {
  const hour12 = hourIdx + 1;
  let h24 = hour12;
  if (periodIdx === 0 && hour12 === 12) h24 = 0;
  if (periodIdx === 1 && hour12 < 12)  h24 = hour12 + 12;
  return `${String(h24).padStart(2, '0')}:${MINUTES[minIdx]}`;
}

/** "23:00" → "오후 11:00" — 24시간제보다 읽기 쉬워 고령 사용자에게 유리하다 */
export function formatTimeKo(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour12}:${String(m).padStart(2, '0')}`;
}

// ── WheelColumn ───────────────────────────────────────────────────────────────

interface WheelColumnProps {
  items: readonly string[];
  initial: number;
  onSelect: (index: number) => void;
  width: number;
}

function WheelColumn({ items, initial, onSelect, width }: WheelColumnProps) {
  const ref = useRef<ScrollView>(null);
  const [sel, setSel] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: initial * ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, []);

  const snap = useCallback((y: number) => {
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    setSel(idx);
    onSelect(idx);
  }, [items.length, onSelect]);

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
      {/* 선택 영역 하이라이트 */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ height: ITEM_H * PAD }} />
        <View style={styles.selBand} />
      </View>

      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
        onMomentumScrollEnd={(e) => snap(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => snap(e.nativeEvent.contentOffset.y)}
      >
        {items.map((item, i) => (
          <View key={item} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[styles.itemTxt, i === sel && styles.itemTxtSel]}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── 시트 ──────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  /** 열릴 때 휠이 가리킬 시각 "HH:mm" */
  initialTime: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: (time: string) => void;
  onCancel: () => void;
}

export default function TimeWheelSheet({
  visible,
  initialTime,
  title = '시간 선택',
  confirmLabel = '확인',
  onConfirm,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const init = parseTime(initialTime);

  const [periodIdx, setPeriodIdx] = useState(init.periodIdx);
  const [hourIdx,   setHourIdx]   = useState(init.hourIdx);
  const [minIdx,    setMinIdx]    = useState(init.minIdx);
  // 휠은 마운트 시 위치를 잡으므로, 열릴 때마다 key 를 바꿔 다시 마운트시킨다
  const [mountKey,  setMountKey]  = useState(0);

  useEffect(() => {
    if (!visible) return;
    const p = parseTime(initialTime);
    setPeriodIdx(p.periodIdx);
    setHourIdx(p.hourIdx);
    setMinIdx(p.minIdx);
    setMountKey((k) => k + 1);
  }, [visible, initialTime]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: 40 + insets.bottom }]}>
          <Text style={styles.sheetTitle}>{title}</Text>

          <View style={styles.labelRow}>
            <Text style={[styles.colLabel, { width: COL_W.period }]}>오전/오후</Text>
            <Text style={[styles.colLabel, { width: COL_W.hour }]}>시</Text>
            <Text style={[styles.colLabel, { width: COL_W.min }]}>분</Text>
          </View>

          <View style={styles.wheelRow}>
            <WheelColumn key={`p-${mountKey}`} items={PERIODS} initial={periodIdx} onSelect={setPeriodIdx} width={COL_W.period} />
            <WheelColumn key={`h-${mountKey}`} items={HOURS}   initial={hourIdx}   onSelect={setHourIdx}   width={COL_W.hour} />
            <WheelColumn key={`m-${mountKey}`} items={MINUTES} initial={minIdx}    onSelect={setMinIdx}    width={COL_W.min} />
          </View>

          {/* 직접 입력 — 휠이 주 수단이므로 아래에 작게 둔다 */}
          <View style={styles.directRow}>
            <Text style={styles.directLabel}>직접 입력</Text>
            <TextInput
              testID="input-time-value"
              value={buildTime(periodIdx, hourIdx, minIdx)}
              onChangeText={(text) => {
                if (/^\d{2}:\d{2}$/.test(text)) {
                  const parsed = parseTime(text);
                  setPeriodIdx(parsed.periodIdx);
                  setHourIdx(parsed.hourIdx);
                  setMinIdx(parsed.minIdx);
                }
              }}
              style={styles.timeInput}
              placeholder="HH:MM"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity testID="btn-cancel-time" style={styles.btnCancel} onPress={onCancel}>
              <Text style={styles.btnCancelTxt}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="btn-confirm-time"
              style={styles.btnConfirm}
              onPress={() => onConfirm(buildTime(periodIdx, hourIdx, minIdx))}
            >
              <Text style={styles.btnConfirmTxt}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingBottom: 40, paddingHorizontal: 20,
  },
  sheetTitle: {
    fontSize: 17, fontWeight: '700', color: '#111827',
    textAlign: 'center', marginBottom: 12,
  },

  labelRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 2 },
  colLabel: { textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: '500' },

  wheelRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },

  directRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginBottom: 20,
  },
  directLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },

  selBand: {
    height: ITEM_H, marginHorizontal: 6,
    backgroundColor: '#eff6ff',
    borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#93c5fd',
    borderRadius: 8,
  },

  itemTxt:    { fontSize: 18, color: '#d1d5db', fontWeight: '400' },
  itemTxtSel: { fontSize: 22, color: '#1d4ed8', fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: 12 },
  btnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center',
  },
  btnCancelTxt: { color: '#374151', fontSize: 15, fontWeight: '600' },
  btnConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#3b82f6', alignItems: 'center',
  },
  btnConfirmTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },

  timeInput: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 12,
    fontSize: 14, color: '#6b7280', textAlign: 'center', minWidth: 84,
  },
});
