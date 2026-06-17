import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { RootStackParamList } from '../../navigation';
import type { MedicationScanResult } from '../../features/medicationScan/scanUtils';
import { DOSAGE_UNITS } from '../../features/medicationScan/scanUtils';
import { generateId, todayString } from '../../utils';
import { upsertMedication, upsertSchedule } from '../../db';
import { scheduleForSchedule } from '../../notifications';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store';
import TimePickerList from '../../components/TimePickerList';

type Nav   = StackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ScanResult'>;

const WITH_FOOD_LABELS = { before: '식전', after: '식후', none: '무관' } as const;

// ── 날짜 헬퍼 ─────────────────────────────────────────────────────────────────

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, day] = dateStr.split('-');
  return `${y}년 ${Number(m)}월 ${Number(day)}일`;
}

/** 복용 시간 배열을 정렬해 묶음 키로 사용 (같은 시간 조합만 한 포로 묶을 수 있음) */
function timeKeyOf(item: MedicationScanResult): string {
  return [...item.suggestedTimes].sort().join(',');
}

// ── DatePickerField ──────────────────────────────────────────────────────────

interface DatePickerFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minimumDate?: Date;
  disabled?: boolean;
}

function DatePickerField({ value, onChange, placeholder, minimumDate, disabled }: DatePickerFieldProps) {
  const [show,     setShow]     = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  function openPicker() {
    if (disabled) return;
    setTempDate(value ? new Date(value + 'T00:00:00') : new Date());
    setShow(true);
  }

  const pickerNode = (
    <DateTimePicker
      value={tempDate}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      locale="ko-KR"
      minimumDate={minimumDate}
      onChange={(_, selected) => {
        if (Platform.OS === 'android') {
          setShow(false);
          if (selected) onChange(toLocalDateString(selected));
        } else {
          if (selected) setTempDate(selected);
        }
      }}
    />
  );

  return (
    <>
      <TouchableOpacity
        style={[dpStyles.btn, disabled && { opacity: 0.5 }]}
        onPress={openPicker}
      >
        <Text style={value ? dpStyles.valueTxt : dpStyles.placeholderTxt}>
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
        <Text style={dpStyles.icon}>📅</Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <View style={dpStyles.overlay}>
            <View style={dpStyles.sheet}>
              <View style={dpStyles.toolbar}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={dpStyles.cancelTxt}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { onChange(toLocalDateString(tempDate)); setShow(false); }}>
                  <Text style={dpStyles.confirmTxt}>확인</Text>
                </TouchableOpacity>
              </View>
              {pickerNode}
            </View>
          </View>
        </Modal>
      ) : (
        show && pickerNode
      )}
    </>
  );
}

const dpStyles = {
  btn: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#fff', marginBottom: 4,
  },
  valueTxt:       { fontSize: 15, color: '#111827' },
  placeholderTxt: { fontSize: 15, color: '#9ca3af' },
  icon:           { fontSize: 18 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' as const },
  sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  toolbar:        {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  cancelTxt:  { fontSize: 16, color: '#6b7280' },
  confirmTxt: { fontSize: 16, color: '#3b82f6', fontWeight: '600' as const },
};

// ── 메인 화면 ─────────────────────────────────────────────────────────────────

export default function ScanResultScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const settings = useSettingsStore.getState().settings;

  const [items, setItems] = useState<MedicationScanResult[]>(params.results);
  const [tabIndex, setTabIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  // 포 그룹화는 같은 복용 시간을 가진 약끼리만 가능 — 시간 시그니처(timeKey)로 묶음을 자동 구성한다.
  const [packetExcluded, setPacketExcluded] = useState<Record<string, Set<number>>>({});
  const [packetNames, setPacketNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 각 약별 날짜 상태 (startDate, endDate)
  const today = todayString();
  const [startDates, setStartDates] = useState<string[]>(() =>
    params.results.map(() => today),
  );
  const [endDates, setEndDates] = useState<string[]>(() =>
    params.results.map((item) =>
      item.durationDays ? addDays(today, item.durationDays - 1) : '',
    ),
  );

  // 저장 완료 전 뒤로가기 방지
  const savedRef = useRef(false);
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current) return;
      e.preventDefault();
      Alert.alert(
        '스캔 결과가 사라집니다',
        '지금 나가면 인식된 약 정보가 모두 사라집니다.\n정말 나가시겠어요?',
        [
          { text: '계속 등록', style: 'cancel' },
          {
            text: '나가기',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
  }, [navigation]);

  const currentItem = items[tabIndex];

  // 같은 복용 시간을 가진(2개 이상) 약들만 포 묶음 후보가 된다.
  const timeGroups = useMemo(() => {
    const map = new Map<string, number[]>();
    items.forEach((item, i) => {
      if (skipped.has(i)) return;
      if (item.suggestedTimes.length === 0) return;
      const key = timeKeyOf(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return [...map.entries()].filter(([, idxs]) => idxs.length >= 2);
  }, [items, skipped]);

  function togglePacketMember(key: string, idx: number) {
    setPacketExcluded((prev) => {
      const cur = new Set(prev[key] ?? []);
      cur.has(idx) ? cur.delete(idx) : cur.add(idx);
      return { ...prev, [key]: cur };
    });
  }

  function updateField<K extends keyof MedicationScanResult>(
    key: K,
    value: MedicationScanResult[K],
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === tabIndex ? { ...item, [key]: value } : item)),
    );
  }

  function toggleSkip() {
    setSkipped((prev) => {
      const s = new Set(prev);
      s.has(tabIndex) ? s.delete(tabIndex) : s.add(tabIndex);
      return s;
    });
  }

  // durationDays 변경 시 endDate 자동 업데이트
  function handleDurationChange(idx: number, days: number | undefined) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, durationDays: days } : item)),
    );
    setEndDates((prev) => {
      const next = [...prev];
      next[idx] = days ? addDays(startDates[idx], days - 1) : '';
      return next;
    });
  }

  async function handleCreate() {
    const userId   = useAuthStore.getState().userId ?? 'local';
    const s = useSettingsStore.getState().settings;

    const toCreate = items.filter((_, i) => !skipped.has(i));
    if (toCreate.length === 0) {
      Alert.alert('알림', '건너뛰지 않은 약이 없습니다.');
      return;
    }

    // 시간이 같은 묶음별로 패킷 ID·이름을 부여한다 (제외 체크된 약은 빠짐)
    const packetInfoByIndex = new Map<number, { id: string; name?: string }>();
    for (const [key, idxs] of timeGroups) {
      const excluded = packetExcluded[key] ?? new Set<number>();
      const included = idxs.filter((i) => !excluded.has(i));
      if (included.length < 2) continue;
      const packetId = generateId();
      const name = packetNames[key]?.trim() || undefined;
      for (const i of included) packetInfoByIndex.set(i, { id: packetId, name });
    }

    setSaving(true);
    try {
      for (const [origIdx, item] of items.entries()) {
        if (skipped.has(origIdx) || !item.medicationName.trim()) continue;

        const sd = startDates[origIdx] || today;
        const ed = endDates[origIdx] || undefined;

        const medicationId = generateId();
        const scheduleId   = generateId();
        const now          = new Date().toISOString();

        await upsertMedication(
          {
            id:          medicationId,
            name:        item.medicationName.trim(),
            dosageValue: item.dosageValue,
            dosageUnit:  item.dosageUnit,
            isActive:    true,
            createdAt:   now,
            updatedAt:   now,
          },
          userId,
        );

        const packetInfo = packetInfoByIndex.get(origIdx);

        const schedule = {
          id:           scheduleId,
          medicationId,
          scheduleType: 'fixed' as const,
          startDate:    sd,
          endDate:      ed,
          times:        item.suggestedTimes.length > 0 ? item.suggestedTimes : ['08:00'],
          withFood:     item.withFood ?? ('none' as const),
          graceMinutes: 120,
          isActive:     true,
          packetId:     packetInfo?.id,
          packetName:   packetInfo?.name,
          createdAt:    now,
          updatedAt:    now,
        };

        await upsertSchedule(schedule, userId);

        if (s) {
          const med = { id: medicationId, name: item.medicationName.trim(), isActive: true, createdAt: now, updatedAt: now };
          await scheduleForSchedule(schedule, med, s);
        }
      }

      savedRef.current = true;
      Alert.alert(
        '일정 등록 완료',
        `${toCreate.length}개 약 일정이 등록되었습니다.`,
        [{ text: '확인', onPress: () => navigation.popToTop() }],
      );
    } catch {
      Alert.alert('오류', '일정 등록 중 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  if (!currentItem) return null;

  const isSkipped = skipped.has(tabIndex);

  const mealTimes = settings
    ? [
        { label: '아침', time: settings.mealTimeBreakfast },
        { label: '점심', time: settings.mealTimeLunch },
        { label: '저녁', time: settings.mealTimeDinner },
      ]
    : [
        { label: '아침', time: '09:00' },
        { label: '점심', time: '12:00' },
        { label: '저녁', time: '18:00' },
      ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {/* 탭 — 글자 잘림 없게 minWidth 기반 */}
      {items.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabContent}
        >
          {items.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.tab,
                tabIndex === i && styles.tabActive,
                skipped.has(i) && styles.tabSkipped,
              ]}
              onPress={() => setTabIndex(i)}
            >
              <Text
                style={[styles.tabText, tabIndex === i && styles.tabTextActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {skipped.has(i) ? '✕ ' : ''}{item.medicationName || `약 ${i + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.fieldGroup, isSkipped && styles.dimmed]}>

          {/* 약 이름 */}
          <FieldLabel label="약 이름 *" />
          <TextInput
            style={styles.input}
            value={currentItem.medicationName}
            onChangeText={(v) => updateField('medicationName', v)}
            placeholder="약 이름 입력"
            editable={!isSkipped}
          />

          {/* 용량 */}
          <FieldLabel label="용량" />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 8 }]}
              value={currentItem.dosageValue != null ? String(currentItem.dosageValue) : ''}
              onChangeText={(v) => updateField('dosageValue', v ? Number(v) : undefined)}
              keyboardType="numeric"
              placeholder="숫자"
              editable={!isSkipped}
            />
            {DOSAGE_UNITS.map((unit) => (
              <TouchableOpacity
                key={unit}
                style={[
                  styles.unitBtn,
                  currentItem.dosageUnit === unit && styles.unitBtnActive,
                  isSkipped && { opacity: 0.4 },
                ]}
                onPress={() => !isSkipped && updateField('dosageUnit', currentItem.dosageUnit === unit ? undefined : unit)}
              >
                <Text style={[styles.unitBtnText, currentItem.dosageUnit === unit && styles.unitBtnTextActive]}>
                  {unit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 복용 시간 — 일정추가 화면과 동일 스타일 */}
          <FieldLabel label="복용 시간" />
          {/* 식사 시간 단축 선택 */}
          <View style={styles.mealRow}>
            {mealTimes.map(({ label, time }) => {
              const selected = currentItem.suggestedTimes.includes(time);
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.mealBtn, selected && styles.mealBtnActive, isSkipped && { opacity: 0.4 }]}
                  onPress={() => {
                    if (isSkipped) return;
                    const times = currentItem.suggestedTimes;
                    const next  = selected
                      ? times.filter((t) => t !== time)
                      : [...times, time].sort();
                    updateField('suggestedTimes', next);
                  }}
                >
                  <Text style={[styles.mealTxt, selected && styles.mealTxtActive]}>{label}</Text>
                  <Text style={[styles.mealTime, selected && styles.mealTimeActive]}>{time}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* 시간 드럼롤 선택기 */}
          {!isSkipped && (
            <TimePickerList
              times={currentItem.suggestedTimes}
              onAdd={(t) => {
                const times = currentItem.suggestedTimes;
                if (!times.includes(t)) {
                  updateField('suggestedTimes', [...times, t].sort());
                }
              }}
              onRemove={(t) => {
                updateField('suggestedTimes', currentItem.suggestedTimes.filter((x) => x !== t));
              }}
            />
          )}

          {/* 복용 기간 */}
          <FieldLabel label="복용 기간 (일)" />
          <TextInput
            style={styles.input}
            value={currentItem.durationDays != null ? String(currentItem.durationDays) : ''}
            onChangeText={(v) => handleDurationChange(tabIndex, v ? Number(v) : undefined)}
            keyboardType="numeric"
            placeholder="예: 5 (비워두면 상시)"
            editable={!isSkipped}
          />

          {/* 시작일 / 종료일 */}
          <FieldLabel label="시작일" />
          <DatePickerField
            value={startDates[tabIndex]}
            onChange={(v) => {
              setStartDates((prev) => { const n = [...prev]; n[tabIndex] = v; return n; });
              if (endDates[tabIndex] && endDates[tabIndex] < v) {
                setEndDates((prev) => {
                  const n = [...prev];
                  n[tabIndex] = currentItem.durationDays
                    ? addDays(v, currentItem.durationDays - 1)
                    : v;
                  return n;
                });
              }
            }}
            placeholder="시작일 선택"
            disabled={isSkipped}
          />

          <FieldLabel label="종료일" />
          <DatePickerField
            value={endDates[tabIndex]}
            onChange={(v) => setEndDates((prev) => { const n = [...prev]; n[tabIndex] = v; return n; })}
            placeholder="종료일 선택 (비워두면 상시)"
            minimumDate={startDates[tabIndex] ? new Date(startDates[tabIndex] + 'T00:00:00') : undefined}
            disabled={isSkipped}
          />

          {/* 식전/식후 */}
          <FieldLabel label="식전/식후" />
          <View style={styles.row}>
            {(['before', 'after', 'none'] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.segBtn, currentItem.withFood === opt && styles.segBtnActive]}
                onPress={() => !isSkipped && updateField('withFood', opt)}
              >
                <Text style={[styles.segBtnText, currentItem.withFood === opt && styles.segBtnTextActive]}>
                  {WITH_FOOD_LABELS[opt]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 메모 */}
          {currentItem.note ? (
            <>
              <FieldLabel label="특이사항" />
              <Text style={styles.noteText}>{currentItem.note}</Text>
            </>
          ) : null}
        </View>

        {/* 건너뛰기 토글 */}
        <TouchableOpacity style={styles.skipBtn} onPress={toggleSkip}>
          <Text style={[styles.skipBtnText, isSkipped && { color: '#3b82f6' }]}>
            {isSkipped ? '이 약 포함하기' : '이 약 건너뛰기'}
          </Text>
        </TouchableOpacity>

        {/* 포 그룹화 — 같은 복용 시간을 가진 약끼리만 묶을 수 있다 */}
        {timeGroups.length > 0 ? (
          timeGroups.map(([key, idxs]) => {
            const excluded = packetExcluded[key] ?? new Set<number>();
            const includedCount = idxs.filter((i) => !excluded.has(i)).length;
            const times = key.split(',');
            return (
              <View key={key} style={styles.packetSection}>
                <View style={styles.packetTitleRow}>
                  <Text style={styles.packetTitle}>💊 {times.join('  ')} 한 포로 묶기</Text>
                  <Text style={styles.packetHint}>
                    같은 시간에 복용하는 약만 묶을 수 있어요 · 홈에서 한 번에 복용 체크돼요
                  </Text>
                </View>

                <TextInput
                  style={styles.input}
                  value={packetNames[key] ?? ''}
                  onChangeText={(v) => setPacketNames((prev) => ({ ...prev, [key]: v }))}
                  placeholder="그룹 이름 (예: 아침약, 식후약)"
                  maxLength={20}
                />

                {idxs.map((i) => {
                  const item = items[i];
                  const inPacket = !excluded.has(i);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.packetRow}
                      onPress={() => togglePacketMember(key, i)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, inPacket && styles.checkboxChecked]}>
                        {inPacket && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.packetItemName} numberOfLines={1}>
                        {item.medicationName || `약 ${i + 1}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {includedCount < 2 && (
                  <Text style={styles.packetWarning}>
                    2개 이상 선택해야 포로 묶입니다
                  </Text>
                )}
              </View>
            );
          })
        ) : items.length >= 2 ? (
          <View style={styles.packetSection}>
            <Text style={styles.packetHint}>
              복용 시간이 같은 약이 2개 이상 있어야 한 포로 묶을 수 있어요
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        <Text style={styles.footerHint}>
          {items.length - skipped.size}개 약 일정 등록 예정
        </Text>
        <TouchableOpacity
          style={[styles.createBtn, saving && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={saving}
        >
          <Text style={styles.createBtnText}>
            {saving ? '저장 중...' : `${items.length - skipped.size}개 일정 만들기`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },

  tabScroll:      { backgroundColor: '#fff', maxHeight: 52, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tabContent:     { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab:            { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', minWidth: 60 },
  tabActive:      { backgroundColor: '#3b82f6' },
  tabSkipped:     { backgroundColor: '#e5e7eb', opacity: 0.6 },
  tabText:        { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive:  { color: '#fff', fontWeight: '600' },

  content:    { padding: 20, paddingBottom: 120 },
  fieldGroup: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 4 },
  dimmed:     { opacity: 0.4 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 12, marginBottom: 4 },

  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  row: { flexDirection: 'row', alignItems: 'center' },

  unitBtn:           { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', marginLeft: 6 },
  unitBtnActive:     { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  unitBtnText:       { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  unitBtnTextActive: { color: '#fff' },

  // 식사 시간 단축 버튼 (일정추가 화면과 동일)
  mealRow:       { flexDirection: 'row', gap: 8, marginBottom: 10, marginTop: 4 },
  mealBtn:       { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, alignItems: 'center', gap: 2 },
  mealBtnActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  mealTxt:       { fontSize: 13, fontWeight: '600', color: '#374151' },
  mealTxtActive: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
  mealTime:      { fontSize: 11, color: '#9ca3af' },
  mealTimeActive:{ fontSize: 11, color: '#3b82f6' },

  segBtn:           { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginRight: 6, backgroundColor: '#f9fafb' },
  segBtnActive:     { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  segBtnText:       { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  segBtnTextActive: { color: '#fff', fontWeight: '700' },

  noteText: { fontSize: 13, color: '#6b7280', lineHeight: 20, marginTop: 4 },

  skipBtn:     { alignSelf: 'center', marginTop: 16 },
  skipBtnText: { fontSize: 14, color: '#ef4444', fontWeight: '500' },

  packetSection: {
    marginTop: 20, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, borderWidth: 1.5, borderColor: '#e0eaff',
  },
  packetTitleRow: { marginBottom: 12 },
  packetTitle:    { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  packetHint:     { fontSize: 12, color: '#6b7280' },
  packetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb',
  },
  checkboxChecked: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkmark:       { fontSize: 13, color: '#fff', fontWeight: '800' },
  packetItemName:  { flex: 1, fontSize: 14, fontWeight: '500', color: '#374151' },
  packetWarning:   { fontSize: 12, color: '#f59e0b', marginTop: 8, textAlign: 'center' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 24, gap: 8,
  },
  footerHint:    { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  createBtn:     { backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
