import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  StyleSheet,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import {
  useDoseEventStore,
  useMedicationStore,
  useSettingsStore,
  usePointStore,
} from '../../store';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { isSyncEnabled, uploadTodaySnapshot } from '../../sync/syncService';
import { rescheduleSnooze } from '../../notifications';
import { updateDoseEventMemo } from '../../db';
import { todayString } from '../../utils';
import DoseCard from '../../components/DoseCard';
import PacketCard from '../../components/PacketCard';
import NextDoseBanner from '../../components/NextDoseBanner';
import type { DoseEvent } from '../../domain';

type PacketGroup = { kind: 'packet'; packetId: string; plannedAt: string; events: DoseEvent[] };
type SingleEvent = { kind: 'single'; event: DoseEvent };
type ListItem = PacketGroup | SingleEvent;

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
  mealTimeBreakfast: '09:00',
  mealTimeLunch: '12:00',
  mealTimeDinner: '17:00',
  fontScale: 1.0,
};

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();

  const { todayEvents, isLoading, fetchTodayEvents, markTaken, markPacketTaken, markSkipped, snooze } =
    useDoseEventStore((s) => s);
  const { medications, fetchMedications } = useMedicationStore((s) => s);
  const settings = useSettingsStore((s) => s.settings) ?? FALLBACK_SETTINGS;
  const { fetchBalance } = usePointStore();
  const { userId } = useAuthStore();
  const theme = useThemeStore((s) => s.activeTheme);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [now,             setNow]             = useState(() => new Date());

  // 버튼 활성/비활성 상태가 분 단위로 바뀌므로 1분마다 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      fetchTodayEvents(todayString()),
      fetchMedications(),
      fetchBalance(),
    ]);
    setRefreshing(false);
  }

  // ── 탭 포커스 시마다 재조회 (탭 이동·로그인 전환 포함) ─────────────────
  useFocusEffect(
    useCallback(() => {
      fetchTodayEvents(todayString());
      fetchMedications();
      fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]),
  );

  // ── AppState: active 전환 시 오늘 이벤트 새로고침 + 스냅샷 업로드 ────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        await fetchTodayEvents(todayString());
        await fetchBalance();
        if (isSyncEnabled() && userId) {
          const events = useDoseEventStore.getState().todayEvents;
          uploadTodaySnapshot(userId, events).catch(() => {});
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [userId]);

  // ── 파생 값 ────────────────────────────────────────────────────────────
  const medicationNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(medications.map((m) => [m.id, m.name])),
    [medications],
  );

  const medicationColors = useMemo<Record<string, string | undefined>>(
    () => Object.fromEntries(medications.map((m) => [m.id, m.color])),
    [medications],
  );

  const sortedEvents = useMemo(
    () => [...todayEvents].sort((a, b) => a.plannedAt.localeCompare(b.plannedAt)),
    [todayEvents],
  );

  // 포 그룹화: packetId + plannedAt 기준으로 묶음, 나머지는 개별 카드
  const listItems = useMemo<ListItem[]>(() => {
    const packetMap = new Map<string, DoseEvent[]>();
    const result: ListItem[] = [];

    for (const event of sortedEvents) {
      if (event.packetId) {
        const key = `${event.packetId}|${event.plannedAt}`;
        if (!packetMap.has(key)) packetMap.set(key, []);
        packetMap.get(key)!.push(event);
      }
    }

    const addedPacketKeys = new Set<string>();
    for (const event of sortedEvents) {
      if (event.packetId) {
        const key = `${event.packetId}|${event.plannedAt}`;
        if (!addedPacketKeys.has(key)) {
          addedPacketKeys.add(key);
          result.push({ kind: 'packet', packetId: event.packetId, plannedAt: event.plannedAt, events: packetMap.get(key)! });
        }
      } else {
        result.push({ kind: 'single', event });
      }
    }
    return result;
  }, [sortedEvents]);

  const hasEvents = todayEvents.length > 0;
  const allDone =
    hasEvents &&
    todayEvents.every(
      (e) => e.status !== 'scheduled' && e.status !== 'late',
    );

  // ── 액션 ───────────────────────────────────────────────────────────────
  async function handleTake(id: string) {
    try {
      const { streakAwarded } = await markTaken(id);
      await fetchBalance();
      if (streakAwarded) setShowStreakModal(true);
    } catch {
      // 낙관적 업데이트 롤백은 store 에서 처리됨
    }
  }

  async function handleTakePacket(ids: string[]) {
    try {
      const { streakAwarded } = await markPacketTaken(ids);
      await fetchBalance();
      if (streakAwarded) setShowStreakModal(true);
    } catch {
      // store에서 낙관적 업데이트 롤백 처리
    }
  }

  async function handleSkipPacket(ids: string[]) {
    try {
      await Promise.all(ids.map((id) => markSkipped(id)));
    } catch {
      // store error로 전파됨
    }
  }

  async function handleAfterTake(id: string, note: string, photoPath: string | undefined) {
    if (note || photoPath) {
      await updateDoseEventMemo(id, note || null, photoPath ?? null);
    }
  }

  async function handleSkip(eventId: string) {
    try {
      await markSkipped(eventId);
    } catch {
      // 오류는 store error 상태로 전파됨
    }
  }

  async function handleSnooze(eventId: string) {
    try {
      const event = todayEvents.find((e) => e.id === eventId);
      if (!event) return;
      const ok = await snooze(eventId, settings.defaultSnoozeMinutes);
      if (ok) {
        await rescheduleSnooze(eventId, settings.defaultSnoozeMinutes, event.plannedAt);
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <View style={styles.container} testID="screen-home">
      {/* 날짜 + 포인트 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text testID="header-date" style={styles.dateText}>{dateHeader}</Text>
          <View style={styles.headerRight}>
            {/* 복용 일정 관리 바로가기 */}
            <TouchableOpacity
              testID="btn-home-schedule-manage"
              onPress={() => navigation.navigate('ScheduleManage')}
              style={styles.scheduleChip}
              accessibilityLabel="복용 일정 관리"
              accessibilityRole="button"
            >
              <Text style={styles.scheduleChipText}>일정 관리</Text>
            </TouchableOpacity>
            {/* 영양제 가이드 바로가기 */}
            <TouchableOpacity
              testID="btn-home-guide"
              onPress={() => navigation.navigate('GuideList')}
              style={[styles.scheduleChip, styles.guideChip]}
              accessibilityLabel="영양제 복용 가이드"
              accessibilityRole="button"
            >
              <Text style={styles.scheduleChipText}>영양제 가이드 📖</Text>
            </TouchableOpacity>
          </View>
        </View>
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
        <FlatList<ListItem>
          testID="list-events"
          data={listItems}
          keyExtractor={(item) =>
            item.kind === 'packet'
              ? `packet-${item.packetId}-${item.plannedAt}`
              : item.event.id
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
          }
          renderItem={({ item }) => {
            if (item.kind === 'packet') {
              return (
                <PacketCard
                  events={item.events}
                  medicationNames={medicationNames}
                  medicationColors={medicationColors}
                  onTakePacket={handleTakePacket}
                  onSkipPacket={handleSkipPacket}
                />
              );
            }
            return (
              <DoseCard
                event={item.event}
                medicationName={medicationNames[item.event.medicationId] ?? item.event.medicationId}
                medicationColor={medicationColors[item.event.medicationId]}
                onTake={handleTake}
                onSnooze={handleSnooze}
                onSkip={handleSkip}
                onAfterTake={handleAfterTake}
                now={now}
                graceMinutes={settings.missedToLateMinutes}
              />
            );
          }}
          ListEmptyComponent={
            <Text testID="txt-empty" style={styles.emptyText}>
              오늘 예정된 복용이 없습니다
            </Text>
          }
        />
      )}

      {/* 연속 7일 달성 축하 모달 */}
      <Modal
        testID="modal-streak"
        visible={showStreakModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStreakModal(false)}
      >
        <TouchableOpacity
          style={styles.piOverlay}
          activeOpacity={1}
          onPress={() => setShowStreakModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.piCard}>
            <Text style={styles.streakTitle}>🔥 7일 연속 달성!</Text>
            <Text style={styles.streakDesc}>꾸준한 복용 습관을 만들고 있어요.</Text>
            <Text style={[styles.streakPoints, { color: theme.primary }]}>+50 포인트 적립!</Text>
            <TouchableOpacity
              testID="btn-streak-confirm"
              style={[styles.streakBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowStreakModal(false)}
            >
              <Text style={styles.streakBtnTxt}>확인</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* FAB */}
      <TouchableOpacity
        testID="btn-fab"
        onPress={() => navigation.navigate('ScheduleNew')}
        accessibilityLabel="약 일정 추가"
        accessibilityRole="button"
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: { fontSize: 18, fontWeight: '700', color: '#111827' },
  remainingText: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  scheduleChipText: { fontSize: 12, fontWeight: '500', color: '#6b7280' },
  guideChip: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },

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

  piOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  piCard:    { width: '86%', backgroundColor: '#fff', borderRadius: 18, padding: 20 },

  streakTitle:  { fontSize: 26, textAlign: 'center', marginBottom: 8 },
  streakDesc:   { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 6 },
  streakPoints: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  streakBtn:    { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  streakBtnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
