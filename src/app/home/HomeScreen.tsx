import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useDoseEventStore, useMedicationStore, useSettingsStore } from '../../store';
import { checkAndMarkMissed, rescheduleSnooze } from '../../notifications';
import { todayString } from '../../utils';
import DoseCard from '../../components/DoseCard';
import NextDoseBanner from '../../components/NextDoseBanner';
import type { DoseEvent } from '../../domain';

type Nav = StackNavigationProp<RootStackParamList>;

const FALLBACK_SETTINGS = {
  userId: 'local' as const,
  timeZone: 'Asia/Seoul',
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
  defaultSnoozeMinutes: 15,
  maxSnoozeCount: 3,
  missedToLateMinutes: 120,
  autoMarkMissedEnabled: true,
};

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();

  const { todayEvents, isLoading, fetchTodayEvents, markTaken, snooze } =
    useDoseEventStore((s) => s);
  const { medications, fetchMedications } = useMedicationStore((s) => s);
  const settings = useSettingsStore((s) => s.settings) ?? FALLBACK_SETTINGS;

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── 초기 로드 ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTodayEvents(todayString());
    fetchMedications();
  }, []);

  // ── AppState: active 전환 시 missed 자동 처리 + 새로고침 ───────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        await checkAndMarkMissed(settings);
        await fetchTodayEvents(todayString());
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [settings]);

  // ── 파생 값 ────────────────────────────────────────────────────────────
  const medicationNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(medications.map((m) => [m.id, m.name])),
    [medications],
  );

  const sortedEvents = useMemo(
    () => [...todayEvents].sort((a, b) => a.plannedAt.localeCompare(b.plannedAt)),
    [todayEvents],
  );

  const hasEvents = todayEvents.length > 0;
  const allDone =
    hasEvents &&
    todayEvents.every(
      (e) => e.status !== 'scheduled' && e.status !== 'late',
    );

  // ── 액션 ───────────────────────────────────────────────────────────────
  async function handleTake(id: string) {
    try {
      await markTaken(id);
    } catch {
      // 낙관적 업데이트 롤백은 store 에서 처리됨
    }
  }

  async function handleSnooze(eventId: string) {
    try {
      const ok = await snooze(eventId, settings.maxSnoozeCount);
      if (ok) {
        await rescheduleSnooze(eventId, settings.defaultSnoozeMinutes);
      }
    } catch {
      // 오류는 store error 상태로 전파됨
    }
  }

  // ── 날짜 헤더 ──────────────────────────────────────────────────────────
  const today = new Date();
  const dateHeader = today.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  const pendingCount = todayEvents.filter(
    (e) => e.status === 'scheduled' || e.status === 'late',
  ).length;

  // ── 렌더 ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container} testID="screen-home">
      {/* 날짜 헤더 */}
      <View style={styles.header}>
        <Text testID="header-date" style={styles.dateText}>{dateHeader}</Text>
        {pendingCount > 0 && (
          <Text testID="header-remaining" style={styles.remainingText}>
            남은 복용 {pendingCount}건
          </Text>
        )}
      </View>

      {/* 배너: 다음 복용 or 모두 완료 */}
      {hasEvents ? (
        allDone ? (
          <View testID="banner-all-done" style={[styles.banner, styles.doneBanner]}>
            <Text testID="txt-all-done" style={styles.doneText}>
              오늘 복용을 모두 완료했어요! 🎉
            </Text>
          </View>
        ) : (
          <NextDoseBanner events={sortedEvents} medicationNames={medicationNames} />
        )
      ) : null}

      {/* 이벤트 리스트 */}
      {isLoading ? (
        <ActivityIndicator testID="loading-indicator" style={{ marginTop: 40 }} />
      ) : (
        <FlatList<DoseEvent>
          testID="list-events"
          data={sortedEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <DoseCard
              event={item}
              medicationName={medicationNames[item.medicationId] ?? item.medicationId}
              onTake={handleTake}
              onSnooze={handleSnooze}
              maxSnoozeCount={settings.maxSnoozeCount}
            />
          )}
          ListEmptyComponent={
            <Text testID="txt-empty" style={styles.emptyText}>
              오늘 예정된 복용이 없습니다
            </Text>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        testID="btn-fab"
        onPress={() => navigation.navigate('ScheduleNew')}
        accessibilityLabel="약 일정 추가"
        accessibilityRole="button"
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dateText: { fontSize: 18, fontWeight: '700', color: '#111827' },
  remainingText: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  doneBanner: { backgroundColor: '#f0fdf4' },
  doneText: { fontSize: 15, fontWeight: '600', color: '#16a34a', textAlign: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  emptyText: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
});
