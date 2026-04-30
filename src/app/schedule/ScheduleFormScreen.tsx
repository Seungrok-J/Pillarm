import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import type { Medication, Schedule, WithFood } from '../../domain';
import { generateId, todayString } from '../../utils';
import {
  upsertMedication,
  upsertSchedule,
  getMedicationById,
  getScheduleById,
  deleteFutureDoseEvents,
} from '../../db';
import { scheduleForSchedule } from '../../notifications';
import { useSettingsStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import ColorPalette from '../../components/ColorPalette';
import TimePickerList from '../../components/TimePickerList';
import MedicationSearchInput from '../../features/medicationDB/MedicationSearchInput';
import type { MedicationSearchResult } from '../../features/medicationDB/MedicationSearchInput';

type Nav = StackNavigationProp<RootStackParamList>;

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

interface DatePickerFieldProps {
  testID: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minimumDate?: Date;
}

function DatePickerField({ testID, value, onChange, placeholder, minimumDate }: DatePickerFieldProps) {
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
        } else {
          if (selected) setTempDate(selected);
        }
      }}
    />
  );

  return (
    <>
      <TouchableOpacity
        testID={testID}
        style={dateStyles.btn}
        onPress={openPicker}
        accessibilityRole="button"
      >
        <Text style={value ? dateStyles.valueTxt : dateStyles.placeholderTxt}>
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
                <TouchableOpacity onPress={() => {
                  onChange(toLocalDateString(tempDate));
                  setShow(false);
                }}>
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

const dateStyles = {
  btn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  valueTxt:       { fontSize: 16, color: '#111827' },
  placeholderTxt: { fontSize: 16, color: '#9ca3af' },
  icon: { fontSize: 18 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36,
  },
  toolbar: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  cancelTxt:  { fontSize: 16, color: '#6b7280' },
  confirmTxt: { fontSize: 16, color: '#3b82f6', fontWeight: '600' as const },
};

type RouteParams =
  | undefined
  | { scheduleId: string; medicationId: string; suggestedTime?: string };

const DOSAGE_UNITS = ['mg', '정', 'mL'] as const;
type DosageUnit = (typeof DOSAGE_UNITS)[number];

const DAYS_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const;

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

interface FormErrors {
  name?: string;
  times?: string;
  endDate?: string;
  _form?: string;
}

export default function ScheduleFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const params = route.params as RouteParams;
  const isEdit = !!params?.scheduleId;

  const [medicationId] = useState(() => params?.medicationId ?? generateId());
  const [scheduleId] = useState(() => params?.scheduleId ?? generateId());
  const [medCreatedAt, setMedCreatedAt] = useState(() => new Date().toISOString());
  const [schedCreatedAt, setSchedCreatedAt] = useState(() => new Date().toISOString());

  const [name, setName] = useState('');
  const [dosageValue, setDosageValue] = useState('');
  const [dosageUnit, setDosageUnit] = useState<DosageUnit>('mg');
  const [color, setColor] = useState<string | undefined>();
  const [times, setTimes] = useState<string[]>([]);
  const [repeatType, setRepeatType] = useState<'daily' | 'weekly'>('daily');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(todayString());
  const [endDate,   setEndDate]   = useState(() => addDays(todayString(), 7));
  const [withFood, setWithFood] = useState<WithFood>('none');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEdit);

  const settings = useSettingsStore((s) => s.settings) ?? FALLBACK_SETTINGS;

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const [med, sched] = await Promise.all([
          getMedicationById(params!.medicationId),
          getScheduleById(params!.scheduleId),
        ]);
        if (med) {
          setName(med.name);
          setDosageValue(med.dosageValue != null ? String(med.dosageValue) : '');
          setDosageUnit((med.dosageUnit as DosageUnit) ?? 'mg');
          setColor(med.color);
          setMedCreatedAt(med.createdAt);
        }
        if (sched) {
          const baseTimes = sched.times;
          const suggested = (params as { suggestedTime?: string })?.suggestedTime;
          setTimes(suggested ? [suggested, ...baseTimes.filter((t) => t !== suggested)] : baseTimes);
          setStartDate(sched.startDate);
          setEndDate(sched.endDate ?? '');
          setWithFood(sched.withFood);
          setSchedCreatedAt(sched.createdAt);
          if (sched.daysOfWeek) {
            setRepeatType('weekly');
            setSelectedDays(sched.daysOfWeek);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!name.trim()) {
      errs.name = '약 이름을 입력해주세요';
    } else if (name.trim().length > 50) {
      errs.name = '약 이름은 최대 50자입니다';
    }
    if (times.length === 0) {
      errs.times = '복용 시간을 최소 1개 추가해주세요';
    }
    if (endDate && endDate < startDate) {
      errs.endDate = '종료일은 시작일 이후여야 합니다';
    }
    return errs;
  }

  async function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setIsSaving(true);
    try {
      const now = new Date().toISOString();

      // Step 1 — Medication upsert
      const med: Medication = {
        id: medicationId,
        name: name.trim(),
        dosageValue: dosageValue ? parseFloat(dosageValue) : undefined,
        dosageUnit: dosageValue ? dosageUnit : undefined,
        color,
        isActive: true,
        createdAt: medCreatedAt,
        updatedAt: now,
      };
      await upsertMedication(med, useAuthStore.getState().userId ?? 'local');

      // Step 2 — Schedule upsert
      const sched: Schedule = {
        id: scheduleId,
        medicationId,
        scheduleType: 'fixed',
        startDate,
        endDate: endDate || undefined,
        daysOfWeek: repeatType === 'weekly' ? selectedDays : undefined,
        times,
        withFood,
        graceMinutes: 120,
        isActive: true,
        createdAt: schedCreatedAt,
        updatedAt: now,
      };
      await upsertSchedule(sched, useAuthStore.getState().userId ?? 'local');

      // Step 3 — 수정 시 기존 미래 DoseEvent 삭제
      if (isEdit) {
        await deleteFutureDoseEvents(scheduleId);
      }

      // Step 4+5 — 알림 취소 → DoseEvent 생성 → 알림 재등록
      await scheduleForSchedule(sched, med, settings);

      // Step 6 — 홈으로 이동
      navigation.navigate('Main');
    } catch {
      setErrors({ _form: '저장 중 오류가 발생했습니다' });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 20 }}>
      {/* ── 약 이름 (자동완성) ── */}
      <Text style={styles.label}>약 이름 *</Text>
      <MedicationSearchInput
        testID="input-name"
        value={name}
        onChange={setName}
        placeholder="예: 혈압약"
        onSelect={(result: MedicationSearchResult) => {
          setName(result.itemName);
          if (result.dosageValue != null) {
            setDosageValue(String(result.dosageValue));
          }
          if (result.dosageUnit) {
            const valid = DOSAGE_UNITS as readonly string[];
            if (valid.includes(result.dosageUnit)) {
              setDosageUnit(result.dosageUnit as DosageUnit);
            }
          }
        }}
      />
      {!!errors.name && (
        <Text testID="error-name" style={styles.errorText}>{errors.name}</Text>
      )}

      {/* ── 용량 ── */}
      <Text style={[styles.label, { marginTop: 16 }]}>용량</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput
          testID="input-dosage-value"
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={dosageValue}
          onChangeText={setDosageValue}
          placeholder="500"
          keyboardType="numeric"
        />
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {DOSAGE_UNITS.map((unit) => (
            <TouchableOpacity
              key={unit}
              testID={`btn-unit-${unit}`}
              onPress={() => setDosageUnit(unit)}
              style={[styles.segBtn, dosageUnit === unit && styles.segBtnActive]}
            >
              <Text style={dosageUnit === unit ? styles.segTxtActive : styles.segTxt}>{unit}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── 색상 ── */}
      <Text style={styles.label}>색상</Text>
      <ColorPalette selected={color} onSelect={setColor} />

      {/* ── 복용 시간 ── */}
      <Text style={[styles.label, { marginTop: 16 }]}>복용 시간 *</Text>
      <TimePickerList
        times={times}
        onAdd={(t) => setTimes((prev) => [...prev, t].sort())}
        onRemove={(t) => setTimes((prev) => prev.filter((x) => x !== t))}
      />
      {!!errors.times && (
        <Text testID="error-times" style={styles.errorText}>{errors.times}</Text>
      )}

      {/* ── 반복 ── */}
      <Text style={[styles.label, { marginTop: 16 }]}>반복</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(['daily', 'weekly'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            testID={`btn-repeat-${type}`}
            onPress={() => setRepeatType(type)}
            style={[styles.segBtn, { flex: 1 }, repeatType === type && styles.segBtnActive]}
          >
            <Text style={repeatType === type ? styles.segTxtActive : styles.segTxt}>
              {type === 'daily' ? '매일' : '요일 선택'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 요일 선택 ── */}
      {repeatType === 'weekly' && (
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
          {DAYS_LABEL.map((label, idx) => (
            <TouchableOpacity
              key={idx}
              testID={`btn-day-${idx}`}
              onPress={() => toggleDay(idx)}
              style={[styles.dayBtn, selectedDays.includes(idx) && styles.segBtnActive]}
            >
              <Text style={[{ fontSize: 12 }, selectedDays.includes(idx) ? styles.segTxtActive : styles.segTxt]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── 시작일 ── */}
      <Text style={styles.label}>시작일 *</Text>
      <DatePickerField
        testID="input-start-date"
        value={startDate}
        onChange={(v) => {
          setStartDate(v);
          if (endDate && endDate < v) setEndDate(addDays(v, 7));
        }}
        placeholder="시작일 선택"
      />

      {/* ── 종료일 ── */}
      <Text style={[styles.label, { marginTop: 8 }]}>종료일</Text>
      <DatePickerField
        testID="input-end-date"
        value={endDate}
        onChange={setEndDate}
        placeholder="종료일 선택"
        minimumDate={new Date(startDate + 'T00:00:00')}
      />
      {!!errors.endDate && (
        <Text testID="error-endDate" style={styles.errorText}>{errors.endDate}</Text>
      )}

      {/* ── 식전/식후 ── */}
      <Text style={[styles.label, { marginTop: 16 }]}>식사 관계</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        {(['none', 'before', 'after'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            testID={`btn-withFood-${type}`}
            onPress={() => setWithFood(type)}
            style={[styles.segBtn, { flex: 1 }, withFood === type && styles.segBtnActive]}
          >
            <Text style={withFood === type ? styles.segTxtActive : styles.segTxt}>
              {type === 'none' ? '무관' : type === 'before' ? '식전' : '식후'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 폼 에러 ── */}
      {!!errors._form && (
        <Text testID="error-form" style={styles.errorText}>{errors._form}</Text>
      )}

      {/* ── 저장 ── */}
      <TouchableOpacity
        testID="btn-save"
        onPress={handleSave}
        disabled={isSaving}
        style={{ backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 }}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>저장</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = {
  label: { fontSize: 15, fontWeight: '500' as const, marginBottom: 6, color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 4,
    color: '#111827',
  },
  errorText: { color: '#ef4444', fontSize: 12, marginBottom: 8, marginTop: 2 },
  segBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  segBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  segTxt: { color: '#374151' },
  segTxtActive: { color: '#fff' },
  dayBtn: {
    flex: 1,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    alignItems: 'center' as const,
  },
};
