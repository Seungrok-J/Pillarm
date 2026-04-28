import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Image,
  ScrollView,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useDoseEventStore, useMedicationStore } from '../../store';
import { updateDoseEventStatus } from '../../db';
import { getDotColor } from '../../components/DayDot';
import { todayString } from '../../utils';
import type { DoseEvent, DoseStatus } from '../../domain';

// ── 상수 ─────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DoseStatus, string> = {
  scheduled: '예정',
  taken: '완료',
  late: '늦은 복용',
  missed: '누락',
  skipped: '건너뜀',
};

const STATUS_COLOR: Record<DoseStatus, string> = {
  scheduled: '#6b7280',
  taken: '#16a34a',
  late: '#f97316',
  missed: '#ef4444',
  skipped: '#9ca3af',
};

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

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
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

// ── 화면 ──────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const today = todayString();

  const [selectedDate, setSelectedDate] = useState(today);
  const [currentMonth, setCurrentMonth] = useState(today.slice(0, 7));
  const [monthEvents, setMonthEvents] = useState<DoseEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalEvent, setModalEvent] = useState<DoseEvent | null>(null);

  const { fetchByDateRange } = useDoseEventStore();
  const { medications, fetchMedications } = useMedicationStore();

  const medicationNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(medications.map((m) => [m.id, m.name])),
    [medications],
  );

  useEffect(() => {
    fetchMedications();
  }, []);

  const loadMonth = useCallback(
    async (yyyyMm: string) => {
      setIsLoading(true);
      const { start, end } = monthRange(yyyyMm);
      const events = await fetchByDateRange(start, end);
      setMonthEvents(events);
      setIsLoading(false);
    },
    [fetchByDateRange],
  );

  useEffect(() => {
    loadMonth(currentMonth);
  }, [currentMonth]);

  // ── 달력 markedDates ────────────────────────────────────────────────────────
  const markedDates = useMemo(() => {
    const byDate: Record<string, DoseEvent[]> = {};
    for (const e of monthEvents) {
      const d = e.plannedAt.slice(0, 10);
      (byDate[d] ??= []).push(e);
    }

    const result: Record<string, {
      marked?: boolean;
      dotColor?: string;
      selected?: boolean;
      selectedColor?: string;
    }> = {};

    for (const [date, events] of Object.entries(byDate)) {
      const total = events.length;
      const taken = events.filter((e) => e.status === 'taken').length;
      const color = getDotColor(total, taken);
      result[date] = {
        marked: color != null,
        dotColor: color ?? undefined,
      };
    }

    result[selectedDate] = {
      ...(result[selectedDate] ?? {}),
      selected: true,
      selectedColor: '#3b82f6',
    };

    return result;
  }, [monthEvents, selectedDate]);

  // ── 선택 날짜 이벤트 ────────────────────────────────────────────────────────
  const selectedEvents = useMemo(
    () =>
      [...monthEvents]
        .filter((e) => e.plannedAt.slice(0, 10) === selectedDate)
        .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt)),
    [monthEvents, selectedDate],
  );

  const isToday = selectedDate === today;

  // ── 늦은 복용 처리 ──────────────────────────────────────────────────────────
  async function handleLateTake(id: string) {
    const now = new Date().toISOString();
    setMonthEvents((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: 'taken' as const, takenAt: now, updatedAt: now }
          : e,
      ),
    );
    try {
      await updateDoseEventStatus(id, 'taken', now);
    } catch {
      loadMonth(currentMonth);
    }
  }

  // ── 월 네비게이션 ──────────────────────────────────────────────────────────
  function prevMonth() {
    const [y, m] = currentMonth.split('-').map(Number);
    setCurrentMonth(
      m === 1
        ? `${y - 1}-12`
        : `${y}-${String(m - 1).padStart(2, '0')}`,
    );
  }

  function nextMonth() {
    const [y, m] = currentMonth.split('-').map(Number);
    setCurrentMonth(
      m === 12
        ? `${y + 1}-01`
        : `${y}-${String(m + 1).padStart(2, '0')}`,
    );
  }

  const [labelY, labelM] = currentMonth.split('-');
  const monthLabel = `${labelY}년 ${Number(labelM)}월`;

  // ── 이벤트 카드 렌더 ────────────────────────────────────────────────────────
  function renderItem({ item: event }: { item: DoseEvent }) {
    const time = event.plannedAt.slice(11, 16);
    const name = medicationNames[event.medicationId] ?? event.medicationId;
    const showLateBtn =
      isToday &&
      (event.status === 'scheduled' || event.status === 'late');

    return (
      <TouchableOpacity
        testID={`history-card-${event.id}`}
        style={styles.card}
        onPress={() => setModalEvent(event)}
        activeOpacity={0.85}
      >
        <Text testID={`history-time-${event.id}`} style={styles.time}>
          {time}
        </Text>
        <View style={styles.cardBody}>
          <Text testID={`history-name-${event.id}`} style={styles.name}>
            {name}
          </Text>
          <Text
            testID={`history-status-${event.id}`}
            style={[styles.status, { color: STATUS_COLOR[event.status] }]}
          >
            {STATUS_LABEL[event.status]}
            {event.takenAt ? ` ${event.takenAt.slice(11, 16)}` : ''}
          </Text>
        </View>
        {showLateBtn && (
          <TouchableOpacity
            testID={`btn-late-take-${event.id}`}
            onPress={() => handleLateTake(event.id)}
            style={styles.lateBtn}
            accessibilityLabel="늦은 복용 처리"
          >
            <Text style={styles.lateBtnTxt}>늦은 복용 처리</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container} testID="screen-history">
      {/* 월 네비게이션 */}
      <View style={styles.monthNav}>
        <TouchableOpacity
          testID="btn-prev-month"
          onPress={prevMonth}
          style={styles.navBtn}
          accessibilityLabel="이전 달"
        >
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text testID="label-month" style={styles.monthLabel}>
          {monthLabel}
        </Text>
        <TouchableOpacity
          testID="btn-next-month"
          onPress={nextMonth}
          style={styles.navBtn}
          accessibilityLabel="다음 달"
        >
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 달력 */}
      <Calendar
        current={`${currentMonth}-01`}
        markedDates={markedDates}
        onDayPress={(day: { dateString: string }) =>
          setSelectedDate(day.dateString)
        }
        onMonthChange={(month: { dateString: string }) =>
          setCurrentMonth(month.dateString.slice(0, 7))
        }
        hideExtraDays
        theme={{
          selectedDayBackgroundColor: '#3b82f6',
          todayTextColor: '#3b82f6',
          arrowColor: '#3b82f6',
        }}
      />

      {/* 선택된 날짜 헤더 */}
      <View style={styles.dateHeader}>
        <Text testID="label-selected-date" style={styles.dateHeaderText}>
          {formatSelectedDate(selectedDate)}
        </Text>
      </View>

      {/* 이벤트 목록 */}
      {isLoading ? (
        <ActivityIndicator testID="loading-indicator" style={{ marginTop: 24 }} />
      ) : (
        <FlatList<DoseEvent>
          testID="list-history"
          data={selectedEvents}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text testID="txt-no-events" style={styles.emptyText}>
              이 날짜에 복용 일정이 없습니다
            </Text>
          }
        />
      )}

      {/* 복용 상세 모달 */}
      <Modal
        visible={modalEvent != null}
        transparent
        animationType="fade"
        onRequestClose={() => setModalEvent(null)}
        testID="modal-event-detail"
      >
        <TouchableOpacity
          style={styles.detailOverlay}
          activeOpacity={1}
          onPress={() => setModalEvent(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.detailCard}>
            {/* 헤더 */}
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>복용 상세</Text>
              <TouchableOpacity
                testID="btn-close-detail"
                onPress={() => setModalEvent(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.detailClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {modalEvent && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>약 이름</Text>
                  <Text testID="detail-med-name" style={styles.detailValue}>
                    {medicationNames[modalEvent.medicationId] ?? modalEvent.medicationId}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>예정 시간</Text>
                  <Text testID="detail-time" style={styles.detailValue}>
                    {modalEvent.plannedAt.slice(11, 16)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>상태</Text>
                  <Text
                    testID="detail-status"
                    style={[styles.detailValue, { color: STATUS_COLOR[modalEvent.status] }]}
                  >
                    {STATUS_LABEL[modalEvent.status]}
                  </Text>
                </View>

                {modalEvent.takenAt ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>복용 시간</Text>
                    <Text testID="detail-taken-at" style={styles.detailValue}>
                      {modalEvent.takenAt.slice(11, 16)}
                    </Text>
                  </View>
                ) : null}

                {modalEvent.note ? (
                  <View style={styles.detailNoteRow}>
                    <Text style={styles.detailLabel}>메모</Text>
                    <Text testID="detail-note" style={styles.detailNote}>
                      {modalEvent.note}
                    </Text>
                  </View>
                ) : null}

                {modalEvent.photoPath ? (
                  <Image
                    testID="detail-photo"
                    source={{ uri: modalEvent.photoPath }}
                    style={styles.detailPhoto}
                    resizeMode="cover"
                  />
                ) : null}
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 22, color: '#374151' },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#111827' },
  dateHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dateHeaderText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: '#9ca3af', marginTop: 32 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  time: { fontSize: 14, fontWeight: '600', color: '#374151', width: 44 },
  cardBody: { flex: 1, marginHorizontal: 10 },
  name: { fontSize: 14, color: '#111827' },
  status: { fontSize: 12, marginTop: 2 },
  lateBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f97316',
  },
  lateBtnTxt: { fontSize: 12, color: '#fff', fontWeight: '600' },

  // 상세 모달
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailCard: {
    width: '85%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  detailClose: { fontSize: 18, color: '#9ca3af' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, fontWeight: '500', color: '#111827' },
  detailNoteRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailNote: { fontSize: 14, color: '#374151', marginTop: 6, lineHeight: 20 },
  detailPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 14,
  },
});
