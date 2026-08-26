import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import {
  getAllSchedules,
  getAllMedications,
  deleteSchedule,
  deleteFutureDoseEvents,
} from '../../db';
import { cancelForSchedule } from '../../notifications';
import { useAuthStore } from '../../store/authStore';
import { todayString } from '../../utils';
import type { Schedule, Medication } from '../../domain';
import AlertModal from '../../components/AlertModal';

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
  const [deleteConfirm, setDeleteConfirm] = useState<{ item: ScheduleItem; isPast: boolean } | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletePacketConfirm, setDeletePacketConfirm] = useState<ScheduleItem[] | null>(null);

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

  function confirmDelete(item: ScheduleItem, isPast = false) {
    setDeleteConfirm({ item, isPast });
  }

  async function performDelete() {
    if (!deleteConfirm) return;
    const { item } = deleteConfirm;
    await deleteSchedule(item.schedule.id);
    await deleteFutureDoseEvents(item.schedule.id);
    await cancelForSchedule(item.schedule.id);
    setItems((prev) => prev.filter((i) => i.schedule.id !== item.schedule.id));
    setDeleteConfirm(null);
  }

  function handleDeleteAll() {
    const all = [...activeItems, ...pastItems];
    if (all.length === 0) return;
    setDeleteAllConfirm(true);
  }

  async function performDeleteAll() {
    const all = [...activeItems, ...pastItems];
    for (const item of all) {
      await deleteSchedule(item.schedule.id);
      await deleteFutureDoseEvents(item.schedule.id);
      await cancelForSchedule(item.schedule.id);
    }
    setItems([]);
    setDeleteAllConfirm(false);
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

  function confirmDeletePacket(packetItems: ScheduleItem[]) {
    setDeletePacketConfirm(packetItems);
  }

  async function performDeletePacket() {
    if (!deletePacketConfirm) return;
    for (const item of deletePacketConfirm) {
      await deleteSchedule(item.schedule.id);
      await deleteFutureDoseEvents(item.schedule.id);
      await cancelForSchedule(item.schedule.id);
    }
    const ids = new Set(deletePacketConfirm.map((i) => i.schedule.id));
    setItems((prev) => prev.filter((i) => !ids.has(i.schedule.id)));
    setDeletePacketConfirm(null);
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ActivityIndicator style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  function renderCard(item: ScheduleItem, isPast = false) {
    return (
      <View
        key={item.schedule.id}
        style={[styles.card, isPast && styles.cardPast]}
        testID={isPast ? `card-past-${item.schedule.id}` : `card-${item.schedule.id}`}
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
      </View>
    );
  }

  function renderPacketGroup(group: PacketGroup) {
    const times = [...new Set(group.items.flatMap((i) => i.schedule.times))].sort();
    const packetName = group.items.find((i) => i.schedule.packetName)?.schedule.packetName;
    const repSchedule = group.items[0].schedule;
    return (
      <View
        key={group.packetId}
        style={styles.packetCard}
      >
        {/* 포 그룹 헤더 — 약 종류는 노출하지 않고 일반 일정 카드처럼 시간·기간만 보여준다 */}
        <View style={styles.packetHeader}>
          <View style={styles.packetBadge}>
            <Text style={styles.packetBadgeText}>포</Text>
          </View>
          <Text style={styles.packetTitle} numberOfLines={1}>
            {packetName ? packetName : `${group.items.length}개 약 묶음`}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>⏰</Text>
          <Text style={styles.infoText}>{times.join('  ')}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📅</Text>
          <Text style={styles.infoText}>
            {repeatLabel(repSchedule)}　{dateRange(repSchedule)}
          </Text>
        </View>

        {/* 일반 일정 카드와 동일하게 수정/삭제 두 버튼만 노출 — 수정은 포 전체를 다루는 화면으로 이동 */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('PacketEdit', { packetId: group.packetId })}
          >
            <Text style={styles.editBtnTxt}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => confirmDeletePacket(group.items)}
          >
            <Text style={styles.deleteBtnTxt}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <FlatList
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
        renderItem={({ item: entry }) =>
          entry.kind === 'packet' ? renderPacketGroup(entry) : renderCard(entry.item)
        }
        ListFooterComponent={pastToggle}
      />

      <AlertModal
        visible={deleteConfirm !== null}
        icon="trash"
        tone="danger"
        title="일정 삭제"
        message={
          deleteConfirm
            ? deleteConfirm.isPast
              ? `'${deleteConfirm.item.medication.name}' 종료된 일정을 삭제하시겠어요?\n복용 기록은 유지됩니다.`
              : `'${deleteConfirm.item.medication.name}' 복용 일정을 삭제하시겠어요?\n미래 예약된 알림도 함께 취소됩니다.`
            : undefined
        }
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeleteConfirm(null) },
          { text: '삭제', style: 'destructive', onPress: performDelete },
        ]}
        onRequestClose={() => setDeleteConfirm(null)}
      />

      <AlertModal
        visible={deleteAllConfirm}
        icon="trash"
        tone="danger"
        title="전체 삭제"
        message={`등록된 복용 일정 ${activeItems.length + pastItems.length}건을 모두 삭제하시겠어요?\n미래 예약된 알림도 함께 취소되며, 삭제 후에는 되돌릴 수 없습니다.`}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeleteAllConfirm(false) },
          { text: '전체 삭제', style: 'destructive', onPress: performDeleteAll },
        ]}
        onRequestClose={() => setDeleteAllConfirm(false)}
      />

      <AlertModal
        visible={deletePacketConfirm !== null}
        icon="trash"
        tone="danger"
        title="포 일정 전체 삭제"
        message={
          deletePacketConfirm
            ? `포로 묶인 약 일정을 모두 삭제하시겠어요?\n(${deletePacketConfirm.map((i) => i.medication.name).join(', ')})\n미래 알림도 함께 취소됩니다.`
            : undefined
        }
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeletePacketConfirm(null) },
          { text: '전체 삭제', style: 'destructive', onPress: performDeletePacket },
        ]}
        onRequestClose={() => setDeletePacketConfirm(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 48 },

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

  pastToggle: { alignItems: 'center', paddingVertical: 14, marginBottom: 4 },
  pastToggleTxt: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  empty:     { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginBottom: 24 },
  addBtn:    { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  addBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
