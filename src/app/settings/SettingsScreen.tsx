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
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import type { RootStackParamList } from '../../navigation';
import { useSettingsStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { rescheduleAllSchedules } from '../../notifications';
import type { UserSettings } from '../../domain';

type Nav = StackNavigationProp<RootStackParamList>;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const PRIVACY_URL = 'https://pillarm.app/privacy-policy.html';
const CONTACT_EMAIL = 'seungrokjeong@gmail.com';
const IOS_APP_ID = '6770390217';
const ANDROID_PACKAGE = 'com.seungrokj.pillarm';

// ── FAQ 데이터 ─────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: '알림이 오지 않아요',
    a: '① 휴대폰 설정 > 알림에서 필람의 알림이 허용되어 있는지 확인해 주세요.\n② 설정 > 알림 설정에서 조용한 시간이 현재 시간대에 겹치는지 확인해 주세요.\n③ 배터리 절약 모드나 방해 금지 모드가 켜져 있으면 알림이 차단될 수 있습니다.',
  },
  {
    q: '복용 완료를 실수로 눌렀어요',
    a: '현재 버전에서는 복용 완료 취소 기능이 제공되지 않습니다. 복용 기록 화면에서 해당 날짜의 기록을 확인할 수 있으며, 향후 업데이트에서 수정 기능이 추가될 예정입니다.',
  },
  {
    q: '보호자 공유는 어떻게 사용하나요?',
    a: '① 로그인 후 설정 > 보호자 공유 > 내 보호 그룹 관리에서 새 그룹을 만드세요.\n② 생성된 6자리 초대 코드를 보호자에게 공유하세요.\n③ 보호자가 앱에서 "보호 그룹 참여하기"를 누르고 코드를 입력하면 오늘의 복용 현황을 실시간으로 확인할 수 있습니다.',
  },
  {
    q: '다른 기기에서도 사용할 수 있나요?',
    a: '로그인 후 사용하면 복용 기록과 일정이 서버에 동기화됩니다. 새 기기에서 같은 계정으로 로그인하면 기존 데이터를 그대로 사용할 수 있습니다.',
  },
  {
    q: '알림이 30일 이후로 등록되지 않아요',
    a: '배터리와 시스템 리소스 보호를 위해 최대 30일치 알림이 등록됩니다. 30일마다 앱을 열면 다음 30일치 알림이 자동으로 등록되니 주기적으로 앱을 실행해 주세요.',
  },
  {
    q: '약 복용 기록이 사라졌어요',
    a: '복용 기록은 기기 내부에 저장됩니다. 앱을 삭제하거나 기기를 초기화하면 기록이 지워질 수 있습니다. 중요한 기록을 보존하려면 로그인 후 서버 동기화를 사용해 주세요.',
  },
];

// ── 이용약관 내용 ──────────────────────────────────────────────────────────────

const TERMS_TEXT = `제1조 (목적)
본 약관은 필람(Pillarm) 앱 서비스 이용에 관한 기본 사항을 규정합니다.

제2조 (서비스 내용)
필람은 약 복용 일정 등록, 알림, 기록, 통계 기능을 제공하는 복약 관리 보조 도구입니다. 의학적 진단·처방 기능을 제공하지 않으며, 의료 행위를 대체하지 않습니다.

제3조 (계정 및 데이터)
① 소셜 로그인(Apple·Google·카카오) 또는 이메일로 계정을 생성할 수 있습니다.
② 비로그인 상태의 데이터는 기기 내에만 저장되며 서버와 동기화되지 않습니다.
③ 회원 탈퇴 시 서버에 저장된 모든 데이터는 즉시 삭제됩니다.

제4조 (책임 제한)
복약 알림 미발송, 기록 손실 등 서비스 오류로 인한 직접적 피해에 대해 개발자는 책임을 지지 않습니다. 중요한 복약 일정은 반드시 의료진 또는 약사의 지도를 따르시기 바랍니다.

제5조 (약관 변경)
약관 변경 시 앱 내 공지 또는 이메일로 사전 안내합니다.`;

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

  useEffect(() => { setText(value); }, [value]);

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
  const { isLoggedIn, userEmail, userName, clearSession, isAdmin } = useAuthStore();
  const [refreshing, setRefreshing]     = useState(false);
  const [showQuietInfo, setShowQuietInfo] = useState(false);
  const [showFAQ, setShowFAQ]           = useState(false);
  const [showTerms, setShowTerms]       = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await loadSettings();
    setRefreshing(false);
  }

  useEffect(() => { if (!settings) loadSettings(); }, []);

  if (!settings) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator testID="loading-indicator" />
      </SafeAreaView>
    );
  }

  function requireLogin(then: () => void) {
    if (isLoggedIn) { then(); return; }
    Alert.alert(
      '로그인이 필요합니다',
      '보호 그룹 기능을 사용하려면 먼저 로그인해 주세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '로그인하기', onPress: () => navigation.navigate('Login') },
      ],
    );
  }

  async function saveSetting(patch: Partial<UserSettings>) {
    const updated = { ...settings!, ...patch };
    await updateSettings(updated);
    const quietChanged = 'quietHoursStart' in patch || 'quietHoursEnd' in patch;
    if (quietChanged) await rescheduleAllSchedules(updated);
  }

  function openUrl(url: string) {
    Linking.openURL(url).catch(() => Alert.alert('오류', '링크를 열 수 없습니다.'));
  }

  function openContact() {
    openUrl(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('[필람] 문의드립니다')}`);
  }

  function openReview() {
    const url = Platform.OS === 'ios'
      ? `itms-apps://itunes.apple.com/app/id${IOS_APP_ID}?action=write-review`
      : `market://details?id=${ANDROID_PACKAGE}`;
    openUrl(url);
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
        {/* ── 계정 ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>계정</Text>
        <View style={styles.section}>
          {isLoggedIn ? (
            <>
              <TouchableOpacity
                testID="btn-go-account"
                style={[styles.row, styles.accountRow]}
                onPress={() => navigation.navigate('Account')}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{userName || '(이름 미설정)'}</Text>
                  {userEmail ? <Text style={styles.emailText}>{userEmail}</Text> : null}
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
            <TouchableOpacity
              testID="btn-go-login"
              style={styles.row}
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
            >
              <Text style={styles.label}>간편로그인으로 시작하기</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 알림 설정 ────────────────────────────────────────────── */}
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
              step={5} min={5} max={60}
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
              step={1} min={1} max={5}
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
              step={30} min={30} max={360}
              format={(v) => `${v}분`}
              onChange={(v) => saveSetting({ missedToLateMinutes: v })}
            />
          </View>
        </View>

        {/* ── 보호자 공유 ──────────────────────────────────────────── */}
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

        {/* ── 도움말 및 지원 ────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>도움말 및 지원</Text>
        <View style={styles.section}>
          <TouchableOpacity
            testID="btn-faq"
            style={styles.row}
            onPress={() => setShowFAQ(true)}
            accessibilityRole="button"
          >
            <Text style={styles.label}>자주 묻는 질문</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            testID="btn-contact"
            style={styles.row}
            onPress={openContact}
            accessibilityRole="button"
          >
            <Text style={styles.label}>문의하기</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            testID="btn-review"
            style={styles.row}
            onPress={openReview}
            accessibilityRole="button"
          >
            <Text style={styles.label}>앱 평가하기</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── 개인정보 보호 ─────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>개인정보 보호</Text>
        <View style={styles.section}>
          <TouchableOpacity
            testID="btn-privacy"
            style={styles.row}
            onPress={() => openUrl(PRIVACY_URL)}
            accessibilityRole="button"
          >
            <Text style={styles.label}>개인정보 처리방침</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            testID="btn-terms"
            style={styles.row}
            onPress={() => setShowTerms(true)}
            accessibilityRole="button"
          >
            <Text style={styles.label}>서비스 이용약관</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── 관리자 (isAdmin 계정만 표시) ────────────────────────── */}
        {isAdmin && (
          <>
            <Text style={styles.sectionTitle}>관리자</Text>
            <View style={styles.section}>
              <TouchableOpacity
                testID="btn-admin-panel"
                style={styles.row}
                onPress={() => navigation.navigate('Admin')}
                accessibilityRole="button"
              >
                <Text style={[styles.label, { color: '#dc2626' }]}>관리자 패널</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── 앱 정보 ───────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>앱 정보</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>버전</Text>
            <Text style={styles.fixedValue}>{APP_VERSION}</Text>
          </View>
        </View>

        <View style={{ height: 12 }} />
      </ScrollView>

      {/* ── 조용한 시간 설명 모달 ────────────────────────────────── */}
      <Modal visible={showQuietInfo} transparent animationType="fade" onRequestClose={() => setShowQuietInfo(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowQuietInfo(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>조용한 시간이란?</Text>
            <Text style={styles.modalBody}>
              설정한 시작·종료 시간 사이에는 알림이 울리지 않습니다.{'\n\n'}
              예를 들어 시작 23:00, 종료 07:00으로 설정하면 밤 11시부터 아침 7시 사이에 예정된 복용 알림은 종료 시간인 07:00으로 자동 조정됩니다.{'\n\n'}
              야간 수면을 방해하지 않으면서도 복용을 놓치지 않도록 돕는 기능입니다.
            </Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowQuietInfo(false)}>
              <Text style={styles.modalCloseTxt}>확인</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── FAQ 모달 ─────────────────────────────────────────────── */}
      <Modal visible={showFAQ} transparent animationType="slide" onRequestClose={() => setShowFAQ(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>자주 묻는 질문</Text>
              <TouchableOpacity onPress={() => setShowFAQ(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
              {FAQ_ITEMS.map((item, index) => (
                <View key={index} style={styles.faqItem}>
                  <Text style={styles.faqQ}>Q. {item.q}</Text>
                  <Text style={styles.faqA}>{item.a}</Text>
                </View>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 이용약관 모달 ────────────────────────────────────────── */}
      <Modal visible={showTerms} transparent animationType="slide" onRequestClose={() => setShowTerms(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>서비스 이용약관</Text>
              <TouchableOpacity onPress={() => setShowTerms(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
              <Text style={styles.termsText}>{TERMS_TEXT}</Text>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:         { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container:        { flex: 1, backgroundColor: '#f9fafb' },
  content:          { paddingBottom: 40 },

  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 20, marginBottom: 6, marginHorizontal: 16, gap: 6,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#6b7280',
    marginTop: 20, marginBottom: 6, marginHorizontal: 16,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sectionTitleInRow: {
    fontSize: 13, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  infoIcon:   { fontSize: 14, color: '#9ca3af', lineHeight: 18 },
  fixedValue: { fontSize: 15, color: '#6b7280', fontWeight: '500' },

  section: {
    backgroundColor: '#fff', marginHorizontal: 16,
    borderRadius: 12, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 56,
  },
  divider:    { height: 1, backgroundColor: '#f3f4f6', marginLeft: 16 },
  labelBlock: { flex: 1, marginRight: 12 },
  label:      { fontSize: 15, color: '#111827' },
  hint:       { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  chevron:    { fontSize: 20, color: '#9ca3af' },
  emailText:  { fontSize: 13, color: '#6b7280', flexShrink: 1, marginTop: 2 },
  accountRow: { paddingVertical: 10 },
  logoutText: { color: '#ef4444' },

  // TimeInput
  timeInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    fontSize: 15, color: '#111827', minWidth: 72, textAlign: 'center',
  },
  timeInputError: { borderColor: '#ef4444' },

  // 조용한 시간 모달 (소형)
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: { width: '86%', backgroundColor: '#fff', borderRadius: 16, padding: 22 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12 },
  modalBody:  { fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 20 },
  modalCloseBtn: {
    backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  modalCloseTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // 바텀시트형 모달 (FAQ, 이용약관)
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '80%', paddingBottom: 0,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  sheetClose: { fontSize: 17, color: '#9ca3af', fontWeight: '500' },
  sheetScroll: { paddingHorizontal: 20, paddingTop: 4 },

  // FAQ
  faqItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  faqQ: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 8, lineHeight: 22 },
  faqA: { fontSize: 14, color: '#374151', lineHeight: 22 },

  // 이용약관
  termsText: { fontSize: 13, color: '#374151', lineHeight: 22, paddingVertical: 16 },

  // Stepper
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: 'hidden',
  },
  stepBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText:     { fontSize: 18, color: '#374151', lineHeight: 20 },
  stepValue: {
    minWidth: 52, textAlign: 'center', fontSize: 14, color: '#111827', paddingHorizontal: 4,
  },
});
