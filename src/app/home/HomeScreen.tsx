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
import { Ionicons } from '@expo/vector-icons';
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
import { updateDoseEventMemo, getAllSchedules } from '../../db';
import { todayString } from '../../utils';
import DoseCard from '../../components/DoseCard';
import PacketCard from '../../components/PacketCard';
import NextDoseBanner from '../../components/NextDoseBanner';
import type { DoseEvent, WithFood } from '../../domain';

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
  const { userId, isLoggedIn } = useAuthStore();
  const theme = useThemeStore((s) => s.activeTheme);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [now,             setNow]             = useState(() => new Date());
  // scheduleId → 식전/식후 여부 (오늘 일정 카드에 표시)
  const [withFoodBySchedule, setWithFoodBySchedule] = useState<Record<string, WithFood>>({});

  const loadWithFoodMap = useCallback(async () => {
    const schedules = await getAllSchedules(userId ?? 'local');
    const map: Record<string, WithFood> = {};
    for (const s of schedules) map[s.id] = s.withFood;
    setWithFoodBySchedule(map);
  }, [userId]);

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
      loadWithFoodMap(),
    ]);
    setRefreshing(false);
  }

  // ── 탭 포커스 시마다 재조회 (탭 이동·로그인 전환 포함) ─────────────────
  useFocusEffect(
    useCallback(() => {
      fetchTodayEvents(todayString());
      fetchMedications();
      fetchBalance();
      loadWithFoodMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]),
  );

  // ── AppState: active 전환 시 오늘 이벤트 새로고침 + 스냅샷 업로드 ────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        await fetchTodayEvents(todayString());
        await fetchBalance();
        await loadWithFoodMap();
        if (isSyncEnabled() && userId) {
          const events = useDoseEventStore.getState().todayEvents;
          uploadTodaySnapshot(userId, events).catch(() => {});
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [userId, loadWithFoodMap]);

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

  // ── 프로필 배지 탭 ────────────────────────────────────────────────────────
  function handleProfilePress() {
    if (isLoggedIn) {
      navigation.navigate('Account');
    } else {
      navigation.navigate('Login');
    }
  }

  // ── 날짜 헤더 ──────────────────────────────────────────────────────────
  const today = new Date();
  const dateHeader = today.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  // 포는 안에 약이 몇 개든 1건으로 센다 — 멤버 중 하나라도 아직 처리 전이면 포 전체를 미완료로 취급
  const pendingCount = listItems.filter((item) =>
    item.kind === 'packet'
      ? item.events.some((e) => e.status === 'scheduled' || e.status === 'late')
      : item.event.status === 'scheduled' || item.event.status === 'late',
  ).length;

  // ── 렌더 ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <View style={styles.container} testID="screen-home">
      {/* 날짜 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.dateGroup}>
            <Text testID="header-date" style={styles.dateText}>{dateHeader}</Text>
            <Text testID="header-remaining" style={styles.remainingText}>
              {pendingCount > 0 ? '오늘 복용할 약이 아직 남아있어요' : '오늘 복용을 모두 완료했어요'}
            </Text>
          </View>
          <TouchableOpacity
            testID="btn-home-profile"
            onPress={handleProfilePress}
            style={styles.profileBadge}
            accessibilityLabel="내 계정"
            accessibilityRole="button"
          >
            <Ionicons name="person" size={16} color="#8b95a1" />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          {/* 복용 일정 관리 바로가기 */}
          <TouchableOpacity
            testID="btn-home-schedule-manage"
            onPress={() => navigation.navigate('ScheduleManage')}
            style={styles.scheduleChip}
            accessibilityLabel="복용 일정 관리"
            accessibilityRole="button"
          >
            <Ionicons name="calendar-outline" size={16} color="#3182f6" />
            <Text style={styles.scheduleChipText}>일정 관리</Text>
          </TouchableOpacity>
          {/* 복용 가이드 바로가기 */}
          <TouchableOpacity
            testID="btn-home-guide"
            onPress={() => navigation.navigate('GuideList')}
            style={[styles.scheduleChip, styles.guideChip]}
            accessibilityLabel="영양제 복용 가이드"
            accessibilityRole="button"
          >
            <Ionicons name="book-outline" size={16} color="#4e5968" />
            <Text style={[styles.scheduleChipText, styles.guideChipText]}>영양제 가이드</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 배너: 다음 복용 or 모두 완료 */}
      <View style={styles.bannerWrap}>
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
      </View>

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
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3182f6" />
          }
          ListHeaderComponent={
            hasEvents ? <Text style={styles.sectionTitle}>오늘의 복용 일정</Text> : null
          }
          renderItem={({ item }) => {
            if (item.kind === 'packet') {
              return (
                <PacketCard
                  events={item.events}
                  medicationNames={medicationNames}
                  medicationColors={medicationColors}
                  withFood={withFoodBySchedule[item.events[0]?.scheduleId]}
                  onTakePacket={handleTakePacket}
                  onSkipPacket={handleSkipPacket}
                  now={now}
                  graceMinutes={settings.missedToLateMinutes}
                />
              );
            }
            return (
              <DoseCard
                event={item.event}
                medicationName={medicationNames[item.event.medicationId] ?? item.event.medicationId}
                medicationColor={medicationColors[item.event.medicationId]}
                withFood={withFoodBySchedule[item.event.scheduleId]}
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
  container: { flex: 1, backgroundColor: '#f2f4f7' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e8eb',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateGroup: { gap: 6 },
  dateText: { fontSize: 22, fontWeight: '800', color: '#191f28' },
  remainingText: { fontSize: 12, color: '#8b95a1', fontWeight: '500' },
  profileBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f2f4f7', alignItems: 'center', justifyContent: 'center',
  },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleChip: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d2e4fc',
    backgroundColor: '#e8f3ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleChipText: { fontSize: 14, fontWeight: '700', color: '#3182f6' },
  guideChip: { borderColor: '#e5e8eb', backgroundColor: '#fff' },
  guideChipText: { color: '#4e5968' },

  bannerWrap: { paddingHorizontal: 20, paddingTop: 16 },
  banner: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  doneBanner: { backgroundColor: '#00b894' },
  doneText: { fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#191f28', marginBottom: 12 },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  emptyText: { textAlign: 'center', color: '#8b95a1', marginTop: 40 },
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
