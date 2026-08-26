import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../../navigation';
import type { MedicationScanResult, MealSlot, MealSettings } from '../../features/medicationScan/scanUtils';
import { DOSAGE_UNITS, suggestTimesFromMeals, addMinutes, timeForMealSlot } from '../../features/medicationScan/scanUtils';
import { generateId, todayString } from '../../utils';
import { upsertMedication, upsertSchedule } from '../../db';
import { scheduleForSchedule } from '../../notifications';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store';
import TimePickerList from '../../components/TimePickerList';
import AlertModal from '../../components/AlertModal';

type Nav   = StackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ScanResult'>;

const WITH_FOOD_LABELS = { before: '식전 30분', after: '식후 30분', none: '무관' } as const;
const WITH_FOOD_OFFSET: Record<'before' | 'after' | 'none', number> = { before: -30, after: 30, none: 0 };

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  morning: '아침', lunch: '점심', dinner: '저녁', bedtime: '취침전',
};

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

function toHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, day] = dateStr.split('-');
  return `${y}년 ${Number(m)}월 ${Number(day)}일`;
}

/** 복용 시간 배열을 정렬해 묶음 키로 사용 (초기 자동 포 제안에 사용) */
function timeKeyOf(item: MedicationScanResult): string {
  return [...item.suggestedTimes].sort().join(',');
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 인식 결과(시간·식전후)를 분석해 포 이름을 자동으로 제안한다 — 예: "아침약(식후)" */
function suggestPackName(
  times: string[],
  memberIdxs: number[],
  items: MedicationScanResult[],
  mealSettings: MealSettings | null,
): string {
  const settings = mealSettings ?? { mealTimeBreakfast: '09:00', mealTimeLunch: '12:00', mealTimeDinner: '18:00' };
  const near = (a: string, b: string) => Math.abs(toMinutes(a) - toMinutes(b)) <= 35;

  const slotLabels = times
    .map((t) => {
      if (near(t, settings.mealTimeBreakfast)) return '아침';
      if (near(t, settings.mealTimeLunch))     return '점심';
      if (near(t, settings.mealTimeDinner))    return '저녁';
      return null;
    })
    .filter((l): l is '아침' | '점심' | '저녁' => l !== null);
  const uniqueLabels = [...new Set(slotLabels)];
  const base = uniqueLabels.length > 0 ? `${uniqueLabels.join('')}약` : `${times[0] ?? ''} 포`;

  const withFoods = new Set(
    memberIdxs
      .map((i) => items[i]?.withFood)
      .filter((w): w is 'before' | 'after' => w === 'before' || w === 'after'),
  );
  const suffix = withFoods.size === 1 ? (withFoods.has('before') ? '(식전)' : '(식후)') : '';
  return base + suffix;
}

/**
 * 포(Pack) — 특정 시간대(들)에 여러 약을 묶어 하나의 알림/체크로 처리.
 * 같은 약이 시간대가 다른 여러 포에 겹쳐 들어갈 수 있다
 * (예: 약1이 "아침·저녁 포"와 "점심 포"에 동시에 속함 — 실제 약국 포장과 동일한 개념).
 */
interface Pack {
  id:         string;
  name:       string;
  times:      string[];
  memberIdxs: number[];
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

// ── MedicationCard — 슬라이드 페이지 1장(= 약 1개) ─────────────────────────────

interface MedicationCardProps {
  idx:         number;
  item:        MedicationScanResult;
  isSkipped:   boolean;
  isExpanded:  boolean;
  startDate:   string;
  endDate:     string;
  mealSlotOptions: MealSlot[];
  width:       number;
  onUpdateField: <K extends keyof MedicationScanResult>(idx: number, key: K, value: MedicationScanResult[K]) => void;
  onToggleSkip:      (idx: number) => void;
  onToggleExpanded:  (idx: number) => void;
  onDurationChange:  (idx: number, days: number | undefined) => void;
  onStartDateChange: (idx: number, v: string) => void;
  onEndDateChange:   (idx: number, v: string) => void;
  onToggleMealSlot:  (idx: number, slot: MealSlot) => void;
  onRemoveMealSlot:  (idx: number, slot: MealSlot) => void;
  onSetWithFood:     (idx: number, opt: 'before' | 'after' | 'none') => void;
  onAddManualTime:   (idx: number, time: string) => void;
  onRemoveTime:      (idx: number, time: string) => void;
  slotTimeLabel:     (item: MedicationScanResult, slot: MealSlot) => string;
}

function MedicationCard({
  idx, item, isSkipped, isExpanded, startDate, endDate, mealSlotOptions, width,
  onUpdateField, onToggleSkip, onToggleExpanded, onDurationChange,
  onStartDateChange, onEndDateChange,
  onToggleMealSlot, onRemoveMealSlot, onSetWithFood, onAddManualTime, onRemoveTime, slotTimeLabel,
}: MedicationCardProps) {
  return (
    <View style={width ? { width } : styles.pageFallback}>
      <View style={[styles.fieldGroup, isSkipped && styles.dimmed]}>
        {!isExpanded ? (
          <TouchableOpacity style={styles.summaryCard} onPress={() => onToggleExpanded(idx)} activeOpacity={0.7}>
            <View style={styles.summaryTopRow}>
              <Text style={styles.summaryName} numberOfLines={2}>
                {item.medicationName || `약 ${idx + 1}`}
              </Text>
              <View style={styles.summaryEditBadge}>
                <Ionicons name="pencil" size={12} color="#3b82f6" />
                <Text style={styles.summaryEditText}>수정</Text>
              </View>
            </View>

            {(item.dosageValue != null || item.dosageUnit) && (
              <Text style={styles.summaryLine}>
                💊 {item.dosageValue ?? ''}{item.dosageUnit ?? ''}
              </Text>
            )}

            <Text style={styles.summaryLine}>
              ⏰ {item.suggestedTimes.length > 0
                    ? item.suggestedTimes.join('  ·  ')
                    : '복용 시간 미설정'}
            </Text>

            <Text style={styles.summaryLine}>
              📅 {item.durationDays ? `${item.durationDays}일분` : '상시 복용'}
              {item.withFood ? `  ·  ${WITH_FOOD_LABELS[item.withFood]}` : ''}
            </Text>

            {item.note ? (
              <Text style={styles.summaryNote} numberOfLines={2}>{item.note}</Text>
            ) : null}

            <Text style={styles.summaryHint}>AI가 인식한 정보예요. 다르면 눌러서 수정하세요.</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.collapseLink} onPress={() => onToggleExpanded(idx)}>
              <Text style={styles.collapseLinkText}>간단히 보기</Text>
              <Ionicons name="chevron-up" size={14} color="#3b82f6" />
            </TouchableOpacity>

            {/* 약 이름 */}
            <FieldLabel label="약 이름 *" />
            <TextInput
              style={styles.input}
              value={item.medicationName}
              onChangeText={(v) => onUpdateField(idx, 'medicationName', v)}
              placeholder="약 이름 입력"
              editable={!isSkipped}
            />

            {/* 용량 */}
            <FieldLabel label="용량" />
            <TextInput
              style={styles.input}
              value={item.dosageValue != null ? String(item.dosageValue) : ''}
              onChangeText={(v) => onUpdateField(idx, 'dosageValue', v ? Number(v) : undefined)}
              keyboardType="numeric"
              placeholder="숫자"
              editable={!isSkipped}
            />
            <View style={styles.unitRow}>
              {DOSAGE_UNITS.map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.unitBtn,
                    item.dosageUnit === unit && styles.unitBtnActive,
                    isSkipped && { opacity: 0.4 },
                  ]}
                  onPress={() => !isSkipped && onUpdateField(idx, 'dosageUnit', item.dosageUnit === unit ? undefined : unit)}
                >
                  <Text
                    style={[styles.unitBtnText, item.dosageUnit === unit && styles.unitBtnTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 복용 시간 — 일정추가 화면과 동일 스타일 */}
            <FieldLabel label="복용 시간" />
            {/* 복용 시점 체크 — 아침·점심·저녁은 설정값, 취침전은 직접 지정한 시간 */}
            <View style={styles.mealRow}>
              {mealSlotOptions.map((slot) => {
                const selected = (item.mealSlots ?? []).includes(slot);
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.mealBtn, selected && styles.mealBtnActive, isSkipped && { opacity: 0.4 }]}
                    onPress={() => !isSkipped && onToggleMealSlot(idx, slot)}
                  >
                    {slot === 'bedtime' && selected && !isSkipped && (
                      <TouchableOpacity
                        style={styles.mealBtnRemove}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => onRemoveMealSlot(idx, slot)}
                      >
                        <Ionicons name="close-circle" size={16} color="#9ca3af" />
                      </TouchableOpacity>
                    )}
                    <Text style={[styles.mealTxt, selected && styles.mealTxtActive]}>
                      {MEAL_SLOT_LABELS[slot]}
                    </Text>
                    <Text style={[styles.mealTime, selected && styles.mealTimeActive]}>
                      {slot === 'bedtime' && !item.bedtimeTime ? '시간 선택' : slotTimeLabel(item, slot)}
                    </Text>
                    {slot === 'bedtime' && selected && (
                      <Text style={styles.mealEditHint}>탭해서 재설정</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* 식전/식후 30분 — 선택하면 위 체크된 시점들의 시간에 반영됨 */}
            <View style={styles.row}>
              {(['before', 'after', 'none'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.segBtn, item.withFood === opt && styles.segBtnActive]}
                  onPress={() => !isSkipped && onSetWithFood(idx, opt)}
                >
                  <Text style={[styles.segBtnText, item.withFood === opt && styles.segBtnTextActive]}>
                    {WITH_FOOD_LABELS[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* 시간 드럼롤 선택기 — 시점 체크와 무관하게 시간을 직접 추가/삭제 */}
            {!isSkipped && (
              <TimePickerList
                times={item.suggestedTimes}
                onAdd={(t) => onAddManualTime(idx, t)}
                onRemove={(t) => onRemoveTime(idx, t)}
              />
            )}

            {/* 복용 기간 */}
            <FieldLabel label="복용 기간 (일)" />
            <TextInput
              style={styles.input}
              value={item.durationDays != null ? String(item.durationDays) : ''}
              onChangeText={(v) => onDurationChange(idx, v ? Number(v) : undefined)}
              keyboardType="numeric"
              placeholder="예: 5 (비워두면 상시)"
              editable={!isSkipped}
            />

            {/* 시작일 / 종료일 */}
            <FieldLabel label="시작일" />
            <DatePickerField
              value={startDate}
              onChange={(v) => {
                onStartDateChange(idx, v);
                if (endDate && endDate < v) {
                  onEndDateChange(idx, item.durationDays ? addDays(v, item.durationDays - 1) : v);
                }
              }}
              placeholder="시작일 선택"
              disabled={isSkipped}
            />

            <FieldLabel label="종료일" />
            <DatePickerField
              value={endDate}
              onChange={(v) => onEndDateChange(idx, v)}
              placeholder="종료일 선택 (비워두면 상시)"
              minimumDate={startDate ? new Date(startDate + 'T00:00:00') : undefined}
              disabled={isSkipped}
            />

            {/* 메모 */}
            {item.note ? (
              <>
                <FieldLabel label="특이사항" />
                <Text style={styles.noteText}>{item.note}</Text>
              </>
            ) : null}
          </>
        )}
      </View>

      {/* 건너뛰기 토글 */}
      <TouchableOpacity style={styles.skipBtn} onPress={() => onToggleSkip(idx)}>
        <Text style={[styles.skipBtnText, isSkipped && { color: '#3b82f6' }]}>
          {isSkipped ? '이 약 포함하기' : '이 약 건너뛰기'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────────────────

export default function ScanResultScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const settings = useSettingsStore.getState().settings;
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<MedicationScanResult[]>(params.results);
  const [tabIndex, setTabIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  // 포 목록 — 완전히 같은 시간 조합을 가진 약(2개 이상)은 시작할 때 기본 포로 자동 생성해두고,
  // 사용자가 시간·멤버를 자유롭게 편집하거나 "+ 새 포 만들기"로 더 추가할 수 있다.
  const [packs, setPacks] = useState<Pack[]>(() => {
    const groups = new Map<string, number[]>();
    params.results.forEach((item, i) => {
      if (item.suggestedTimes.length === 0) return;
      const key = timeKeyOf(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    return [...groups.entries()]
      .filter(([, idxs]) => idxs.length >= 2)
      .map(([key, idxs]) => {
        const times = key.split(',');
        return {
          id: generateId(),
          name: suggestPackName(times, idxs, params.results, settings),
          times,
          memberIdxs: idxs,
        };
      });
  });
  const [saving, setSaving] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<
    { packId: string; idx: number; fromName: string; toName: string; medName: string } | null
  >(null);

  // 요약 카드(원터치 확인) ↔ 상세 편집 폼 토글. 약 이름이 비어 있으면
  // 바로 고쳐야 하니 처음부터 펼쳐서 보여준다.
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(params.results.flatMap((item, i) => (item.medicationName?.trim() ? [] : [i]))),
  );

  function toggleExpanded(idx: number) {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
      return s;
    });
  }

  // 탭 목록이 화면 너비를 넘어갈 때 "더 있음" 힌트 표시 여부
  const [tabsScrollable, setTabsScrollable] = useState(false);
  const [tabsAtEnd, setTabsAtEnd] = useState(false);
  const tabContentWidthRef = useRef(0);
  const tabContainerWidthRef = useRef(0);

  function updateTabsScrollable() {
    setTabsScrollable(tabContentWidthRef.current > tabContainerWidthRef.current + 1);
  }

  function handleTabsScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 4;
    setTabsAtEnd(atEnd);
  }

  // 약 슬라이드(좌우 스와이프) — 탭 탭과 스와이프가 서로 동기화된다.
  const pagerRef = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(0);

  function goToIndex(i: number, animated = true) {
    setTabIndex(i);
    if (pageWidth) pagerRef.current?.scrollTo({ x: i * pageWidth, y: 0, animated });
  }

  function handlePagerLayout(e: LayoutChangeEvent) {
    setPageWidth(e.nativeEvent.layout.width);
  }

  function handlePagerMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!pageWidth) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setTabIndex(Math.max(0, Math.min(items.length - 1, idx)));
  }

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

  function updateStartDate(idx: number, v: string) {
    setStartDates((prev) => { const n = [...prev]; n[idx] = v; return n; });
  }
  function updateEndDate(idx: number, v: string) {
    setEndDates((prev) => { const n = [...prev]; n[idx] = v; return n; });
  }

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

  // 포 시간 선택지 — 건너뛰지 않은 약들이 가진 시간을 모두 모은 목록
  const allTimes = useMemo(() => {
    const s = new Set<string>();
    items.forEach((item, i) => {
      if (skipped.has(i)) return;
      item.suggestedTimes.forEach((t) => s.add(t));
    });
    return [...s].sort();
  }, [items, skipped]);

  function labelForTime(t: string): string {
    const found = mealTimeLabels.find((m) => m.time === t);
    return found ? `${found.label} ${t}` : t;
  }

  /** 특정 포의 후보(체크 가능) 약 — 포가 선택한 시간을 전부 가지고 있는 약.
   *  다른 포에 이미 속한 약도 후보에 포함하고(탭하면 옮길 수 있게), UI에서 "다른 포에 있음"으로 표시한다. */
  function candidateIdxsFor(pack: Pack): number[] {
    return items
      .map((_, i) => i)
      .filter((i) => !skipped.has(i))
      .filter((i) => pack.times.length > 0 && pack.times.every((t) => items[i].suggestedTimes.includes(t)));
  }

  /** 이 약이 시간이 겹치는 다른 포에 이미 속해 있다면 그 포를 반환 (없으면 undefined) */
  function claimedByOtherPack(pack: Pack, idx: number): Pack | undefined {
    return packs.find(
      (p) => p.id !== pack.id && p.memberIdxs.includes(idx) && pack.times.some((t) => p.times.includes(t)),
    );
  }

  function addPack() {
    setPacks((prev) => [...prev, { id: generateId(), name: '', times: [], memberIdxs: [] }]);
  }

  function deletePack(packId: string) {
    setPacks((prev) => prev.filter((p) => p.id !== packId));
  }

  function updatePackName(packId: string, name: string) {
    setPacks((prev) => prev.map((p) => (p.id === packId ? { ...p, name } : p)));
  }

  /** 이름을 아직 직접 입력하지 않은 포라면, 시간·식전후를 분석해 이름을 자동으로 채워준다 */
  function withAutoName(p: Pack): Pack {
    if (p.name.trim()) return p;
    if (p.times.length === 0 || p.memberIdxs.length === 0) return p;
    return { ...p, name: suggestPackName(p.times, p.memberIdxs, items, settings) };
  }

  function togglePackTime(packId: string, time: string) {
    setPacks((prev) =>
      prev.map((p) => {
        if (p.id !== packId) return p;
        const times = p.times.includes(time) ? p.times.filter((t) => t !== time) : [...p.times, time].sort();
        // 시간이 바뀌면 더 이상 그 시간을 다 갖지 못하는 멤버는 자동으로 빠진다
        const memberIdxs = p.memberIdxs.filter((i) => times.every((t) => items[i].suggestedTimes.includes(t)));
        return withAutoName({ ...p, times, memberIdxs });
      }),
    );
  }

  /** 포에 약을 체크/해제. 이미 시간이 겹치는 다른 포에 속한 약을 체크하면,
   *  그 포에서는 자동으로 빠지고 이 포로 옮겨진다(같은 시간에 두 포로 중복 등록되는 걸 방지). */
  function togglePackMember(packId: string, idx: number) {
    setPacks((prev) => {
      const target = prev.find((p) => p.id === packId);
      if (!target) return prev;
      const alreadyIn = target.memberIdxs.includes(idx);
      return prev.map((p) => {
        if (p.id === packId) {
          return withAutoName({
            ...p,
            memberIdxs: alreadyIn ? p.memberIdxs.filter((i) => i !== idx) : [...p.memberIdxs, idx],
          });
        }
        if (!alreadyIn && p.memberIdxs.includes(idx) && target.times.some((t) => p.times.includes(t))) {
          return { ...p, memberIdxs: p.memberIdxs.filter((i) => i !== idx) };
        }
        return p;
      });
    });
  }

  /** 지금 후보로 뜬 약 전체를 한 번에 이 포에 담는다(다른 포에 있던 약은 자동으로 옮겨짐) */
  function selectAllCandidates(packId: string) {
    const pack = packs.find((p) => p.id === packId);
    if (!pack) return;
    const candidateSet = new Set(candidateIdxsFor(pack));
    setPacks((prev) =>
      prev.map((p) => {
        if (p.id === packId) return withAutoName({ ...p, memberIdxs: [...candidateSet] });
        if (pack.times.some((t) => p.times.includes(t))) {
          return { ...p, memberIdxs: p.memberIdxs.filter((i) => !candidateSet.has(i)) };
        }
        return p;
      }),
    );
  }

  function deselectAllMembers(packId: string) {
    setPacks((prev) => prev.map((p) => (p.id === packId ? { ...p, memberIdxs: [] } : p)));
  }

  function updateField<K extends keyof MedicationScanResult>(
    idx: number,
    key: K,
    value: MedicationScanResult[K],
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)),
    );
  }

  // ── 복용 시점(아침/점심/저녁/취침전) 체크 + 식전/식후 30분 → suggestedTimes 재계산 ──
  // '+ 시간 추가'로 직접 넣은 시간(manualTimes)과 시점에서 계산된 시간(derived)을 합쳐서 최종 suggestedTimes를 만든다.
  const [bedtimeTargetIdx, setBedtimeTargetIdx] = useState<number | null>(null);
  const [bedtimeTemp, setBedtimeTemp] = useState<Date>(new Date());

  function updateItemDerived(idx: number, patch: Partial<MedicationScanResult>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const merged  = { ...item, ...patch };
        const offset  = WITH_FOOD_OFFSET[merged.withFood ?? 'none'];
        const derived = suggestTimesFromMeals(
          merged.mealSlots ?? [], offset, undefined, settings,
          { bedtimeOverride: merged.bedtimeTime, noFallback: true },
        );
        const suggestedTimes = [...new Set([...(merged.manualTimes ?? []), ...derived])].sort();
        return { ...merged, suggestedTimes };
      }),
    );
  }

  /** 특정 약·시점에 지금 적용될 시간(식전/식후 30분 오프셋 반영) — 미리보기 및 시간 역추적용 */
  function slotTimeLabel(item: MedicationScanResult, slot: MealSlot): string {
    const offset = WITH_FOOD_OFFSET[item.withFood ?? 'none'];
    return addMinutes(timeForMealSlot(slot, settings, item.bedtimeTime), offset);
  }

  function toggleMealSlot(idx: number, slot: MealSlot) {
    const item = items[idx];
    // 취침전은 탭할 때마다 시간 피커를 띄운다 — 처음 선택이든, 이미 선택된 시간을 재설정하는 것이든 동일하게 처리
    if (slot === 'bedtime') {
      setBedtimeTemp(item.bedtimeTime ? hhmmToDate(item.bedtimeTime) : new Date());
      setBedtimeTargetIdx(idx);
      return;
    }
    const has = (item.mealSlots ?? []).includes(slot);
    const mealSlots = has
      ? (item.mealSlots ?? []).filter((s) => s !== slot)
      : [...(item.mealSlots ?? []), slot];
    updateItemDerived(idx, { mealSlots });
  }

  /** 취침전 체크 해제 — 시간 재설정과 구분되는 별도 동작(작은 ✕로 노출) */
  function removeMealSlot(idx: number, slot: MealSlot) {
    const item = items[idx];
    updateItemDerived(idx, { mealSlots: (item.mealSlots ?? []).filter((s) => s !== slot) });
  }

  function confirmBedtimeTime(time: string) {
    if (bedtimeTargetIdx == null) return;
    const item = items[bedtimeTargetIdx];
    const mealSlots = [...(item.mealSlots ?? []).filter((s) => s !== 'bedtime'), 'bedtime' as MealSlot];
    updateItemDerived(bedtimeTargetIdx, { mealSlots, bedtimeTime: time });
    setBedtimeTargetIdx(null);
  }

  function setWithFood(idx: number, opt: 'before' | 'after' | 'none') {
    updateItemDerived(idx, { withFood: opt });
  }

  function addManualTime(idx: number, time: string) {
    const item = items[idx];
    if (item.suggestedTimes.includes(time)) return;
    updateItemDerived(idx, { manualTimes: [...(item.manualTimes ?? []), time] });
  }

  /** 시간 칩 삭제 — 시점에서 파생된 시간이면 그 시점 체크를 해제하고, 직접 추가한 시간이면 그냥 제거한다 */
  function removeTime(idx: number, time: string) {
    const item = items[idx];
    const matchedSlot = (item.mealSlots ?? []).find((s) => slotTimeLabel(item, s) === time);
    if (matchedSlot) {
      updateItemDerived(idx, { mealSlots: (item.mealSlots ?? []).filter((s) => s !== matchedSlot) });
    } else {
      updateItemDerived(idx, { manualTimes: (item.manualTimes ?? []).filter((x) => x !== time) });
    }
  }

  function toggleSkip(idx: number) {
    setSkipped((prev) => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
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

    // 2개 이상 멤버를 가진 포만 유효 — 그 외엔 개별 일정으로 취급
    const validPacks = packs.filter(
      (p) => p.times.length > 0 && p.memberIdxs.filter((i) => !skipped.has(i)).length >= 2,
    );

    setSaving(true);
    try {
      for (const [origIdx, item] of items.entries()) {
        if (skipped.has(origIdx) || !item.medicationName.trim()) continue;

        const sd = startDates[origIdx] || today;
        const ed = endDates[origIdx] || undefined;

        const medicationId = generateId();
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

        const med = { id: medicationId, name: item.medicationName.trim(), isActive: true, createdAt: now, updatedAt: now };

        async function createOneSchedule(times: string[], packetId?: string, packetName?: string) {
          const schedule = {
            id:           generateId(),
            medicationId,
            scheduleType: 'fixed' as const,
            startDate:    sd,
            endDate:      ed,
            times,
            withFood:     item.withFood ?? ('none' as const),
            graceMinutes: 120,
            isActive:     true,
            packetId,
            packetName,
            createdAt:    now,
            updatedAt:    now,
          };
          await upsertSchedule(schedule, userId);
          if (s) await scheduleForSchedule(schedule, med, s);
        }

        // 이 약이 속한 유효한 포들 — 같은 약이 여러 포(예: 아침·저녁 포 + 점심 포)에 겹쳐 속할 수 있다.
        const memberPacks = validPacks.filter((p) => p.memberIdxs.includes(origIdx));
        const claimedTimes = new Set(memberPacks.flatMap((p) => p.times));
        const leftoverTimes = item.suggestedTimes.filter((t) => !claimedTimes.has(t));

        for (const pack of memberPacks) {
          await createOneSchedule(pack.times, pack.id, pack.name.trim() || undefined);
        }

        if (memberPacks.length === 0) {
          // 어떤 포에도 속하지 않음 — 원래 시간 그대로 개별 일정
          await createOneSchedule(item.suggestedTimes.length > 0 ? item.suggestedTimes : ['08:00']);
        } else if (leftoverTimes.length > 0) {
          // 포에 포함되지 않은 나머지 시간 — 개별 일정으로 별도 등록
          await createOneSchedule(leftoverTimes);
        }
      }

      savedRef.current = true;
      setCreatedCount(toCreate.length);
    } catch {
      Alert.alert('오류', '일정 등록 중 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0) return null;

  const mealSlotOptions: MealSlot[] = ['morning', 'lunch', 'dinner', 'bedtime'];

  const mealTimeLabels = settings
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
      {/* 탭 — 글자 잘림 없게 minWidth 기반. 탭을 누르면 아래 슬라이드도 함께 이동한다 */}
      {items.length > 1 && (
        <View style={styles.tabWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabScroll}
            contentContainerStyle={styles.tabContent}
            onLayout={(e) => {
              tabContainerWidthRef.current = e.nativeEvent.layout.width;
              updateTabsScrollable();
            }}
            onContentSizeChange={(w) => {
              tabContentWidthRef.current = w;
              updateTabsScrollable();
            }}
            onScroll={handleTabsScroll}
            scrollEventThrottle={32}
          >
            {items.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.tab,
                  tabIndex === i && styles.tabActive,
                  skipped.has(i) && styles.tabSkipped,
                ]}
                onPress={() => goToIndex(i)}
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

          {/* 스크롤 가능함을 알리는 우측 힌트 — 끝까지 스크롤하면 사라짐 */}
          {tabsScrollable && !tabsAtEnd && (
            <View style={styles.tabScrollHint} pointerEvents="none">
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </View>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={items.length > 1}
          onLayout={handlePagerLayout}
          onMomentumScrollEnd={handlePagerMomentumEnd}
        >
          {items.map((item, i) => (
            <MedicationCard
              key={i}
              idx={i}
              item={item}
              isSkipped={skipped.has(i)}
              isExpanded={expanded.has(i)}
              startDate={startDates[i] ?? today}
              endDate={endDates[i] ?? ''}
              mealSlotOptions={mealSlotOptions}
              width={pageWidth}
              onUpdateField={updateField}
              onToggleSkip={toggleSkip}
              onToggleExpanded={toggleExpanded}
              onDurationChange={handleDurationChange}
              onStartDateChange={updateStartDate}
              onEndDateChange={updateEndDate}
              onToggleMealSlot={toggleMealSlot}
              onRemoveMealSlot={removeMealSlot}
              onSetWithFood={setWithFood}
              onAddManualTime={addManualTime}
              onRemoveTime={removeTime}
              slotTimeLabel={slotTimeLabel}
            />
          ))}
        </ScrollView>
        {items.length > 1 && (
          <View style={styles.pageDots}>
            {items.map((_, i) => (
              <View key={i} style={[styles.pageDot, i === tabIndex && styles.pageDotActive]} />
            ))}
          </View>
        )}

        {/* 포 만들기 — 시간(들)과 멤버 약을 직접 골라 여러 포를 만들 수 있다.
            같은 약이 시간대가 다른 여러 포에 겹쳐 들어갈 수 있음(예: 약1이 아침저녁 포 + 점심 포) */}
        {items.length >= 2 && (
          <View style={styles.packetSection}>
            <View style={styles.packetTitleRow}>
              <Text style={styles.packetTitle}>💊 포 만들기</Text>
              <Text style={styles.packetHint}>
                같은 시간에 함께 먹는 약끼리 포로 묶으면 홈에서 한 번에 체크돼요 · 같은 약도 시간대별로 여러 포에 나눠 넣을 수 있어요 · 다른 포에 있는 약도 탭하면 이 포로 옮겨져요
              </Text>
            </View>

            {packs.map((pack) => {
              const candidates = candidateIdxsFor(pack);
              const memberCount = pack.memberIdxs.length;

              return (
                <View key={pack.id} style={styles.subPacketCard}>
                  <View style={styles.subPacketHeader}>
                    <TextInput
                      style={styles.subPacketNameInput}
                      value={pack.name}
                      onChangeText={(v) => updatePackName(pack.id, v)}
                      placeholder="포 이름 (예: 아침저녁 포)"
                      maxLength={20}
                    />
                    <TouchableOpacity onPress={() => deletePack(pack.id)}>
                      <Text style={styles.deletePackText}>삭제</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.packTimeLabel}>복용 시간</Text>
                  <View style={styles.packTimeRow}>
                    {allTimes.map((t) => {
                      const selected = pack.times.includes(t);
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[styles.timeChip, selected && styles.timeChipActive]}
                          onPress={() => togglePackTime(pack.id, t)}
                        >
                          <Text style={[styles.timeChipText, selected && styles.timeChipTextActive]}>
                            {labelForTime(t)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {pack.times.length > 0 && candidates.length > 0 && (
                    <View style={styles.selectAllRow}>
                      <TouchableOpacity
                        style={styles.selectAllBtn}
                        onPress={() => selectAllCandidates(pack.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={styles.selectAllText}>전체 선택</Text>
                      </TouchableOpacity>
                      {memberCount > 0 && (
                        <TouchableOpacity
                          style={styles.selectAllBtn}
                          onPress={() => deselectAllMembers(pack.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.selectAllText}>전체 해제</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {pack.times.length === 0 ? (
                    <Text style={styles.packetWarning}>시간을 먼저 선택하면 넣을 수 있는 약이 나와요</Text>
                  ) : candidates.length === 0 ? (
                    <Text style={styles.packetWarning}>선택한 시간을 모두 가진 약이 없어요</Text>
                  ) : (
                    candidates.map((i) => {
                      const checked    = pack.memberIdxs.includes(i);
                      const otherPack  = !checked ? claimedByOtherPack(pack, i) : undefined;
                      return (
                        <TouchableOpacity
                          key={i}
                          style={styles.packetRow}
                          onPress={() => {
                            if (otherPack) {
                              setMoveConfirm({
                                packId: pack.id,
                                idx: i,
                                fromName: otherPack.name.trim() || '다른 포',
                                toName: pack.name.trim() || '이 포',
                                medName: items[i]?.medicationName || `약 ${i + 1}`,
                              });
                            } else {
                              togglePackMember(pack.id, i);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                            {checked && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={styles.packetItemName} numberOfLines={1}>
                            {items[i]?.medicationName || `약 ${i + 1}`}
                          </Text>
                          {otherPack && (
                            <View style={styles.packetClaimedBadge}>
                              <Ionicons name="swap-horizontal" size={12} color="#6b7280" />
                              <Text style={styles.packetClaimedTag} numberOfLines={1}>
                                {otherPack.name.trim() || '다른 포'}에 있음
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}

                  {pack.times.length > 0 && candidates.length > 0 && memberCount < 2 && (
                    <Text style={styles.packetWarning}>
                      2개 이상 선택해야 포로 묶여요 · 지금은 개별 일정으로 등록돼요
                    </Text>
                  )}
                </View>
              );
            })}

            <TouchableOpacity style={styles.addPackBtn} onPress={addPack}>
              <Text style={styles.addPackBtnText}>＋ 새 포 만들기</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={[styles.footer, { paddingBottom: 24 + insets.bottom }]}>
        <Text style={styles.footerHint}>
          약 {items.length - skipped.size}개 각각 복용 일정을 등록해요 (복용 횟수와는 다른 수예요)
        </Text>
        <TouchableOpacity
          style={[styles.createBtn, saving && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={saving}
        >
          <Text style={styles.createBtnText}>
            {saving ? '저장 중...' : `약 ${items.length - skipped.size}개 일정 만들기`}
          </Text>
        </TouchableOpacity>
      </View>

      <AlertModal
        visible={createdCount !== null}
        icon="🎉"
        title="일정 등록 완료"
        message={`${createdCount ?? 0}개 약 일정이 등록되었습니다.`}
        buttons={[{ text: '확인', onPress: () => { setCreatedCount(null); navigation.popToTop(); } }]}
      />

      <AlertModal
        visible={moveConfirm !== null}
        icon="🔀"
        title="포 옮기기"
        message={moveConfirm ? `'${moveConfirm.medName}'을(를) '${moveConfirm.fromName}'에서 '${moveConfirm.toName}'(으)로 옮길까요?` : undefined}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setMoveConfirm(null) },
          {
            text: '옮기기',
            onPress: () => {
              if (moveConfirm) togglePackMember(moveConfirm.packId, moveConfirm.idx);
              setMoveConfirm(null);
            },
          },
        ]}
      />

      {/* 취침전 시간 지정 피커 */}

      {bedtimeTargetIdx !== null && (
        Platform.OS === 'ios' ? (
          <Modal visible transparent animationType="slide" onRequestClose={() => setBedtimeTargetIdx(null)}>
            <View style={dpStyles.overlay}>
              <View style={[dpStyles.sheet, { paddingBottom: 36 + insets.bottom }]}>
                <View style={dpStyles.toolbar}>
                  <TouchableOpacity onPress={() => setBedtimeTargetIdx(null)}>
                    <Text style={dpStyles.cancelTxt}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmBedtimeTime(toHHmm(bedtimeTemp))}>
                    <Text style={dpStyles.confirmTxt}>확인</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={bedtimeTemp}
                  mode="time"
                  display="spinner"
                  locale="ko-KR"
                  onChange={(_, selected) => { if (selected) setBedtimeTemp(selected); }}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={bedtimeTemp}
            mode="time"
            display="default"
            onChange={(_, selected) => {
              if (selected) confirmBedtimeTime(toHHmm(selected));
              else setBedtimeTargetIdx(null);
            }}
          />
        )
      )}
    </SafeAreaView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },

  tabWrap:        { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tabScroll:      { maxHeight: 52 },
  tabContent:     { paddingHorizontal: 12, paddingVertical: 8, paddingRight: 28, gap: 8 },
  tabScrollHint: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 28,
    alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4,
    backgroundColor: '#fff',
  },
  tab:            { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', minWidth: 60 },
  tabActive:      { backgroundColor: '#3b82f6' },
  tabSkipped:     { backgroundColor: '#e5e7eb', opacity: 0.6 },
  tabText:        { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive:  { color: '#fff', fontWeight: '600' },

  content:      { padding: 20, paddingBottom: 120 },
  pageFallback: { width: '100%' },

  pageDots:       { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  pageDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#d1d5db' },
  pageDotActive:  { backgroundColor: '#3b82f6', width: 16 },

  fieldGroup: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 4 },
  dimmed:     { opacity: 0.4 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 12, marginBottom: 4 },

  summaryCard:     { paddingVertical: 4 },
  summaryTopRow:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  summaryName:     { flex: 1, fontSize: 20, fontWeight: '700', color: '#111827', marginRight: 8 },
  summaryEditBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
  },
  summaryEditText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },
  summaryLine:     { fontSize: 16, color: '#374151', marginBottom: 6, lineHeight: 22 },
  summaryNote:     { fontSize: 13, color: '#9ca3af', marginTop: 2, marginBottom: 6, lineHeight: 18 },
  summaryHint:     { fontSize: 12, color: '#9ca3af', marginTop: 6 },

  collapseLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-end', paddingVertical: 6, marginBottom: 4,
  },
  collapseLinkText: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },

  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  row: { flexDirection: 'row', alignItems: 'center' },

  unitRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  unitBtn: {
    flex: 1, minHeight: 44, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1,
    borderColor: '#e5e7eb', backgroundColor: '#f9fafb',
    alignItems: 'center', justifyContent: 'center',
  },
  unitBtnActive:     { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  unitBtnText:       { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  unitBtnTextActive: { color: '#fff' },

  // 식사 시간 단축 버튼 (일정추가 화면과 동일)
  mealRow:       { flexDirection: 'row', gap: 8, marginBottom: 10, marginTop: 4 },
  mealBtn:       { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, alignItems: 'center', gap: 2, position: 'relative' },
  mealBtnActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  mealBtnRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 8 },
  mealTxt:       { fontSize: 13, fontWeight: '600', color: '#374151' },
  mealTxtActive: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
  mealTime:      { fontSize: 11, color: '#9ca3af' },
  mealTimeActive:{ fontSize: 11, color: '#3b82f6' },
  mealEditHint:  { fontSize: 9, color: '#93c5fd' },

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
  packetClaimedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 130 },
  packetClaimedTag:{ fontSize: 11, color: '#9ca3af' },
  packetWarning:   { fontSize: 12, color: '#f59e0b', marginTop: 8, textAlign: 'center' },

  subPacketCard: {
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e0eaff',
  },
  subPacketHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  subPacketNameInput: {
    flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827',
    backgroundColor: '#fff',
  },
  deletePackText: { fontSize: 13, fontWeight: '600', color: '#ef4444', paddingHorizontal: 4 },

  packTimeLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  packTimeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  selectAllRow:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6, marginBottom: 2 },
  selectAllBtn: {
    minHeight: 44, minWidth: 44, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  selectAllText: { fontSize: 14, fontWeight: '700', color: '#3b82f6' },
  timeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  timeChipActive:     { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  timeChipText:       { fontSize: 13, fontWeight: '600', color: '#374151' },
  timeChipTextActive: { color: '#3b82f6' },

  addPackBtn: {
    marginTop: 14, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#3b82f6', borderStyle: 'dashed', alignItems: 'center',
  },
  addPackBtnText: { fontSize: 14, fontWeight: '700', color: '#3b82f6' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 24, gap: 8,
  },
  footerHint:    { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  createBtn:     { backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
