import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useSettingsStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { rescheduleAllSchedules } from '../../notifications';
import type { UserSettings } from '../../domain';

type Nav = StackNavigationProp<RootStackParamList>;

// ── 인라인 Stepper ────────────────────────────────────────────────────────────

interface StepperProps {
  value: number;
  step: number;
  min: number;
  max: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  testID?: string;
}

function Stepper({ value, step, min, max, format, onChange, testID }: StepperProps) {
  return (
    <View style={styles.stepper} testID={testID}>
      <TouchableOpacity
        testID={testID ? `${testID}-dec` : undefined}
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        style={[styles.stepBtn, value <= min && styles.stepBtnDisabled]}
        accessibilityLabel="감소"
      >
        <Text style={styles.stepBtnText}>−</Text>
      </TouchableOpacity>
      <Text testID={testID ? `${testID}-value` : undefined} style={styles.stepValue}>
        {format(value)}
      </Text>
      <TouchableOpacity
        testID={testID ? `${testID}-inc` : undefined}
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        style={[styles.stepBtn, value >= max && styles.stepBtnDisabled]}
        accessibilityLabel="증가"
      >
        <Text style={styles.stepBtnText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 인라인 TimeInput ──────────────────────────────────────────────────────────

interface TimeInputProps {
  value: string;
  onSave: (v: string) => void;
  testID?: string;
}

function TimeInput({ value, onSave, testID }: TimeInputProps) {
  const [text, setText] = useState(value);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  function handleBlur() {
    const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(text);
    if (valid) {
      setHasError(false);
      if (text !== value) onSave(text);
    } else {
      setHasError(true);
      setText(value);
    }
  }

  return (
    <TextInput
      testID={testID}
      value={text}
      onChangeText={(t) => { setText(t); setHasError(false); }}
      onBlur={handleBlur}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      placeholder="HH:mm"
      style={[styles.timeInput, hasError && styles.timeInputError]}
    />
  );
}

// ── 화면 ──────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { settings, loadSettings, updateSettings } = useSettingsStore();
  const { isLoggedIn, userEmail, userName, clearSession } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [showQuietInfo, setShowQuietInfo] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await loadSettings();
    setRefreshing(false);
  }

  useEffect(() => {
    if (!settings) loadSettings();
  }, []);

  if (!settings) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator testID="loading-indicator" />
      </SafeAreaView>
    );
  }

  function requireLogin(then: () => void) {
    if (isLoggedIn) {
      then();
      return;
    }
    Alert.alert(
      '로그인이 필요합니다',
      '보호 그룹 기능을 사용하려면 먼저 로그인해 주세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '로그인하기', onPress: () => navigation.navigate('Login') },
      ],
    );
  }

  // 개별 설정 저장 — 조용한 시간 변경 시 재스케줄링
  async function saveSetting(patch: Partial<UserSettings>) {
    const updated = { ...settings!, ...patch };
    await updateSettings(updated);

    const quietChanged =
      'quietHoursStart' in patch || 'quietHoursEnd' in patch;
    if (quietChanged) {
      await rescheduleAllSchedules(updated);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="screen-settings"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
      }
    >
      {/* ── 조용한 시간 ──────────────────────────────────────────── */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitleInRow}>알림 설정</Text>
        <TouchableOpacity
          onPress={() => setShowQuietInfo(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="조용한 시간 설명 보기"
        >
          <Text style={styles.infoIcon}>ⓘ</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.label}>조용한 시간 시작</Text>
          <TimeInput
            testID="input-quiet-start"
            value={settings.quietHoursStart ?? '23:00'}
            onSave={(v) => saveSetting({ quietHoursStart: v })}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>조용한 시간 종료</Text>
          <TimeInput
            testID="input-quiet-end"
            value={settings.quietHoursEnd ?? '07:00'}
            onSave={(v) => saveSetting({ quietHoursEnd: v })}
          />
        </View>
      </View>

      {/* ── 미루기 설정 ──────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>미루기 설정</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.label}>기본 미루기 시간</Text>
          <Stepper
            testID="stepper-snooze-minutes"
            value={settings.defaultSnoozeMinutes}
            step={5}
            min={5}
            max={60}
            format={(v) => `${v}분`}
            onChange={(v) => saveSetting({ defaultSnoozeMinutes: v })}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>최대 미루기 횟수</Text>
          <Stepper
            testID="stepper-snooze-count"
            value={settings.maxSnoozeCount}
            step={1}
            min={1}
            max={5}
            format={(v) => `${v}회`}
            onChange={(v) => saveSetting({ maxSnoozeCount: v })}
          />
        </View>
      </View>

      {/* ── 식사 시간 ────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>식사 시간</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.label}>아침</Text>
          <TimeInput
            testID="input-meal-breakfast"
            value={settings.mealTimeBreakfast}
            onSave={(v) => saveSetting({ mealTimeBreakfast: v })}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>점심</Text>
          <TimeInput
            testID="input-meal-lunch"
            value={settings.mealTimeLunch}
            onSave={(v) => saveSetting({ mealTimeLunch: v })}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.label}>저녁</Text>
          <TimeInput
            testID="input-meal-dinner"
            value={settings.mealTimeDinner}
            onSave={(v) => saveSetting({ mealTimeDinner: v })}
          />
        </View>
      </View>

      {/* ── 누락 처리 ────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>누락 처리</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.label}>누락 자동 처리</Text>
          <Switch
            testID="switch-auto-missed"
            value={settings.autoMarkMissedEnabled}
            onValueChange={(v) => saveSetting({ autoMarkMissedEnabled: v })}
            trackColor={{ true: '#3b82f6', false: '#d1d5db' }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.labelBlock}>
            <Text style={styles.label}>누락 판정 기준</Text>
            <Text style={styles.hint}>예정 시간 이후 이 시간이 지나면 누락 처리</Text>
          </View>
          <Stepper
            testID="stepper-missed-minutes"
            value={settings.missedToLateMinutes}
            step={30}
            min={30}
            max={360}
            format={(v) => `${v}분`}
            onChange={(v) => saveSetting({ missedToLateMinutes: v })}
          />
        </View>
      </View>

      {/* ── 복용 일정 ────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>복용 일정</Text>
      <View style={styles.section}>
        <TouchableOpacity
          testID="btn-schedule-manage"
          style={styles.row}
          onPress={() => navigation.navigate('ScheduleManage')}
          accessibilityRole="button"
        >
          <Text style={styles.label}>복용 일정 관리</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── 보호자 공유 ─────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>보호자 공유</Text>
      <View style={styles.section}>
        <TouchableOpacity
          testID="btn-my-care-circle"
          style={styles.row}
          onPress={() => requireLogin(() => navigation.navigate('CareCircle'))}
          accessibilityRole="button"
        >
          <Text style={styles.label}>내 보호 그룹 관리</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          testID="btn-join-care-circle"
          style={styles.row}
          onPress={() => requireLogin(() => navigation.navigate('JoinCareCircle'))}
          accessibilityRole="button"
        >
          <Text style={styles.label}>보호 그룹 참여하기</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── 계정 ─────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>계정</Text>
      <View style={styles.section}>
        {isLoggedIn ? (
          <>
            <TouchableOpacity
              testID="btn-go-account"
              style={styles.row}
              onPress={() => navigation.navigate('Account')}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{userName || userEmail}</Text>
                {userName ? <Text style={styles.emailText}>{userEmail}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              testID="btn-logout"
              style={styles.row}
              onPress={clearSession}
              accessibilityRole="button"
            >
              <Text style={[styles.label, styles.logoutText]}>로그아웃</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              testID="btn-go-login"
              style={styles.row}
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
            >
              <Text style={styles.label}>로그인</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              testID="btn-go-signup"
              style={styles.row}
              onPress={() => navigation.navigate('Signup')}
              accessibilityRole="button"
            >
              <Text style={styles.label}>회원가입</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>

    {/* ── 조용한 시간 설명 모달 ────────────────────────────────── */}
    <Modal
      visible={showQuietInfo}
      transparent
      animationType="fade"
      onRequestClose={() => setShowQuietInfo(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowQuietInfo(false)}
      >
        <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
          <Text style={styles.modalTitle}>조용한 시간이란?</Text>
          <Text style={styles.modalBody}>
            설정한 시작·종료 시간 사이에는 알림이 울리지 않습니다.{'\n\n'}
            예를 들어 시작 23:00, 종료 07:00으로 설정하면 밤 11시부터 아침 7시 사이에 예정된 복용 알림은 종료 시간인 07:00으로 자동 조정됩니다.{'\n\n'}
            야간 수면을 방해하지 않으면서도 복용을 놓치지 않도록 돕는 기능입니다.
          </Text>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setShowQuietInfo(false)}
          >
            <Text style={styles.modalCloseTxt}>확인</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingBottom: 40 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 6,
    marginHorizontal: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 20,
    marginBottom: 6,
    marginHorizontal: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitleInRow: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoIcon: {
    fontSize: 14,
    color: '#9ca3af',
    lineHeight: 18,
  },
  fixedValue: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 16 },
  labelBlock: { flex: 1, marginRight: 12 },
  label: { fontSize: 15, color: '#111827' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  chevron: { fontSize: 20, color: '#9ca3af' },
  emailText: { fontSize: 13, color: '#6b7280', flexShrink: 1, marginTop: 2 },
  logoutText: { color: '#ef4444' },

  // TimeInput
  timeInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    color: '#111827',
    minWidth: 72,
    textAlign: 'center',
  },
  timeInputError: { borderColor: '#ef4444' },

  // 조용한 시간 안내 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '86%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalCloseBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: { fontSize: 18, color: '#374151', lineHeight: 20 },
  stepValue: {
    minWidth: 52,
    textAlign: 'center',
    fontSize: 14,
    color: '#111827',
    paddingHorizontal: 4,
  },
});
