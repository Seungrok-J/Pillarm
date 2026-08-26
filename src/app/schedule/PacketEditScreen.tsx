/**
 * PacketEditScreen — 포(packet) 전체를 하나의 단위로 수정
 *
 * 포는 DB상으로는 여전히 약(medication)마다 별도의 Schedule row지만(packetId로 묶임),
 * 사용자 입장에서는 "포"가 하나의 일정처럼 보이고 다뤄져야 한다.
 * 이 화면에서: 포 이름/복용 시간/기간을 한 번에 수정(모든 멤버에 동기화),
 * 멤버 약을 추가/제거할 수 있다.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation';
import {
  getAllSchedules, getAllMedications, upsertSchedule, deleteSchedule, deleteFutureDoseEvents,
} from '../../db';
import { cancelForSchedule, scheduleForSchedule } from '../../notifications';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store';
import { isSyncEnabled, pushSchedule } from '../../sync/syncService';
import { todayString } from '../../utils';
import type { Schedule, Medication } from '../../domain';
import AlertModal from '../../components/AlertModal';
import TimePickerList from '../../components/TimePickerList';

type Nav   = StackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'PacketEdit'>;

interface Member {
  schedule:   Schedule;
  medication: Medication;
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

// ── DatePickerField ───────────────────────────────────────────────────────────

function DatePickerField({
  value, onChange, placeholder, minimumDate,
}: { value: string; onChange: (v: string) => void; placeholder: string; minimumDate?: Date }) {
  const [show,     setShow]     = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  function openPicker() {
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
        } else if (selected) {
          setTempDate(selected);
        }
      }}
    />
  );

  return (
    <>
      <TouchableOpacity style={dateStyles.btn} onPress={openPicker} accessibilityRole="button">
        <Text
          style={value ? dateStyles.valueTxt : dateStyles.placeholderTxt}
          numberOfLines={1}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
        <Text style={dateStyles.icon}>📅</Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <View style={dateStyles.overlay}>
            <View style={dateStyles.sheet}>
              <View style={dateStyles.toolbar}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={dateStyles.cancelTxt}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { onChange(toLocalDateString(tempDate)); setShow(false); }}>
                  <Text style={dateStyles.confirmTxt}>확인</Text>
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

// ── 메인 화면 ─────────────────────────────────────────────────────────────────

export default function PacketEditScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { packetId } = params;

  const [members,   setMembers]   = useState<Member[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [isSaving,   setIsSaving]   = useState(false);

  const [packetName, setPacketName] = useState('');
  const [times,       setTimes]       = useState<string[]>([]);
  const [startDate,   setStartDate]   = useState(todayString());
  const [endDate,     setEndDate]     = useState('');

  const [removeConfirm, setRemoveConfirm] = useState<Member | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const uid = useAuthStore.getState().userId ?? 'local';
    const [schedules, meds] = await Promise.all([getAllSchedules(uid), getAllMedications(uid)]);
    const medMap = new Map(meds.map((m) => [m.id, m]));
    const list: Member[] = schedules
      .filter((s) => s.packetId === packetId)
      .map((s) => ({ schedule: s, medication: medMap.get(s.medicationId)! }))
      .filter((m) => m.medication != null);
    setMembers(list);
    if (list.length > 0) {
      setPacketName(list[0]!.schedule.packetName ?? '');
      setTimes(list[0]!.schedule.times);
      setStartDate(list[0]!.schedule.startDate);
      setEndDate(list[0]!.schedule.endDate ?? '');
    }
    setIsLoading(false);
  }, [packetId]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      loadData();
    }, [loadData]),
  );

  /** 포 이름·시간·기간을 모든 멤버 Schedule에 동기화 저장한다. (약 추가 전에도 먼저 호출해 최신 상태를 유지) */
  async function syncSharedFields(): Promise<void> {
    const uid = useAuthStore.getState().userId ?? 'local';
    const settings = useSettingsStore.getState().settings;
    const now = new Date().toISOString();
    for (const { schedule, medication } of members) {
      const updated: Schedule = {
        ...schedule,
        packetName: packetName.trim() || undefined,
        times,
        startDate,
        endDate: endDate || undefined,
        updatedAt: now,
      };
      await upsertSchedule(updated, uid);
      await deleteFutureDoseEvents(updated.id);
      if (settings) await scheduleForSchedule(updated, medication, settings);
      if (isSyncEnabled()) pushSchedule(updated).catch(() => {});
    }
  }

  async function handleSave() {
    if (times.length === 0) {
      setErrorMsg('복용 시간을 최소 1개 추가해주세요');
      return;
    }
    setIsSaving(true);
    try {
      await syncSharedFields();
      navigation.goBack();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddMedication() {
    if (times.length === 0) {
      setErrorMsg('약을 추가하기 전에 복용 시간을 먼저 설정해주세요');
      return;
    }
    setIsSaving(true);
    try {
      await syncSharedFields();
      navigation.navigate('ScheduleNew', {
        presetPacket: { packetId, packetName: packetName.trim() || undefined, times, startDate, endDate: endDate || undefined },
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmRemoveMember() {
    if (!removeConfirm) return;
    const uid = useAuthStore.getState().userId ?? 'local';
    const settings = useSettingsStore.getState().settings;
    const now = new Date().toISOString();

    // 남는 멤버가 1개 이하가 되면 포 자체가 무의미하므로 전부 포에서 해제한다
    const remaining = members.filter((m) => m.schedule.id !== removeConfirm.schedule.id);
    const toDetach = remaining.length <= 1 ? [removeConfirm, ...remaining] : [removeConfirm];

    for (const { schedule, medication } of toDetach) {
      const updated: Schedule = { ...schedule, packetId: undefined, packetName: undefined, updatedAt: now };
      await upsertSchedule(updated, uid);
      await deleteFutureDoseEvents(updated.id);
      if (settings) await scheduleForSchedule(updated, medication, settings);
      if (isSyncEnabled()) pushSchedule(updated).catch(() => {});
    }
    setRemoveConfirm(null);

    if (remaining.length <= 1) {
      navigation.goBack();
    } else {
      await loadData();
    }
  }

  async function confirmDeleteAll() {
    for (const { schedule } of members) {
      await deleteSchedule(schedule.id);
      await deleteFutureDoseEvents(schedule.id);
      await cancelForSchedule(schedule.id);
    }
    setDeleteAllConfirm(false);
    navigation.goBack();
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['bottom']}>
      <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.label}>포 이름<Text style={styles.required}> *</Text></Text>
        <TextInput
          style={styles.input}
          value={packetName}
          onChangeText={setPacketName}
          placeholder="예: 아침저녁약(식후)"
          maxLength={20}
        />

        <View style={[styles.sectionHeaderRow, { marginTop: 16 }]}>
          <Text style={styles.label}>복용 시간<Text style={styles.required}> *</Text></Text>
          <Text style={styles.sectionHint}>모든 약에 공통 적용</Text>
        </View>
        <TimePickerList
          times={times}
          onAdd={(t) => setTimes((prev) => [...prev, t].sort())}
          onRemove={(t) => setTimes((prev) => prev.filter((x) => x !== t))}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>시작일<Text style={styles.required}> *</Text></Text>
            <DatePickerField
              value={startDate}
              onChange={(v) => {
                setStartDate(v);
                if (endDate && endDate < v) setEndDate(addDays(v, 7));
              }}
              placeholder="시작일 선택"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>종료일</Text>
            <DatePickerField
              value={endDate}
              onChange={setEndDate}
              placeholder="상시"
              minimumDate={new Date(startDate + 'T00:00:00')}
            />
          </View>
        </View>

        {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        <Text style={[styles.label, { marginTop: 20 }]}>포함된 약 ({members.length}개)</Text>
        {members.map((m) => (
          <View key={m.schedule.id} style={styles.memberRow}>
            <View style={[styles.colorDot, { backgroundColor: m.medication.color ?? '#d1d5db' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName} numberOfLines={1}>{m.medication.name}</Text>
              {m.medication.dosageValue != null && (
                <Text style={styles.memberDosage}>
                  {m.medication.dosageValue}{m.medication.dosageUnit ?? ''}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.memberEditBtn}
              onPress={() =>
                navigation.navigate('ScheduleEdit', {
                  scheduleId: m.schedule.id,
                  medicationId: m.medication.id,
                })
              }
            >
              <Text style={styles.memberEditTxt}>수정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.memberRemoveBtn}
              onPress={() => setRemoveConfirm(m)}
            >
              <Text style={styles.memberRemoveTxt}>빼기</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={handleAddMedication} disabled={isSaving}>
          <Text style={styles.addBtnTxt}>＋ 이 포에 약 추가</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>저장</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAllBtn} onPress={() => setDeleteAllConfirm(true)}>
          <Text style={styles.deleteAllTxt}>포 전체 삭제</Text>
        </TouchableOpacity>
      </ScrollView>

      <AlertModal
        visible={removeConfirm !== null}
        icon="remove-circle-outline"
        tone="warning"
        title="포에서 빼기"
        message={
          removeConfirm
            ? `'${removeConfirm.medication.name}'을(를) 이 포에서 빼고 개별 일정으로 둘까요?` +
              (members.length <= 2 ? '\n(약이 1개만 남으면 포가 자동으로 해제돼요)' : '')
            : undefined
        }
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setRemoveConfirm(null) },
          { text: '빼기', style: 'destructive', onPress: confirmRemoveMember },
        ]}
      />

      <AlertModal
        visible={deleteAllConfirm}
        icon="trash"
        tone="danger"
        title="포 전체 삭제"
        message={`포함된 약 ${members.length}개 일정을 모두 삭제하시겠어요?\n미래 알림도 함께 취소되며, 삭제 후에는 되돌릴 수 없습니다.`}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeleteAllConfirm(false) },
          { text: '전체 삭제', style: 'destructive', onPress: confirmDeleteAll },
        ]}
      />
    </SafeAreaView>
  );
}

const dateStyles = {
  btn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#fff', marginBottom: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  valueTxt:       { fontSize: 16, color: '#111827' },
  placeholderTxt: { fontSize: 16, color: '#9ca3af' },
  icon: { fontSize: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  toolbar: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  cancelTxt:  { fontSize: 16, color: '#6b7280' },
  confirmTxt: { fontSize: 16, color: '#3b82f6', fontWeight: '600' as const },
};

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '700', marginBottom: 8, color: '#111827' },
  required: { color: '#ef4444' },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  sectionHint: { fontSize: 12, color: '#9ca3af' },
  input: {
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 4, color: '#111827',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  errorText: { color: '#ef4444', fontSize: 12, marginBottom: 8, marginTop: 2 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  memberName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  memberDosage: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  memberEditBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#3b82f6', minHeight: 44, justifyContent: 'center', alignItems: 'center',
  },
  memberEditTxt: { fontSize: 13, color: '#3b82f6', fontWeight: '700' },
  memberRemoveBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#fef2f2', minHeight: 44, justifyContent: 'center', alignItems: 'center',
  },
  memberRemoveTxt: { fontSize: 13, color: '#ef4444', fontWeight: '700' },

  addBtn: {
    marginTop: 4, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: '#3b82f6', borderStyle: 'dashed', alignItems: 'center',
  },
  addBtnTxt: { fontSize: 14, fontWeight: '700', color: '#3b82f6' },

  saveBtn: {
    marginTop: 24, backgroundColor: '#3b82f6', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },

  deleteAllBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  deleteAllTxt: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
});
