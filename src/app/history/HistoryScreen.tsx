import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Image, ScrollView, PanResponder, Animated, Dimensions, RefreshControl } from 'react-native';
import { AppText as Text } from '../../components/AppText';

const SW = Dimensions.get('window').width;
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect } from '@react-navigation/native';
import { useDoseEventStore, useMedicationStore, useSettingsStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { getDotColor } from '../../components/DayDot';
import { todayString } from '../../utils';
import {
  computeDisplayState,
  DOSE_DISPLAY_LABEL,
  DOSE_DISPLAY_COLOR,
  type DoseDisplayState,
} from '../../utils/doseDisplay';
import { useFontScale, scaledFont } from '../../utils/fontScale';
import type { DoseEvent } from '../../domain';

// ── 상수 ─────────────────────────────────────────────────────────────────────

// DoseStatus → DOSE_DISPLAY_LABEL/COLOR 를 통해 처리하므로 별도 상수 불필요

/** 'HH:mm' 한 줄이 들어가는 기준 폭(배율 1.0) */
const TIME_COL_WIDTH = 44;

const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

/** UTC ISO 문자열을 로컬 시각 HH:mm으로 변환 */
function fmtLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function monthRange(yyyyMm: string): { start: string; end: string } {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = `${yyyyMm}-01T00:00:00`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00`;
  return { start, end };
}

function formatSelectedDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  });
}

// ── 년/월 선택 모달 ────────────────────────────────────────────────────────────

interface YearMonthPickerProps {
  visible:      boolean;
  currentMonth: string; // YYYY-MM
  onSelect:     (yyyyMm: string) => void;
  onClose:      () => void;
}

function YearMonthPicker({ visible, currentMonth, onSelect, onClose }: YearMonthPickerProps) {
  const [pickerYear, setPickerYear] = useState(() => parseInt(currentMonth.slice(0, 4)));

  useEffect(() => {
    if (visible) setPickerYear(parseInt(currentMonth.slice(0, 4)));
  }, [visible, currentMonth]);

  const minYear = 2020;
  const maxYear = new Date().getFullYear() + 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={ps.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={ps.sheet}>
          {/* 년도 네비게이션 */}
          <View style={ps.yearRow}>
            <TouchableOpacity
              style={ps.yearArrowBtn}
              onPress={() => setPickerYear(y => y - 1)}
              disabled={pickerYear <= minYear}
            >
              <Text style={[ps.yearArrow, pickerYear <= minYear && ps.disabled]}>‹</Text>
            </TouchableOpacity>
            <Text style={ps.yearLabel}>{pickerYear}년</Text>
            <TouchableOpacity
              style={ps.yearArrowBtn}
              onPress={() => setPickerYear(y => y + 1)}
              disabled={pickerYear >= maxYear}
            >
              <Text style={[ps.yearArrow, pickerYear >= maxYear && ps.disabled]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* 월 그리드 — 모든 월 선택 가능 */}
          <View style={ps.monthGrid}>
            {MONTHS_KO.map((label, i) => {
              const ym = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
              const isSelected = ym === currentMonth;
              return (
                <TouchableOpacity
                  key={i}
                  style={[ps.cell, isSelected && ps.cellSelected]}
                  onPress={() => { onSelect(ym); onClose(); }}
                >
                  <Text style={[ps.cellTxt, isSelected && ps.cellTxtSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={ps.cancelBtn} onPress={onClose}>
            <Text style={ps.cancelTxt}>취소</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const ps = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  sheet:      { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '82%' },
  yearRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  yearArrowBtn: { padding: 8 },
  yearArrow:  { fontSize: 24, color: '#374151', fontWeight: '600' },
  yearLabel:  { fontSize: 18, fontWeight: '700', color: '#111827' },
  disabled:   { color: '#d1d5db' },
  monthGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell:       { width: '22%', paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cellSelected: { backgroundColor: '#3b82f6' },
  cellDisabled: { opacity: 0.35 },
  cellTxt:    { fontSize: 14, fontWeight: '500', color: '#374151' },
  cellTxtSelected: { color: '#fff', fontWeight: '700' },
  cellTxtDisabled: { color: '#9ca3af' },
  cancelBtn:  { marginTop: 20, alignItems: 'center', paddingVertical: 12, backgroundColor: '#f3f4f6', borderRadius: 12 },
  cancelTxt:  { fontSize: 15, color: '#6b7280', fontWeight: '600' },
});

// ── 목록 아이템 ────────────────────────────────────────────────────────────────

type HistoryItem =
  | { kind: 'single'; key: string; event: DoseEvent }
  | { kind: 'packet'; key: string; events: DoseEvent[] };

/** 포에 든 이벤트들을 하나의 표시 상태로 합친다 — 개별 약이 아니라 포 단위로 읽히게 한다. */
function packetDisplayState(
  events: DoseEvent[],
  nowMs: number,
  graceMs: number,
): DoseDisplayState {
  if (events.every((e) => e.status === 'taken'))   return 'taken';
  if (events.every((e) => e.status === 'skipped')) return 'skipped';
  const allDone = events.every(
    (e) => e.status === 'taken' || e.status === 'skipped' || e.status === 'missed',
  );
  if (allDone && events.some((e) => e.status === 'missed')) return 'missed';
  return computeDisplayState(events[0], nowMs, graceMs);
}

// ── 화면 ──────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const today = todayString();

  const [selectedDate,   setSelectedDate]   = useState(today);
  const [currentMonth,   setCurrentMonth]   = useState(today.slice(0, 7));
  const [monthEvents,    setMonthEvents]    = useState<DoseEvent[]>([]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [modalEvent,     setModalEvent]     = useState<DoseEvent | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  const { userId } = useAuthStore();
  const { fetchByDateRange } = useDoseEventStore();
  const { medications, fetchMedications } = useMedicationStore();
  const graceMinutes = useSettingsStore((s) => s.settings?.missedToLateMinutes ?? 120);

  // 글씨 배율이 커지면 시간 칸도 같이 넓혀야 한다 — 고정 폭이면 'HH:mm' 이 두 줄로 쪼개진다
  const fontScale = useFontScale();
  const timeStyle = useMemo(
    () => [styles.time, { width: scaledFont(TIME_COL_WIDTH, fontScale) }],
    [fontScale],
  );

  const medicationNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(medications.map((m) => [m.id, m.name])),
    [medications],
  );

  useEffect(() => { fetchMedications(); }, [userId]);

  const loadMonth = useCallback(async (yyyyMm: string) => {
    setIsLoading(true);
    const { start, end } = monthRange(yyyyMm);
    const events = await fetchByDateRange(start, end);
    setMonthEvents(events);
    setIsLoading(false);
  }, [fetchByDateRange]);

  // 탭 포커스 시마다 재조회 (월 이동·로그인 전환 포함)
  useFocusEffect(
    useCallback(() => {
      loadMonth(currentMonth);
    }, [currentMonth, userId]),
  );

  // 로그인/로그아웃 시 오늘로 초기화
  useEffect(() => {
    const t = todayString();
    setSelectedDate(t);
    setCurrentMonth(t.slice(0, 7));
  }, [userId]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadMonth(currentMonth), fetchMedications()]);
    setRefreshing(false);
  }

  // ── 달력 markedDates ────────────────────────────────────────────────────────
  const markedDates = useMemo(() => {
    const byDate: Record<string, DoseEvent[]> = {};
    for (const e of monthEvents) {
      const d = e.plannedAt.slice(0, 10);
      (byDate[d] ??= []).push(e);
    }
    const result: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string }> = {};
    for (const [date, events] of Object.entries(byDate)) {
      const total = events.length;
      const taken = events.filter((e) => e.status === 'taken').length;
      const color = getDotColor(total, taken);
      result[date] = { marked: color != null, dotColor: color ?? undefined };
    }
    result[selectedDate] = { ...(result[selectedDate] ?? {}), selected: true, selectedColor: '#3b82f6' };
    return result;
  }, [monthEvents, selectedDate]);

  // ── 선택 날짜 이벤트 ────────────────────────────────────────────────────────
  const selectedEvents = useMemo(
    () => [...monthEvents]
      .filter((e) => e.plannedAt.slice(0, 10) === selectedDate)
      .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt)),
    [monthEvents, selectedDate],
  );

  // 포는 홈 화면과 동일하게 packetId+plannedAt 기준 한 줄로 묶는다 —
  // 약국에서 "아침 약" 한 봉지를 받듯, 안에 든 개별 약은 상세에서만 확인한다.
  const listItems = useMemo<HistoryItem[]>(() => {
    const packetMap = new Map<string, DoseEvent[]>();
    for (const e of selectedEvents) {
      if (!e.packetId) continue;
      const key = `${e.packetId}|${e.plannedAt}`;
      if (!packetMap.has(key)) packetMap.set(key, []);
      packetMap.get(key)!.push(e);
    }
    const added = new Set<string>();
    const result: HistoryItem[] = [];
    for (const e of selectedEvents) {
      if (e.packetId) {
        const key = `${e.packetId}|${e.plannedAt}`;
        if (added.has(key)) continue;
        added.add(key);
        result.push({ kind: 'packet', key, events: packetMap.get(key)! });
      } else {
        result.push({ kind: 'single', key: e.id, event: e });
      }
    }
    return result;
  }, [selectedEvents]);

  const [labelY, labelM] = currentMonth.split('-');
  const monthLabel = `${labelY}년 ${Number(labelM)}월`;

  // ── 슬라이드 애니메이션 ─────────────────────────────────────────────────────
  const slideX          = useRef(new Animated.Value(0)).current;
  const isAnimRef       = useRef(false);
  // PanResponder는 첫 렌더의 클로저를 캡처하므로 ref로 최신 값을 공유
  const currentMonthRef = useRef(currentMonth);
  currentMonthRef.current = currentMonth;

  function runSlide(dir: 'prev' | 'next') {
    if (isAnimRef.current) return;
    isAnimRef.current = true;

    const [y, m] = currentMonthRef.current.split('-').map(Number);
    const newMonth = dir === 'prev'
      ? (m === 1  ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`)
      : (m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`);

    const outTo  = dir === 'next' ? -SW : SW;
    const inFrom = dir === 'next' ?  SW : -SW;

    Animated.timing(slideX, {
      toValue: outTo,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setCurrentMonth(newMonth);
      setSelectedDate(`${newMonth}-01`);
      slideX.setValue(inFrom);
      Animated.spring(slideX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 90,
        friction: 13,
      }).start(() => { isAnimRef.current = false; });
    });
  }

  // ── 스와이프 제스처 ─────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        !isAnimRef.current &&
        Math.abs(gs.dx) > 12 &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8,
      onPanResponderMove: (_, gs) => {
        if (!isAnimRef.current) slideX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (isAnimRef.current) return;
        const overDist = Math.abs(gs.dx) > SW * 0.25;
        const overVelo = Math.abs(gs.vx) > 0.4;
        if (gs.dx < 0 && (overDist || overVelo)) {
          runSlide('next');
        } else if (gs.dx > 0 && (overDist || overVelo)) {
          runSlide('prev');
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 160, friction: 10 }).start();
        }
      },
    }),
  ).current;

  // ── 이벤트 카드 렌더 ────────────────────────────────────────────────────────
  function renderItem({ item }: { item: HistoryItem }) {
    const graceMs = graceMinutes * 60_000;

    if (item.kind === 'packet') {
      const rep = item.events[0];
      const displayState = packetDisplayState(item.events, Date.now(), graceMs);
      const takenAt = item.events.every((e) => e.status === 'taken')
        ? item.events.map((e) => e.takenAt).filter(Boolean).sort()[0]
        : undefined;
      return (
        <TouchableOpacity
          testID={`history-card-${item.key}`}
          style={styles.card}
          onPress={() => setModalEvent(rep)}
          activeOpacity={0.85}
        >
          <Text style={timeStyle} numberOfLines={1}>{fmtLocalTime(rep.plannedAt)}</Text>
          <View style={styles.cardBody}>
            <View style={styles.nameRow}>
              <View style={styles.packetBadge}>
                <Text style={styles.packetBadgeText}>포</Text>
              </View>
              <Text
                testID={`history-name-${item.key}`}
                style={[styles.name, styles.nameFlex]}
                numberOfLines={1}
              >
                {rep.packetName || `약 ${item.events.length}개 묶음`}
              </Text>
            </View>
            <Text
              testID={`history-status-${item.key}`}
              style={[styles.status, { color: DOSE_DISPLAY_COLOR[displayState] }]}
            >
              {DOSE_DISPLAY_LABEL[displayState]}
              {takenAt ? `  복용 ${fmtLocalTime(takenAt)}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    const event = item.event;
    const name = medicationNames[event.medicationId] ?? event.medicationId;
    const displayState = computeDisplayState(event, Date.now(), graceMs);

    return (
      <TouchableOpacity
        testID={`history-card-${event.id}`}
        style={styles.card}
        onPress={() => setModalEvent(event)}
        activeOpacity={0.85}
      >
        <Text testID={`history-time-${event.id}`} style={timeStyle} numberOfLines={1}>
          {fmtLocalTime(event.plannedAt)}
        </Text>
        <View style={styles.cardBody}>
          <Text testID={`history-name-${event.id}`} style={styles.name}>{name}</Text>
          <Text
            testID={`history-status-${event.id}`}
            style={[styles.status, { color: DOSE_DISPLAY_COLOR[displayState] }]}
          >
            {DOSE_DISPLAY_LABEL[displayState]}
            {event.takenAt ? `  복용 ${fmtLocalTime(event.takenAt)}` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <View style={styles.container} testID="screen-history">
      {/* 월 네비게이션 */}
      <View style={styles.monthNav}>
        <TouchableOpacity testID="btn-prev-month" onPress={() => runSlide('prev')} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMonthPicker(true)} style={styles.monthLabelBtn}>
          <Text testID="label-month" style={styles.monthLabel}>{monthLabel}</Text>
          <Text style={styles.monthLabelCaret}> ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="btn-next-month" onPress={() => runSlide('next')} style={styles.navBtn}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 달력 — 슬라이드 래퍼 */}
      <Animated.View
        style={{ transform: [{ translateX: slideX }], overflow: 'hidden' }}
        {...panResponder.panHandlers}
      >
        <Calendar
          key={currentMonth}
          current={`${currentMonth}-01`}
          markedDates={markedDates}
          onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
          onMonthChange={(month: { dateString: string }) => {
            const ym = month.dateString.slice(0, 7);
            setCurrentMonth(ym);
            setSelectedDate(`${ym}-01`);
          }}
          hideExtraDays
          hideArrows
          renderHeader={() => null}
          theme={{
            selectedDayBackgroundColor: '#3b82f6',
            todayTextColor: '#3b82f6',
            calendarBackground: '#fff',
          }}
        />
      </Animated.View>

      {/* 선택된 날짜 헤더 */}
      <View style={styles.dateHeader}>
        <Text testID="label-selected-date" style={styles.dateHeaderText}>
          {formatSelectedDate(selectedDate)}
        </Text>
      </View>

      {/* 이벤트 목록 */}
      {isLoading ? (
        <ActivityIndicator testID="loading-indicator" style={{ marginTop: 24 }} color="#3b82f6" />
      ) : (
        <FlatList<HistoryItem>
          testID="list-history"
          data={listItems}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
          }
          ListEmptyComponent={
            <Text testID="txt-no-events" style={styles.emptyText}>
              이 날짜에 복용 일정이 없습니다
            </Text>
          }
        />
      )}

      {/* 년/월 선택 모달 */}
      <YearMonthPicker
        visible={showMonthPicker}
        currentMonth={currentMonth}
        onSelect={(ym) => {
          setCurrentMonth(ym);
          setSelectedDate(`${ym}-01`);
        }}
        onClose={() => setShowMonthPicker(false)}
      />

      {/* 복용 상세 모달 */}
      <Modal
        visible={modalEvent != null}
        transparent
        animationType="fade"
        onRequestClose={() => setModalEvent(null)}
      >
        <TouchableOpacity style={styles.detailOverlay} activeOpacity={1} onPress={() => setModalEvent(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>복용 상세</Text>
              <TouchableOpacity testID="btn-close-detail" onPress={() => setModalEvent(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.detailClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {modalEvent && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {modalEvent.packetId ? (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>포 이름</Text>
                      <Text testID="detail-packet-name" style={styles.detailValue}>
                        {modalEvent.packetName || '이름 없는 포'}
                      </Text>
                    </View>
                    <View style={styles.detailNoteRow}>
                      <Text style={styles.detailLabel}>포에 든 약</Text>
                      {selectedEvents
                        .filter((e) => e.packetId === modalEvent.packetId && e.plannedAt === modalEvent.plannedAt)
                        .map((e) => (
                          <Text key={e.id} style={styles.detailMember}>
                            · {medicationNames[e.medicationId] ?? e.medicationId}
                          </Text>
                        ))}
                    </View>
                  </>
                ) : (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>약 이름</Text>
                    <Text testID="detail-med-name" style={styles.detailValue}>
                      {medicationNames[modalEvent.medicationId] ?? modalEvent.medicationId}
                    </Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>예정 시간</Text>
                  <Text testID="detail-time" style={styles.detailValue}>
                    {fmtLocalTime(modalEvent.plannedAt)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>상태</Text>
                  {(() => {
                    const graceMs = graceMinutes * 60_000;
                    const members = modalEvent.packetId
                      ? selectedEvents.filter((e) => e.packetId === modalEvent.packetId && e.plannedAt === modalEvent.plannedAt)
                      : [];
                    const ds = members.length > 0
                      ? packetDisplayState(members, Date.now(), graceMs)
                      : computeDisplayState(modalEvent, Date.now(), graceMs);
                    return (
                      <Text testID="detail-status" style={[styles.detailValue, { color: DOSE_DISPLAY_COLOR[ds] }]}>
                        {DOSE_DISPLAY_LABEL[ds]}
                      </Text>
                    );
                  })()}
                </View>
                {modalEvent.takenAt && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>복용 시간</Text>
                    <Text testID="detail-taken-at" style={styles.detailValue}>
                      {fmtLocalTime(modalEvent.takenAt)}
                    </Text>
                  </View>
                )}
                {modalEvent.note && (
                  <View style={styles.detailNoteRow}>
                    <Text style={styles.detailLabel}>메모</Text>
                    <Text testID="detail-note" style={styles.detailNote}>{modalEvent.note}</Text>
                  </View>
                )}
                {modalEvent.photoPath && (
                  <Image
                    testID="detail-photo"
                    source={{ uri: modalEvent.photoPath }}
                    style={styles.detailPhoto}
                    resizeMode="cover"
                  />
                )}
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#f9fafb' },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  navBtn:          { padding: 8 },
  navArrow:        { fontSize: 22, color: '#374151' },
  monthLabelBtn:   { flexDirection: 'row', alignItems: 'center' },
  monthLabel:      { fontSize: 17, fontWeight: '700', color: '#111827' },
  monthLabelCaret: { fontSize: 13, color: '#6b7280' },

  dateHeader: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  dateHeaderText: { fontSize: 15, fontWeight: '600', color: '#374151' },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  emptyText:   { textAlign: 'center', color: '#9ca3af', marginTop: 32, fontSize: 14 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  time:     { fontSize: 14, fontWeight: '600', color: '#374151', width: TIME_COL_WIDTH },
  cardBody: { flex: 1, marginHorizontal: 10 },
  name:     { fontSize: 14, color: '#111827' },
  status:   { fontSize: 12, marginTop: 2 },

  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameFlex:    { flexShrink: 1 },
  packetBadge: {
    width: 18, height: 18, borderRadius: 5,
    backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center',
  },
  packetBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  detailCard:    { width: '85%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  detailHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  detailTitle:   { fontSize: 17, fontWeight: '700', color: '#111827' },
  detailClose:   { fontSize: 18, color: '#9ca3af' },
  detailRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailLabel:   { fontSize: 14, color: '#6b7280' },
  detailValue:   { fontSize: 14, fontWeight: '500', color: '#111827' },
  detailNoteRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailNote:    { fontSize: 14, color: '#374151', marginTop: 6, lineHeight: 20 },
  detailMember:  { fontSize: 14, color: '#374151', marginTop: 6 },
  detailPhoto:   { width: '100%', height: 200, borderRadius: 10, marginTop: 14 },
});
