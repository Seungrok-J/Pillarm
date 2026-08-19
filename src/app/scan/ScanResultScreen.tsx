import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
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

interface SubPacket {
  id:         string;
  name:       string;
  memberIdxs: number[];
}

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

// ── MedicationCard — 슬라이드 페이지 1장(= 약 1개) ─────────────────────────────

interface MedicationCardProps {
  idx:         number;
  item:        MedicationScanResult;
  isSkipped:   boolean;
  isExpanded:  boolean;
  startDate:   string;
  endDate:     string;
  mealTimes:   { label: string; time: string }[];
  width:       number;
  onUpdateField: <K extends keyof MedicationScanResult>(idx: number, key: K, value: MedicationScanResult[K]) => void;
  onToggleSkip:      (idx: number) => void;
  onToggleExpanded:  (idx: number) => void;
  onDurationChange:  (idx: number, days: number | undefined) => void;
  onStartDateChange: (idx: number, v: string) => void;
  onEndDateChange:   (idx: number, v: string) => void;
}

function MedicationCard({
  idx, item, isSkipped, isExpanded, startDate, endDate, mealTimes, width,
  onUpdateField, onToggleSkip, onToggleExpanded, onDurationChange,
  onStartDateChange, onEndDateChange,
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
            {/* 식사 시간 단축 선택 */}
            <View style={styles.mealRow}>
              {mealTimes.map(({ label, time }) => {
                const selected = item.suggestedTimes.includes(time);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.mealBtn, selected && styles.mealBtnActive, isSkipped && { opacity: 0.4 }]}
                    onPress={() => {
                      if (isSkipped) return;
                      const times = item.suggestedTimes;
                      const next  = selected
                        ? times.filter((t) => t !== time)
                        : [...times, time].sort();
                      onUpdateField(idx, 'suggestedTimes', next);
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
                times={item.suggestedTimes}
                onAdd={(t) => {
                  const times = item.suggestedTimes;
                  if (!times.includes(t)) {
                    onUpdateField(idx, 'suggestedTimes', [...times, t].sort());
                  }
                }}
                onRemove={(t) => {
                  onUpdateField(idx, 'suggestedTimes', item.suggestedTimes.filter((x) => x !== t));
                }}
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

            {/* 식전/식후 */}
            <FieldLabel label="식전/식후" />
            <View style={styles.row}>
              {(['before', 'after', 'none'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.segBtn, item.withFood === opt && styles.segBtnActive]}
                  onPress={() => !isSkipped && onUpdateField(idx, 'withFood', opt)}
                >
                  <Text style={[styles.segBtnText, item.withFood === opt && styles.segBtnTextActive]}>
                    {WITH_FOOD_LABELS[opt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

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

  const [items, setItems] = useState<MedicationScanResult[]>(params.results);
  const [tabIndex, setTabIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  // 포 그룹화: 같은 복용 시간을 가진 약끼리 사용자가 직접 만들고 지울 수 있다.
  const [subPackets, setSubPackets] = useState<Record<string, SubPacket[]>>({});
  const [pendingSelection, setPendingSelection] = useState<Record<string, Set<number>>>({});
  const [saving, setSaving] = useState(false);

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

  function togglePending(key: string, idx: number) {
    setPendingSelection((prev) => {
      const cur = new Set(prev[key] ?? []);
      cur.has(idx) ? cur.delete(idx) : cur.add(idx);
      return { ...prev, [key]: cur };
    });
  }

  function createSubPacket(key: string) {
    const pending = pendingSelection[key];
    if (!pending || pending.size < 2) return;
    const memberIdxs = [...pending].sort((a, b) => a - b);
    setSubPackets((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { id: generateId(), name: '', memberIdxs }],
    }));
    setPendingSelection((prev) => ({ ...prev, [key]: new Set() }));
  }

  function deleteSubPacket(key: string, packetId: string) {
    setSubPackets((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((p) => p.id !== packetId),
    }));
  }

  function updateSubPacketName(key: string, packetId: string, name: string) {
    setSubPackets((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((p) => (p.id === packetId ? { ...p, name } : p)),
    }));
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

    // 사용자가 직접 만든 포(subPacket) 기준으로 packetId·이름을 부여한다.
    const packetInfoByIndex = new Map<number, { id: string; name?: string }>();
    for (const groupPackets of Object.values(subPackets)) {
      for (const p of groupPackets) {
        if (p.memberIdxs.length < 2) continue;
        const name = p.name.trim() || undefined;
        for (const i of p.memberIdxs) {
          if (skipped.has(i)) continue;
          packetInfoByIndex.set(i, { id: p.id, name });
        }
      }
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

  if (items.length === 0) return null;

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
              mealTimes={mealTimes}
              width={pageWidth}
              onUpdateField={updateField}
              onToggleSkip={toggleSkip}
              onToggleExpanded={toggleExpanded}
              onDurationChange={handleDurationChange}
              onStartDateChange={updateStartDate}
              onEndDateChange={updateEndDate}
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

        {/* 포 그룹화 — 같은 복용 시간을 가진 약끼리 직접 포를 만들고 지울 수 있다 */}
        {timeGroups.length > 0 ? (
          timeGroups.map(([key, idxs]) => {
            const groupPackets = subPackets[key] ?? [];
            const assignedIdxs = new Set(groupPackets.flatMap((p) => p.memberIdxs));
            const availableIdxs = idxs.filter((i) => !assignedIdxs.has(i));
            const pending = pendingSelection[key] ?? new Set<number>();
            const pendingCount = availableIdxs.filter((i) => pending.has(i)).length;
            const times = key.split(',');

            return (
              <View key={key} style={styles.packetSection}>
                <View style={styles.packetTitleRow}>
                  <Text style={styles.packetTitle}>💊 {times.join('  ')} 복용 약</Text>
                  <Text style={styles.packetHint}>
                    같은 시간에 복용하는 약끼리 포로 묶을 수 있어요 · 홈에서 한 번에 복용 체크돼요
                  </Text>
                </View>

                {/* 이미 만든 포 */}
                {groupPackets.map((p) => (
                  <View key={p.id} style={styles.subPacketCard}>
                    <View style={styles.subPacketHeader}>
                      <TextInput
                        style={styles.subPacketNameInput}
                        value={p.name}
                        onChangeText={(v) => updateSubPacketName(key, p.id, v)}
                        placeholder="그룹 이름 (예: 아침약)"
                        maxLength={20}
                      />
                      <TouchableOpacity
                        style={styles.subPacketDeleteBtn}
                        onPress={() => deleteSubPacket(key, p.id)}
                      >
                        <Text style={styles.subPacketDeleteTxt}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                    {p.memberIdxs.map((i) => (
                      <View key={i} style={styles.packetRow}>
                        <View style={[styles.checkbox, styles.checkboxChecked, styles.checkboxLocked]}>
                          <Text style={styles.checkmark}>✓</Text>
                        </View>
                        <Text style={styles.packetItemName} numberOfLines={1}>
                          {items[i]?.medicationName || `약 ${i + 1}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}

                {/* 새 포 만들기 — 아직 어떤 포에도 속하지 않은 약만 선택 가능 */}
                {availableIdxs.length >= 2 ? (
                  <View style={styles.newPacketBox}>
                    <Text style={styles.newPacketLabel}>새 포 만들기</Text>
                    {availableIdxs.map((i) => {
                      const checked = pending.has(i);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={styles.packetRow}
                          onPress={() => togglePending(key, i)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                            {checked && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={styles.packetItemName} numberOfLines={1}>
                            {items[i]?.medicationName || `약 ${i + 1}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.makePacketBtn, pendingCount < 2 && styles.makePacketBtnDisabled]}
                      disabled={pendingCount < 2}
                      onPress={() => createSubPacket(key)}
                    >
                      <Text style={styles.makePacketBtnText}>
                        {pendingCount >= 2 ? `선택한 ${pendingCount}개 약으로 포 만들기` : '2개 이상 선택하면 포를 만들 수 있어요'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : availableIdxs.length === 1 ? (
                  <Text style={styles.packetWarning}>
                    남은 약이 1개뿐이라 포로 묶을 수 없어요
                  </Text>
                ) : null}
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
  checkboxLocked:  { opacity: 0.6 },
  checkmark:       { fontSize: 13, color: '#fff', fontWeight: '800' },
  packetItemName:  { flex: 1, fontSize: 14, fontWeight: '500', color: '#374151' },
  packetWarning:   { fontSize: 12, color: '#f59e0b', marginTop: 8, textAlign: 'center' },

  subPacketCard: {
    marginTop: 12, backgroundColor: '#f8faff', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: '#dbeafe',
  },
  subPacketHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subPacketNameInput: {
    flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827',
    backgroundColor: '#fff',
  },
  subPacketDeleteBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#ef4444',
  },
  subPacketDeleteTxt: { fontSize: 13, color: '#ef4444', fontWeight: '600' },

  newPacketBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e0eaff' },
  newPacketLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 4 },
  makePacketBtn: {
    marginTop: 12, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#3b82f6', alignItems: 'center',
  },
  makePacketBtnDisabled: { backgroundColor: '#d1d5db' },
  makePacketBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 24, gap: 8,
  },
  footerHint:    { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  createBtn:     { backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
