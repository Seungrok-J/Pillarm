import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList from 'react-native-draggable-flatlist';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import {
  getAllSchedules,
  getAllMedications,
  deleteSchedule,
  deleteFutureDoseEvents,
  upsertSchedule,
} from '../../db';
import { cancelForSchedule, scheduleForSchedule } from '../../notifications';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store';
import { isSyncEnabled, pushSchedule } from '../../sync/syncService';
import { generateId, todayString } from '../../utils';
import type { Schedule, Medication } from '../../domain';

type Nav = StackNavigationProp<RootStackParamList>;

const DAYS_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

interface ScheduleItem {
  schedule: Schedule;
  medication: Medication;
}

interface PacketGroup {
  kind: 'packet';
  packetId: string;
  items: ScheduleItem[];
}
interface SingleItem {
  kind: 'single';
  item: ScheduleItem;
}
type ListEntry = PacketGroup | SingleItem;

/** 포로 합칠 수 있는지 비교하는 기준 — 복용 시간과 기간(시작일·종료일)이 완전히 같아야 함 */
function mergeKeyOf(schedule: Schedule): string {
  return [...schedule.times].sort().join(',') + '|' + schedule.startDate + '|' + (schedule.endDate ?? '');
}

function representativeSchedule(entry: ListEntry): Schedule {
  return entry.kind === 'packet' ? entry.items[0].schedule : entry.item.schedule;
}

/** 드래그 중인 카드를 살짝 확대해 부드럽게 떠오르는 느낌을 준다 */
function DragScale({ isActive, children }: { isActive: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(isActive ? 1.04 : 1, { damping: 16, stiffness: 200 });
  }, [isActive, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function repeatLabel(schedule: Schedule): string {
  if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) return '매일';
  return schedule.daysOfWeek.map((d) => DAYS_LABEL[d]).join('·') + ' 반복';
}

function dateRange(schedule: Schedule): string {
  const start = schedule.startDate.replace(/-/g, '.');
  return schedule.endDate
    ? `${start} ~ ${schedule.endDate.replace(/-/g, '.')}`
    : `${start} ~`;
}

export default function ScheduleManageScreen() {
  const navigation = useNavigation<Nav>();
  const { userId } = useAuthStore();
  const uid = userId ?? 'local';

  const [items,      setItems]      = useState<ScheduleItem[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPast,   setShowPast]   = useState(false);

  const today = todayString();

  const { activeItems, pastItems } = useMemo(() => {
    const active: ScheduleItem[] = [];
    const past:   ScheduleItem[] = [];
    for (const item of items) {
      const ended = item.schedule.endDate && item.schedule.endDate < today;
      if (ended) past.push(item);
      else       active.push(item);
    }
    return { activeItems: active, pastItems: past };
  }, [items, today]);

  // 포 그룹화: packetId 기준으로 묶기
  const groupedActiveItems = useMemo<ListEntry[]>(() => {
    const packetMap = new Map<string, ScheduleItem[]>();
    const result: ListEntry[] = [];
    const addedPackets = new Set<string>();

    for (const item of activeItems) {
      if (item.schedule.packetId) {
        if (!packetMap.has(item.schedule.packetId)) packetMap.set(item.schedule.packetId, []);
        packetMap.get(item.schedule.packetId)!.push(item);
      }
    }

    for (const item of activeItems) {
      if (item.schedule.packetId) {
        const pid = item.schedule.packetId;
        if (!addedPackets.has(pid)) {
          addedPackets.add(pid);
          result.push({ kind: 'packet', packetId: pid, items: packetMap.get(pid)! });
        }
      } else {
        result.push({ kind: 'single', item });
      }
    }
    return result;
  }, [activeItems]);

  const loadData = useCallback(async () => {
    const [schedules, meds] = await Promise.all([
      getAllSchedules(uid),
      getAllMedications(uid),
    ]);
    const medMap = new Map(meds.map((m) => [m.id, m]));
    const result: ScheduleItem[] = schedules
      .map((s) => ({ schedule: s, medication: medMap.get(s.medicationId)! }))
      .filter((item) => item.medication != null);
    setItems(result);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setIsLoading(true);
        await loadData();
        if (active) setIsLoading(false);
      })();
      return () => { active = false; };
    }, [loadData]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function confirmDelete(item: ScheduleItem, isPast = false) {
    const message = isPast
      ? `'${item.medication.name}' 종료된 일정을 삭제하시겠어요?\n복용 기록은 유지됩니다.`
      : `'${item.medication.name}' 복용 일정을 삭제하시겠어요?\n미래 예약된 알림도 함께 취소됩니다.`;
    Alert.alert(
      '일정 삭제',
      message,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await deleteSchedule(item.schedule.id);
            await deleteFutureDoseEvents(item.schedule.id);
            await cancelForSchedule(item.schedule.id);
            setItems((prev) => prev.filter((i) => i.schedule.id !== item.schedule.id));
          },
        },
      ],
    );
  }

  async function handleDeleteAll() {
    const all = [...activeItems, ...pastItems];
    if (all.length === 0) return;
    Alert.alert(
      '전체 삭제',
      `등록된 복용 일정 ${all.length}건을 모두 삭제하시겠어요?\n미래 예약된 알림도 함께 취소되며, 삭제 후에는 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 삭제',
          style: 'destructive',
          onPress: async () => {
            for (const item of all) {
              await deleteSchedule(item.schedule.id);
              await deleteFutureDoseEvents(item.schedule.id);
              await cancelForSchedule(item.schedule.id);
            }
            setItems([]);
          },
        },
      ],
    );
  }

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        activeItems.length + pastItems.length > 0 ? (
          <TouchableOpacity
            testID="btn-delete-all"
            onPress={handleDeleteAll}
            style={styles.headerDeleteAllBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerDeleteAllTxt}>전체 삭제</Text>
          </TouchableOpacity>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, activeItems.length, pastItems.length]);

  async function confirmDeletePacket(packetItems: ScheduleItem[]) {
    const names = packetItems.map((i) => i.medication.name).join(', ');
    Alert.alert(
      '포 일정 전체 삭제',
      `포로 묶인 약 일정을 모두 삭제하시겠어요?\n(${names})\n미래 알림도 함께 취소됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 삭제',
          style: 'destructive',
          onPress: async () => {
            for (const item of packetItems) {
              await deleteSchedule(item.schedule.id);
              await deleteFutureDoseEvents(item.schedule.id);
              await cancelForSchedule(item.schedule.id);
            }
            const ids = new Set(packetItems.map((i) => i.schedule.id));
            setItems((prev) => prev.filter((i) => !ids.has(i.schedule.id)));
          },
        },
      ],
    );
  }

  // 개별 일정을 다른 개별/포 위로 드래그해서 포로 합치기 — 시간·기간이 완전히 같을 때만 허용
  async function mergeIntoPacket(dragged: ScheduleItem, target: ListEntry) {
    const now = new Date().toISOString();
    const settings = useSettingsStore.getState().settings;

    async function applyPacket(item: ScheduleItem, packetId: string, packetName: string | undefined) {
      const updated: Schedule = { ...item.schedule, packetId, packetName, updatedAt: now };
      await upsertSchedule(updated, uid);
      await deleteFutureDoseEvents(updated.id);
      if (settings) await scheduleForSchedule(updated, item.medication, settings);
      if (isSyncEnabled()) pushSchedule(updated).catch(() => {});
    }

    if (target.kind === 'packet') {
      const packetName = target.items.find((i) => i.schedule.packetName)?.schedule.packetName;
      await applyPacket(dragged, target.packetId, packetName);
    } else {
      const packetId = generateId();
      await applyPacket(target.item, packetId, undefined);
      await applyPacket(dragged, packetId, undefined);
    }
    await loadData();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  function handleDragEnd({ from, to }: { data: ListEntry[]; from: number; to: number }) {
    if (from === to) return;
    const dragged = groupedActiveItems[from];
    const target = groupedActiveItems[to];
    if (!dragged || !target || dragged.kind !== 'single') return; // 포끼리 합치기는 지원하지 않음

    if (mergeKeyOf(dragged.item.schedule) !== mergeKeyOf(representativeSchedule(target))) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert('합칠 수 없어요', '복용 시간과 기간(시작일·종료일)이 같은 일정끼리만 포로 합칠 수 있어요.');
      return;
    }

    const targetName = target.kind === 'packet'
      ? (target.items.find((i) => i.schedule.packetName)?.schedule.packetName ?? `${target.items.length}개 약 묶음`)
      : target.item.medication.name;

    Alert.alert(
      '포로 합치기',
      `'${dragged.item.medication.name}' 일정을 '${targetName}'와(과) 같은 포로 합칠까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '합치기', onPress: () => mergeIntoPacket(dragged.item, target) },
      ],
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ActivityIndicator style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  function renderCard(item: ScheduleItem, isPast = false, drag?: () => void, isActive?: boolean) {
    const Wrapper = drag ? TouchableOpacity : View;
    return (
      <Wrapper
        key={item.schedule.id}
        style={[styles.card, isPast && styles.cardPast, isActive && styles.cardDragging]}
        testID={isPast ? `card-past-${item.schedule.id}` : `card-${item.schedule.id}`}
        {...(drag ? { onLongPress: drag, delayLongPress: 200, activeOpacity: 0.9 } : {})}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.colorDot, { backgroundColor: item.medication.color ?? '#d1d5db' }]} />
          <Text style={[styles.medName, isPast && styles.textMuted]} numberOfLines={1}>
            {item.medication.name}
          </Text>
          {item.medication.dosageValue != null && (
            <Text style={[styles.dosage, isPast && styles.textMuted]}>
              {item.medication.dosageValue}{item.medication.dosageUnit ?? ''}
            </Text>
          )}
          {isPast && (
            <View style={styles.endedBadge}>
              <Text style={styles.endedBadgeTxt}>종료</Text>
            </View>
          )}
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>⏰</Text>
          <Text style={[styles.infoText, isPast && styles.textMuted]}>
            {item.schedule.times.join('  ')}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📅</Text>
          <Text style={[styles.infoText, isPast && styles.textMuted]}>
            {repeatLabel(item.schedule)}　{dateRange(item.schedule)}
          </Text>
        </View>

        {item.schedule.withFood !== 'none' && (
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🍽️</Text>
            <Text style={[styles.infoText, isPast && styles.textMuted]}>
              {item.schedule.withFood === 'before' ? '식전 복용' : '식후 복용'}
            </Text>
          </View>
        )}

        <View style={styles.btnRow}>
          {!isPast && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() =>
                navigation.navigate('ScheduleEdit', {
                  scheduleId: item.schedule.id,
                  medicationId: item.medication.id,
                })
              }
            >
              <Text style={styles.editBtnTxt}>수정</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.deleteBtn, isPast && styles.deleteBtnFull]}
            onPress={() => confirmDelete(item, isPast)}
          >
            <Text style={styles.deleteBtnTxt}>삭제</Text>
          </TouchableOpacity>
        </View>
      </Wrapper>
    );
  }

  function renderPacketGroup(group: PacketGroup, drag?: () => void, isActive?: boolean) {
    const times = [...new Set(group.items.flatMap((i) => i.schedule.times))].sort();
    const packetName = group.items.find((i) => i.schedule.packetName)?.schedule.packetName;
    return (
      <TouchableOpacity
        key={group.packetId}
        style={[styles.packetCard, isActive && styles.cardDragging]}
        onLongPress={drag}
        delayLongPress={200}
        activeOpacity={0.9}
      >
        {/* 포 그룹 헤더 */}
        <View style={styles.packetHeader}>
          <View style={styles.packetBadge}>
            <Text style={styles.packetBadgeText}>포</Text>
          </View>
          <Text style={styles.packetTitle}>
            {packetName ? packetName : `${group.items.length}개 약 묶음`}
          </Text>
          <Text style={styles.packetTimes}>{times.join('  ')}</Text>
        </View>

        {/* 묶인 약 목록 */}
        {group.items.map((item) => (
          <View key={item.schedule.id} style={styles.packetItemRow}>
            <View style={[styles.colorDot, { backgroundColor: item.medication.color ?? '#d1d5db' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.medName} numberOfLines={1}>{item.medication.name}</Text>
              <Text style={styles.dosage}>
                {dateRange(item.schedule)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.editBtnSmall}
              onPress={() =>
                navigation.navigate('ScheduleEdit', {
                  scheduleId: item.schedule.id,
                  medicationId: item.medication.id,
                })
              }
            >
              <Text style={styles.editBtnTxt}>수정</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* 포 전체 삭제 버튼 */}
        <TouchableOpacity
          style={styles.packetDeleteBtn}
          onPress={() => confirmDeletePacket(group.items)}
        >
          <Text style={styles.deleteBtnTxt}>포 전체 삭제</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  const pastToggle = pastItems.length > 0 ? (
    <View>
      <TouchableOpacity
        testID="btn-toggle-past"
        style={styles.pastToggle}
        onPress={() => setShowPast((v) => !v)}
      >
        <Text style={styles.pastToggleTxt}>
          {showPast
            ? `지난 일정 ${pastItems.length}건 숨기기 ▲`
            : `지난 일정 ${pastItems.length}건 보기 ▼`}
        </Text>
      </TouchableOpacity>
      {showPast && pastItems.map((item) => renderCard(item, true))}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {groupedActiveItems.length > 1 && (
        <Text style={styles.dragHint}>일정을 길게 눌러 다른 일정 위로 끌면 포로 합칠 수 있어요</Text>
      )}
      <DraggableFlatList
        data={groupedActiveItems}
        keyExtractor={(entry) =>
          entry.kind === 'packet' ? `packet-${entry.packetId}` : entry.item.schedule.id
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" colors={['#3b82f6']} />
        }
        ListEmptyComponent={
          activeItems.length === 0 && pastItems.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💊</Text>
              <Text style={styles.emptyText}>등록된 복용 일정이 없습니다</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('ScheduleNew')}
              >
                <Text style={styles.addBtnTxt}>＋ 일정 추가</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item: entry, drag, isActive }) => (
          <DragScale isActive={isActive}>
            {entry.kind === 'packet'
              ? renderPacketGroup(entry, drag, isActive)
              : renderCard(entry.item, false, drag, isActive)}
          </DragScale>
        )}
        onDragBegin={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }}
        onDragEnd={handleDragEnd}
        ListFooterComponent={pastToggle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 48 },
  dragHint: {
    fontSize: 12, color: '#9ca3af', textAlign: 'center',
    paddingTop: 10, paddingBottom: 2, paddingHorizontal: 16,
  },
  cardDragging: {
    opacity: 0.85, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
    borderColor: '#3b82f6', borderWidth: 1.5,
  },

  headerDeleteAllBtn: { marginRight: 12, paddingVertical: 6, paddingHorizontal: 4 },
  headerDeleteAllTxt: { color: '#ef4444', fontSize: 15, fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  medName: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827' },
  dosage:  { fontSize: 13, color: '#6b7280' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  infoIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  infoText: { fontSize: 14, color: '#374151', flex: 1 },

  btnRow: {
    flexDirection: 'row', gap: 10, marginTop: 14,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  editBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#3b82f6', alignItems: 'center',
  },
  editBtnTxt:   { fontSize: 15, color: '#3b82f6', fontWeight: '600' },
  deleteBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#ef4444', alignItems: 'center',
  },
  deleteBtnTxt: { fontSize: 15, color: '#ef4444', fontWeight: '600' },

  cardPast:     { backgroundColor: '#f9fafb', opacity: 0.85 },
  textMuted:    { color: '#9ca3af' },
  endedBadge:   { backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4 },
  endedBadgeTxt:{ fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  deleteBtnFull:{ flex: 1 },

  // 포 그룹 스타일
  packetCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#e0eaff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  packetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  packetBadge: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center',
  },
  packetBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  packetTitle:     { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  packetTimes:     { fontSize: 14, color: '#6b7280' },

  packetItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  editBtnSmall: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: '#3b82f6',
  },
  packetDeleteBtn: {
    marginTop: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#ef4444', alignItems: 'center',
  },

  pastToggle: { alignItems: 'center', paddingVertical: 14, marginBottom: 4 },
  pastToggleTxt: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  empty:     { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginBottom: 24 },
  addBtn:    { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  addBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
