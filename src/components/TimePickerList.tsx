import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet,
} from 'react-native';

// ── 상수 ─────────────────────────────────────────────────────────────────────

const ITEM_H  = 50;
const VISIBLE = 5;
const PAD     = Math.floor(VISIBLE / 2); // 2

const PERIODS = ['오전', '오후'] as const;
const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// ── 변환 헬퍼 ─────────────────────────────────────────────────────────────────

function parseTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const periodIdx = h < 12 ? 0 : 1;
  const hour12    = h % 12 === 0 ? 12 : h % 12;
  return {
    periodIdx,
    hourIdx: hour12 - 1,
    minIdx: Math.max(0, Math.min(11, Math.round((m ?? 0) / 5))),
  };
}

function buildTime(periodIdx: number, hourIdx: number, minIdx: number): string {
  const hour12 = hourIdx + 1;
  let h24 = hour12;
  if (periodIdx === 0 && hour12 === 12) h24 = 0;
  if (periodIdx === 1 && hour12 < 12)  h24 = hour12 + 12;
  return `${String(h24).padStart(2, '0')}:${MINUTES[minIdx]}`;
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

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface Props {
  times: string[];
  onAdd: (time: string) => void;
  onRemove: (time: string) => void;
}

export default function TimePickerList({ times, onAdd, onRemove }: Props) {
  const [open,      setOpen]      = useState(false);
  const [modalKey,  setModalKey]  = useState(0);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [hourIdx,   setHourIdx]   = useState(7); // 08시
  const [minIdx,    setMinIdx]    = useState(0); // 00분

  function openPicker() {
    setPeriodIdx(0);
    setHourIdx(7);
    setMinIdx(0);
    setModalKey((k) => k + 1);
    setOpen(true);
  }

  function handleConfirm() {
    const time = buildTime(periodIdx, hourIdx, minIdx);
    if (!times.includes(time)) onAdd(time);
    setOpen(false);
  }

  return (
    <View>
      {/* 추가된 시간 칩 */}
      {times.map((time) => (
        <View key={time} style={styles.chip}>
          <Text testID={`time-chip-${time}`} style={styles.chipTime}>{time}</Text>
          <TouchableOpacity
            testID={`btn-remove-time-${time}`}
            onPress={() => onRemove(time)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.chipDel}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* 추가 버튼 */}
      <TouchableOpacity testID="btn-add-time" onPress={openPicker} style={styles.addBtn}>
        <Text style={styles.addBtnTxt}>+ 시간 추가</Text>
      </TouchableOpacity>

      {/* 드럼롤 모달 */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>복용 시간 선택</Text>

            {/* 컬럼 레이블 */}
            <View style={styles.labelRow}>
              <Text style={[styles.colLabel, { width: COL_W.period }]}>오전/오후</Text>
              <Text style={[styles.colLabel, { width: COL_W.hour }]}>시</Text>
              <Text style={[styles.colLabel, { width: COL_W.min }]}>분</Text>
            </View>

            {/* 휠 */}
            <View style={styles.wheelRow}>
              <WheelColumn
                key={`p-${modalKey}`}
                items={PERIODS}
                initial={periodIdx}
                onSelect={setPeriodIdx}
                width={COL_W.period}
              />
              <WheelColumn
                key={`h-${modalKey}`}
                items={HOURS}
                initial={hourIdx}
                onSelect={setHourIdx}
                width={COL_W.hour}
              />
              <WheelColumn
                key={`m-${modalKey}`}
                items={MINUTES}
                initial={minIdx}
                onSelect={setMinIdx}
                width={COL_W.min}
              />
            </View>

            {/* 버튼 */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                testID="btn-cancel-time"
                style={styles.btnCancel}
                onPress={() => setOpen(false)}
              >
                <Text style={styles.btnCancelTxt}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="btn-confirm-time"
                style={styles.btnConfirm}
                onPress={handleConfirm}
              >
                <Text style={styles.btnConfirmTxt}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const COL_W = { period: 90, hour: 72, min: 72 };

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  chipTime: { fontSize: 17, color: '#111827', fontWeight: '500' },
  chipDel:  { color: '#f87171', fontSize: 18 },

  addBtn:    { paddingVertical: 10, marginTop: 4 },
  addBtnTxt: { color: '#3b82f6', fontSize: 16 },

  // 모달
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingBottom: 40, paddingHorizontal: 20,
  },
  sheetTitle: {
    fontSize: 17, fontWeight: '700', color: '#111827',
    textAlign: 'center', marginBottom: 12,
  },

  labelRow:  { flexDirection: 'row', justifyContent: 'center', marginBottom: 2 },
  colLabel:  { textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: '500' },

  wheelRow:  { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },

  // 선택 밴드 (highlight)
  selBand: {
    height: ITEM_H, marginHorizontal: 6,
    backgroundColor: '#eff6ff',
    borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#93c5fd',
    borderRadius: 8,
  },

  // 아이템 텍스트
  itemTxt:    { fontSize: 18, color: '#d1d5db', fontWeight: '400' },
  itemTxtSel: { fontSize: 22, color: '#1d4ed8', fontWeight: '700' },

  // 버튼
  btnRow: { flexDirection: 'row', gap: 12 },
  btnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center',
  },
  btnCancelTxt:  { color: '#374151', fontSize: 15, fontWeight: '600' },
  btnConfirm: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#3b82f6', alignItems: 'center',
  },
  btnConfirmTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
