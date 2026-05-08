import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
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

type Nav = StackNavigationProp<RootStackParamList>;

const DAYS_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

interface ScheduleItem {
  schedule: Schedule;
  medication: Medication;
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
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
        {/* 약 이름 + 색상 점 */}
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

        {/* 복용 시간 */}
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>⏰</Text>
          <Text style={[styles.infoText, isPast && styles.textMuted]}>
            {item.schedule.times.join('  ')}
          </Text>
        </View>

        {/* 반복 주기 + 기간 */}
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📅</Text>
          <Text style={[styles.infoText, isPast && styles.textMuted]}>
            {repeatLabel(item.schedule)}　{dateRange(item.schedule)}
          </Text>
        </View>

        {/* 식사 관계 */}
        {item.schedule.withFood !== 'none' && (
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🍽️</Text>
            <Text style={[styles.infoText, isPast && styles.textMuted]}>
              {item.schedule.withFood === 'before' ? '식전 복용' : '식후 복용'}
            </Text>
          </View>
        )}

        {/* 버튼 */}
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
              accessibilityRole="button"
              accessibilityLabel={`${item.medication.name} 일정 수정`}
            >
              <Text style={styles.editBtnTxt}>수정</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.deleteBtn, isPast && styles.deleteBtnFull]}
            onPress={() => confirmDelete(item, isPast)}
            accessibilityRole="button"
            accessibilityLabel={`${item.medication.name} 일정 삭제`}
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
        accessibilityRole="button"
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
      <FlatList
        data={activeItems}
        keyExtractor={(item) => item.schedule.id}
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
        renderItem={({ item }) => renderCard(item)}
        ListFooterComponent={pastToggle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 48 },

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  medName: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827' },
  dosage: { fontSize: 13, color: '#6b7280' },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  infoIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  infoText: { fontSize: 14, color: '#374151', flex: 1 },

  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  editBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3b82f6',
    alignItems: 'center',
  },
  editBtnTxt: { fontSize: 15, color: '#3b82f6', fontWeight: '600' },
  deleteBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
  },
  deleteBtnTxt: { fontSize: 15, color: '#ef4444', fontWeight: '600' },

  cardPast: { backgroundColor: '#f9fafb', opacity: 0.85 },
  textMuted: { color: '#9ca3af' },

  endedBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 4,
  },
  endedBadgeTxt: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },

  deleteBtnFull: { flex: 1 },

  pastToggle: {
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 4,
  },
  pastToggleTxt: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  empty: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginBottom: 24 },
  addBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  addBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
