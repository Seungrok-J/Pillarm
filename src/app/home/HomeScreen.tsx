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
  Animated,
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
  mealTimeBreakfast: '09:00',
  mealTimeLunch: '12:00',
  mealTimeDinner: '17:00',
};

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();

  const { todayEvents, isLoading, fetchTodayEvents, markTaken, markSkipped, snooze } =
    useDoseEventStore((s) => s);
  const { medications, fetchMedications } = useMedicationStore((s) => s);
  const settings = useSettingsStore((s) => s.settings) ?? FALLBACK_SETTINGS;
  const { balance, streak, fetchBalance } = usePointStore();
  const { userId } = useAuthStore();
  const theme = useThemeStore((s) => s.activeTheme);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [showPointsInfo,  setShowPointsInfo]  = useState(false);
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

  // ── 토스트 애니메이션 ───────────────────────────────────────────────────
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const [toastMessage, setToastMessage] = useState('+10 포인트! 🎉');

  function triggerToast(message: string) {
    setToastMessage(message);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(20);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(1400),
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: -10, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
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

  const hasEvents = todayEvents.length > 0;
  const allDone =
    hasEvents &&
    todayEvents.every(
      (e) => e.status !== 'scheduled' && e.status !== 'late',
    );

  // ── 액션 ───────────────────────────────────────────────────────────────
  async function handleTake(id: string) {
    try {
      const { streakAwarded, pointsAwarded } = await markTaken(id);
      triggerToast(pointsAwarded ? '+10 포인트! 🎉' : '오늘 포인트 한도를 채웠어요 💊');
      await fetchBalance();
      if (streakAwarded) setShowStreakModal(true);
    } catch {
      // 낙관적 업데이트 롤백은 store 에서 처리됨
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
            {/* 포인트 배지 */}
            <TouchableOpacity
              testID="badge-points"
              style={styles.pointBadgeRow}
              onPress={() => setShowPointsInfo(true)}
              accessibilityLabel={`포인트 ${balance}, 연속 ${streak}일`}
              accessibilityRole="button"
            >
              {streak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.badgeText}>🔥 {streak}일</Text>
                </View>
              )}
              <View style={[styles.balanceBadge, { backgroundColor: theme.primaryLight }]}>
                <Text style={styles.badgeText}>⭐ {balance.toLocaleString()}P</Text>
              </View>
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
        <FlatList<DoseEvent>
          testID="list-events"
          data={sortedEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
          }
          renderItem={({ item }) => (
            <DoseCard
              event={item}
              medicationName={medicationNames[item.medicationId] ?? item.medicationId}
              medicationColor={medicationColors[item.medicationId]}
              onTake={handleTake}
              onSnooze={handleSnooze}
              onSkip={handleSkip}
              onAfterTake={handleAfterTake}
              now={now}
              graceMinutes={settings.missedToLateMinutes}
            />
          )}
          ListEmptyComponent={
            <Text testID="txt-empty" style={styles.emptyText}>
              오늘 예정된 복용이 없습니다
            </Text>
          }
        />
      )}

      {/* 포인트 안내 모달 */}
      <Modal
        visible={showPointsInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPointsInfo(false)}
      >
        <TouchableOpacity
          style={styles.piOverlay}
          activeOpacity={1}
          onPress={() => setShowPointsInfo(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.piCard}>
            <View style={styles.piHeader}>
              <Text style={styles.piTitle}>포인트 적립 방법</Text>
              <TouchableOpacity onPress={() => setShowPointsInfo(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.piClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.piRow}>
              <Text style={styles.piIcon}>💊</Text>
              <View style={styles.piTextBlock}>
                <Text style={styles.piLabel}>복용 완료</Text>
                <Text style={styles.piDesc}>예정 시간에 맞춰 복용하면 적립</Text>
              </View>
              <Text style={[styles.piPoints, { color: theme.primary }]}>+10P</Text>
            </View>
            <View style={styles.piDivider} />
            <View style={styles.piRow}>
              <Text style={styles.piIcon}>🔥</Text>
              <View style={styles.piTextBlock}>
                <Text style={styles.piLabel}>연속 7일 달성</Text>
                <Text style={styles.piDesc}>7일마다 보너스 적립</Text>
              </View>
              <Text style={[styles.piPoints, { color: theme.primary }]}>+50P</Text>
            </View>
            <View style={styles.piDivider} />
            <View style={styles.piRow}>
              <Text style={styles.piIcon}>⭐</Text>
              <View style={styles.piTextBlock}>
                <Text style={styles.piLabel}>이번 주 누락 0건</Text>
                <Text style={styles.piDesc}>한 주 동안 빠짐없이 복용하면 적립</Text>
              </View>
              <Text style={[styles.piPoints, { color: theme.primary }]}>+30P</Text>
            </View>
            <View style={styles.piCurrentRow}>
              <Text style={styles.piCurrentLabel}>현재 보유</Text>
              <Text style={styles.piCurrentValue}>⭐ {balance.toLocaleString()}P</Text>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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

      {/* 포인트 토스트 */}
      <Animated.View
        testID="toast-points"
        pointerEvents="none"
        style={[
          styles.toast,
          { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
        ]}
      >
        <Text style={styles.toastText}>{toastMessage}</Text>
      </Animated.View>
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
  pointBadgeRow: { flexDirection: 'row', gap: 6 },
  streakBadge: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  balanceBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: { fontSize: 13, fontWeight: '600', color: '#111827' },

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

  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  piOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  piCard:    { width: '86%', backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  piHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  piTitle:   { fontSize: 17, fontWeight: '700', color: '#111827' },
  piClose:   { fontSize: 18, color: '#9ca3af' },
  piRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  piIcon:    { fontSize: 22, width: 36 },
  piTextBlock: { flex: 1 },
  piLabel:   { fontSize: 15, fontWeight: '600', color: '#111827' },
  piDesc:    { fontSize: 13, color: '#6b7280', marginTop: 2 },
  piPoints:  { fontSize: 16, fontWeight: '700', color: '#3b82f6', minWidth: 48, textAlign: 'right' },
  piDivider: { height: 1, backgroundColor: '#f3f4f6' },
  piCurrentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  piCurrentLabel: { fontSize: 14, color: '#6b7280' },
  piCurrentValue: { fontSize: 18, fontWeight: '700', color: '#111827' },

  streakTitle:  { fontSize: 26, textAlign: 'center', marginBottom: 8 },
  streakDesc:   { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 6 },
  streakPoints: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  streakBtn:    { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  streakBtnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
