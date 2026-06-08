import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation';
import type { MedicationScanResult } from '../../features/medicationScan/scanUtils';
import { DOSAGE_UNITS } from '../../features/medicationScan/scanUtils';
import { generateId, todayString } from '../../utils';
import { upsertMedication, upsertSchedule } from '../../db';
import { scheduleForSchedule } from '../../notifications';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store';

type Nav   = StackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ScanResult'>;

const WITH_FOOD_LABELS = { before: '식전', after: '식후', none: '무관' } as const;

export default function ScanResultScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const [items, setItems] = useState<MedicationScanResult[]>(params.results);
  const [tabIndex, setTabIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [packetItems, setPacketItems] = useState<Set<number>>(
    () => new Set(params.results.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);

  // 저장 완료 전 뒤로가기 방지
  const savedRef = useRef(false);
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current) return;
      e.preventDefault();
      Alert.alert(
        '스캔 결과가 사라집니다',
        '지금 나가면 인식된 약 정보가 모두 사라집니다.\n정말 나가시겠어요?',
        [
          { text: '계속 등록', style: 'cancel' },
          {
            text: '나가기',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
  }, [navigation]);

  const currentItem = items[tabIndex];

  function updateField<K extends keyof MedicationScanResult>(
    key: K,
    value: MedicationScanResult[K],
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === tabIndex ? { ...item, [key]: value } : item)),
    );
  }

  function toggleTime(t: string) {
    const times = currentItem.suggestedTimes;
    const next  = times.includes(t)
      ? times.filter((x) => x !== t)
      : [...times, t].sort();
    updateField('suggestedTimes', next);
  }

  function toggleSkip() {
    setSkipped((prev) => {
      const s = new Set(prev);
      s.has(tabIndex) ? s.delete(tabIndex) : s.add(tabIndex);
      return s;
    });
  }

  async function handleCreate() {
    const userId   = useAuthStore.getState().userId ?? 'local';
    const settings = useSettingsStore.getState().settings;

    const toCreate = items.filter((_, i) => !skipped.has(i));
    if (toCreate.length === 0) {
      Alert.alert('알림', '건너뛰지 않은 약이 없습니다.');
      return;
    }

    // 2개 이상 체크된 경우에만 포 그룹 생성
    const activePacketIndices = [...packetItems].filter((i) => !skipped.has(i));
    const sharedPacketId = activePacketIndices.length >= 2 ? generateId() : undefined;

    setSaving(true);
    try {
      for (const [origIdx, item] of items.entries()) {
        if (skipped.has(origIdx) || !item.medicationName.trim()) continue;

        const today = todayString();
        const endDate = item.durationDays
          ? (() => {
              const d = new Date(today + 'T00:00:00');
              d.setDate(d.getDate() + item.durationDays! - 1);
              return d.toISOString().slice(0, 10);
            })()
          : undefined;

        const medicationId = generateId();
        const scheduleId   = generateId();
        const now          = new Date().toISOString();

        await upsertMedication(
          {
            id:          medicationId,
            name:        item.medicationName.trim(),
            dosageValue: item.dosageValue,
            dosageUnit:  item.dosageUnit,
            isActive:    true,
            createdAt:   now,
            updatedAt:   now,
          },
          userId,
        );

        const packetId = sharedPacketId && activePacketIndices.includes(origIdx)
          ? sharedPacketId
          : undefined;

        const schedule = {
          id:           scheduleId,
          medicationId,
          scheduleType: 'fixed' as const,
          startDate:    today,
          endDate,
          times:        item.suggestedTimes.length > 0 ? item.suggestedTimes : ['08:00'],
          withFood:     item.withFood ?? ('none' as const),
          graceMinutes: 120,
          isActive:     true,
          packetId,
          createdAt:    now,
          updatedAt:    now,
        };

        await upsertSchedule(schedule, userId);

        if (settings) {
          const med = { id: medicationId, name: item.medicationName.trim(), isActive: true, createdAt: now, updatedAt: now };
          await scheduleForSchedule(schedule, med, settings);
        }
      }

      savedRef.current = true;
      Alert.alert(
        '일정 등록 완료',
        `${toCreate.length}개 약 일정이 등록되었습니다.`,
        [{ text: '확인', onPress: () => navigation.popToTop() }],
      );
    } catch {
      Alert.alert('오류', '일정 등록 중 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  if (!currentItem) return null;

  const isSkipped = skipped.has(tabIndex);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {/* 탭 */}
      {items.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
          {items.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.tab, tabIndex === i && styles.tabActive, skipped.has(i) && styles.tabSkipped]}
              onPress={() => setTabIndex(i)}
            >
              <Text style={[styles.tabText, tabIndex === i && styles.tabTextActive]} numberOfLines={1}>
                {skipped.has(i) ? '✕ ' : ''}{item.medicationName || `약 ${i + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.content}>

        <View style={[styles.fieldGroup, isSkipped && styles.dimmed]}>
          {/* 약 이름 */}
          <FieldLabel label="약 이름 *" />
          <TextInput
            style={styles.input}
            value={currentItem.medicationName}
            onChangeText={(v) => updateField('medicationName', v)}
            placeholder="약 이름 입력"
            editable={!isSkipped}
          />

          {/* 용량 */}
          <FieldLabel label="용량" />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 8 }]}
              value={currentItem.dosageValue != null ? String(currentItem.dosageValue) : ''}
              onChangeText={(v) => updateField('dosageValue', v ? Number(v) : undefined)}
              keyboardType="numeric"
              placeholder="숫자"
              editable={!isSkipped}
            />
            {DOSAGE_UNITS.map((unit) => (
              <TouchableOpacity
                key={unit}
                style={[
                  styles.unitBtn,
                  currentItem.dosageUnit === unit && styles.unitBtnActive,
                  isSkipped && { opacity: 0.4 },
                ]}
                onPress={() => !isSkipped && updateField('dosageUnit', currentItem.dosageUnit === unit ? undefined : unit)}
              >
                <Text style={[styles.unitBtnText, currentItem.dosageUnit === unit && styles.unitBtnTextActive]}>
                  {unit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 복용 시간 */}
          <FieldLabel label="복용 시간" />
          <View style={styles.timesRow}>
            {['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00',
              '14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'].map((t) => {
              const selected = currentItem.suggestedTimes.includes(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.timePill, selected && styles.timePillActive]}
                  onPress={() => !isSkipped && toggleTime(t)}
                >
                  <Text style={[styles.timePillText, selected && styles.timePillTextActive]}>
                    {t.slice(0, 2)}시
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 복용 기간 */}
          <FieldLabel label="복용 기간 (일)" />
          <TextInput
            style={styles.input}
            value={currentItem.durationDays != null ? String(currentItem.durationDays) : ''}
            onChangeText={(v) => updateField('durationDays', v ? Number(v) : undefined)}
            keyboardType="numeric"
            placeholder="예: 5 (비워두면 상시)"
            editable={!isSkipped}
          />

          {/* 식전/식후 */}
          <FieldLabel label="식전/식후" />
          <View style={styles.row}>
            {(['before', 'after', 'none'] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.segBtn, currentItem.withFood === opt && styles.segBtnActive]}
                onPress={() => !isSkipped && updateField('withFood', opt)}
              >
                <Text style={[styles.segBtnText, currentItem.withFood === opt && styles.segBtnTextActive]}>
                  {WITH_FOOD_LABELS[opt]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 메모 */}
          {currentItem.note ? (
            <>
              <FieldLabel label="특이사항" />
              <Text style={styles.noteText}>{currentItem.note}</Text>
            </>
          ) : null}
        </View>

        {/* 건너뛰기 토글 */}
        <TouchableOpacity style={styles.skipBtn} onPress={toggleSkip}>
          <Text style={[styles.skipBtnText, isSkipped && { color: '#3b82f6' }]}>
            {isSkipped ? '이 약 포함하기' : '이 약 건너뛰기'}
          </Text>
        </TouchableOpacity>

        {/* 포 그룹화 */}
        {items.length >= 2 && (
          <View style={styles.packetSection}>
            <View style={styles.packetTitleRow}>
              <Text style={styles.packetTitle}>💊 한 포로 묶기</Text>
              <Text style={styles.packetHint}>
                체크된 약은 홈에서 한 번에 복용 체크돼요
              </Text>
            </View>
            {items.map((item, i) => {
              const isItemSkipped = skipped.has(i);
              const inPacket = packetItems.has(i);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.packetRow, isItemSkipped && styles.packetRowDisabled]}
                  onPress={() => {
                    if (isItemSkipped) return;
                    setPacketItems((prev) => {
                      const next = new Set(prev);
                      next.has(i) ? next.delete(i) : next.add(i);
                      return next;
                    });
                  }}
                  disabled={isItemSkipped}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, inPacket && !isItemSkipped && styles.checkboxChecked]}>
                    {inPacket && !isItemSkipped && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.packetItemName, isItemSkipped && styles.packetItemDisabled]} numberOfLines={1}>
                    {item.medicationName || `약 ${i + 1}`}
                  </Text>
                  {isItemSkipped && <Text style={styles.skippedLabel}>건너뜀</Text>}
                </TouchableOpacity>
              );
            })}
            {[...packetItems].filter((i) => !skipped.has(i)).length < 2 && (
              <Text style={styles.packetWarning}>
                2개 이상 선택해야 포로 묶입니다
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        <Text style={styles.footerHint}>
          {items.length - skipped.size}개 약 일정 등록 예정
        </Text>
        <TouchableOpacity
          style={[styles.createBtn, saving && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={saving}
        >
          <Text style={styles.createBtnText}>
            {saving ? '저장 중...' : `${items.length - skipped.size}개 일정 만들기`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },

  tabScroll:   { backgroundColor: '#fff', maxHeight: 52, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tabContent:  { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', maxWidth: 150 },
  tabActive:   { backgroundColor: '#3b82f6' },
  tabSkipped:  { backgroundColor: '#e5e7eb', opacity: 0.6 },
  tabText:     { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#fff', fontWeight: '600' },

  content:    { padding: 20, paddingBottom: 120 },
  fieldGroup: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 4 },
  dimmed:     { opacity: 0.4 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 12, marginBottom: 4 },

  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  row: { flexDirection: 'row', alignItems: 'center' },

  unitBtn:          { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', marginLeft: 6 },
  unitBtnActive:    { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  unitBtnText:      { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  unitBtnTextActive:{ color: '#fff' },

  timesRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  timePill:          { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  timePillActive:    { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  timePillText:      { fontSize: 12, fontWeight: '500', color: '#6b7280' },
  timePillTextActive:{ color: '#fff' },

  segBtn:        { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginRight: 6, backgroundColor: '#f9fafb' },
  segBtnActive:  { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  segBtnText:    { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  segBtnTextActive: { color: '#fff', fontWeight: '700' },

  noteText: { fontSize: 13, color: '#6b7280', lineHeight: 20, marginTop: 4 },

  skipBtn:     { alignSelf: 'center', marginTop: 16 },
  skipBtnText: { fontSize: 14, color: '#ef4444', fontWeight: '500' },

  packetSection: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e0eaff',
  },
  packetTitleRow: { marginBottom: 12 },
  packetTitle:    { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  packetHint:     { fontSize: 12, color: '#6b7280' },
  packetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  packetRowDisabled: { opacity: 0.4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#d1d5db',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6', borderColor: '#3b82f6',
  },
  checkmark:         { fontSize: 13, color: '#fff', fontWeight: '800' },
  packetItemName:    { flex: 1, fontSize: 14, fontWeight: '500', color: '#374151' },
  packetItemDisabled:{ color: '#9ca3af' },
  skippedLabel:      { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  packetWarning:     { fontSize: 12, color: '#f59e0b', marginTop: 8, textAlign: 'center' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
    paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 24,
    gap: 8,
  },
  footerHint:    { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  createBtn:     { backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
