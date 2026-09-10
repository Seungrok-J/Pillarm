import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import {
  getAdminStats, broadcastPush, getFeatureFlags, setFeatureFlag,
  type AdminStats, type FeatureFlag, type RetentionPoint,
} from './adminApi';
import AlertModal, { type AlertModalTone } from '../../components/AlertModal';
import OfflineBanner from '../../components/OfflineBanner';
import { useNetworkStore } from '../../store/networkStore';

export default function AdminScreen() {
  const { userName, userEmail } = useAuthStore();
  const isOnline = useNetworkStore((s) => s.isOnline);

  const [stats,         setStats]         = useState<AdminStats | null>(null);
  const [flags,         setFlags]         = useState<FeatureFlag[]>([]);
  const [loadingStats,  setLoadingStats]  = useState(true);
  const [loadingFlags,  setLoadingFlags]  = useState(true);
  const [pushTitle,     setPushTitle]     = useState('');
  const [pushBody,      setPushBody]      = useState('');
  const [sendingPush,   setSendingPush]   = useState(false);
  const [togglingFlag,  setTogglingFlag]  = useState<string | null>(null);
  const [broadcastConfirm, setBroadcastConfirm] = useState(false);
  const [simpleAlert, setSimpleAlert] = useState<{ title: string; message?: string; tone?: AlertModalTone } | null>(null);

  useEffect(() => {
    loadStats();
    loadFlags();
  }, []);

  // 재연결되면 자동으로 다시 불러온다 — 화면을 나갔다 들어올 필요가 없다
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      loadStats();
      loadFlags();
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline]);

  async function loadStats() {
    setLoadingStats(true);
    try {
      setStats(await getAdminStats());
    } catch {
      // 오프라인이면 배너가 이미 알리고 있다 — 모달로 화면을 막지 않는다
      if (useNetworkStore.getState().isOnline) {
        setSimpleAlert({ title: '오류', message: '통계를 불러오지 못했습니다.', tone: 'danger' });
      }
    } finally {
      setLoadingStats(false);
    }
  }

  async function loadFlags() {
    setLoadingFlags(true);
    try {
      setFlags(await getFeatureFlags());
    } catch {
      setFlags([]);
    } finally {
      setLoadingFlags(false);
    }
  }

  function handleBroadcast() {
    if (!pushTitle.trim() || !pushBody.trim()) {
      setSimpleAlert({ title: '알림', message: '제목과 내용을 모두 입력해주세요.' });
      return;
    }
    setBroadcastConfirm(true);
  }

  async function performBroadcast() {
    setBroadcastConfirm(false);
    setSendingPush(true);
    try {
      await broadcastPush(pushTitle.trim(), pushBody.trim());
      setSimpleAlert({ title: '완료', message: '푸시 알림이 발송되었습니다.', tone: 'success' });
      setPushTitle('');
      setPushBody('');
    } catch {
      setSimpleAlert({ title: '오류', message: '발송에 실패했습니다. 다시 시도해주세요.', tone: 'danger' });
    } finally {
      setSendingPush(false);
    }
  }

  async function handleToggleFlag(flag: FeatureFlag) {
    setTogglingFlag(flag.key);
    try {
      await setFeatureFlag(flag.key, !flag.enabled);
      setFlags((prev) =>
        prev.map((f) => (f.key === flag.key ? { ...f, enabled: !f.enabled } : f)),
      );
    } catch {
      setSimpleAlert({ title: '오류', message: '설정 변경에 실패했습니다.', tone: 'danger' });
    } finally {
      setTogglingFlag(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>

        <OfflineBanner inline message="오프라인 상태입니다 — 관리자 기능은 인터넷 연결이 필요합니다. 연결되면 자동으로 다시 불러옵니다." />

        {/* 관리자 정보 */}
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeIcon}>🔐</Text>
          <View>
            <Text style={styles.adminBadgeName}>{userName ?? userEmail ?? '관리자'}</Text>
            <Text style={styles.adminBadgeRole}>관리자 계정으로 로그인됨</Text>
          </View>
        </View>

        {/* ── 유저 통계 ─────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>유저 통계</Text>
        <View style={styles.card}>
          {loadingStats ? (
            <ActivityIndicator color="#3b82f6" />
          ) : stats ? (
            <>
              <View style={styles.statsGrid}>
                <StatBox label="전체 유저" value={stats.totalUsers} />
                <StatBox label="오늘 활성" value={stats.activeToday} />
                <StatBox label="이번 주 신규" value={stats.newThisWeek} />
              </View>
              <View style={styles.divider} />
              <MetricRow
                label="일정 등록"
                value={`${stats.activation.usersWithSchedule}명`}
                sub={pct(stats.activation.rate)}
              />
              <Text style={styles.noteText}>
                모든 수치는 관리자 계정 {stats.excludedAdmins}개를 제외한 값입니다.
              </Text>
            </>
          ) : (
            <Text style={styles.errorText}>
              {isOnline ? '통계를 불러오지 못했습니다' : '오프라인 상태에서는 통계를 볼 수 없습니다'}
            </Text>
          )}
          <TouchableOpacity style={styles.refreshBtn} onPress={loadStats}>
            <Text style={styles.refreshBtnTxt}>새로고침</Text>
          </TouchableOpacity>
        </View>

        {/* ── 보호자 그룹 ───────────────────────────────────────── */}
        {stats && (
          <>
            <Text style={styles.sectionTitle}>보호자 그룹</Text>
            <View style={styles.card}>
              <View style={styles.headlineRow}>
                <Text
                  style={[
                    styles.headlineValue,
                    stats.careCircle.adoptionRate < 0.1 && styles.headlineWarn,
                  ]}
                >
                  {pct(stats.careCircle.adoptionRate)}
                </Text>
                <Text style={styles.headlineLabel}>사용률</Text>
              </View>
              {stats.careCircle.adoptionRate < 0.1 && (
                <Text style={styles.warnText}>
                  10% 미만 — 보호자 결제 모델(PRD Phase 5)의 전제를 재검토해야 합니다
                </Text>
              )}
              <View style={styles.divider} />
              <MetricRow label="그룹 수" value={`${stats.careCircle.circleCount}개`} />
              <MetricRow label="관여 유저" value={`${stats.careCircle.usersInAnyCircle}명`} />
              <MetricRow label="보호자 수" value={`${stats.careCircle.caregiverCount}명`} />
              <MetricRow
                label="보호자당 환자"
                value={`${stats.careCircle.avgPatientsPerCaregiver}명`}
              />
            </View>
          </>
        )}

        {/* ── 스캔 사용량 ───────────────────────────────────────── */}
        {stats && (
          <>
            <Text style={styles.sectionTitle}>
              스캔 사용량 (최근 {stats.scan.windowDays}일)
            </Text>
            <View style={styles.card}>
              <MetricRow label="총 스캔" value={`${stats.scan.totalScans.toLocaleString()}회`} />
              <MetricRow label="사용 유저" value={`${stats.scan.uniqueUsers}명`} />
              <MetricRow label="1인당 평균" value={`${stats.scan.avgScansPerUser}회`} />
              <MetricRow
                label={`일 ${stats.scan.dailyLimit}회 한도 도달`}
                value={`${stats.scan.dailyLimitHits}건`}
                sub={stats.scan.dailyLimitHits === 0 ? '한도 압력 없음' : undefined}
              />
            </View>
          </>
        )}

        {/* ── 리텐션 ────────────────────────────────────────────── */}
        {stats && (
          <>
            <Text style={styles.sectionTitle}>리텐션</Text>
            <View style={styles.card}>
              <View style={styles.statsGrid}>
                <RetentionBox label="D1" point={stats.retention.d1} />
                <RetentionBox label="D7" point={stats.retention.d7} />
                <RetentionBox label="D30" point={stats.retention.d30} />
              </View>
              <View style={styles.divider} />
              <MetricRow label="최근 7일 활동" value={`${stats.retention.activeLast7d}명`} />
              <MetricRow label="최근 30일 활동" value={`${stats.retention.activeLast30d}명`} />
              <Text style={styles.noteText}>
                가입 후 N일이 지난 유저 중 가입일+N일 이후에도 복용 체크 기록이 있는 비율.
                서버가 복용 기록을 {stats.retention.cohortWindowDays}일만 보관하므로
                그 안에 가입한 유저만 집계합니다.
              </Text>
            </View>
          </>
        )}

        {/* ── 전체 푸시 발송 ────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>전체 푸시 알림 발송</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>제목</Text>
          <TextInput
            style={styles.input}
            value={pushTitle}
            onChangeText={setPushTitle}
            placeholder="알림 제목"
            maxLength={60}
          />
          <Text style={styles.fieldLabel}>내용</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={pushBody}
            onChangeText={setPushBody}
            placeholder="알림 내용"
            multiline
            numberOfLines={3}
            maxLength={200}
          />
          <TouchableOpacity
            style={[styles.sendBtn, sendingPush && styles.btnDisabled]}
            onPress={handleBroadcast}
            disabled={sendingPush}
          >
            {sendingPush
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.sendBtnTxt}>전체 발송</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── 기능 플래그 ───────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>기능 플래그</Text>
        <View style={styles.card}>
          {loadingFlags ? (
            <ActivityIndicator color="#3b82f6" />
          ) : flags.length === 0 ? (
            <Text style={styles.emptyText}>등록된 플래그가 없습니다</Text>
          ) : (
            flags.map((flag, idx) => (
              <View key={flag.key}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.flagRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.flagKey}>{flag.key}</Text>
                    {flag.description ? (
                      <Text style={styles.flagDesc}>{flag.description}</Text>
                    ) : null}
                  </View>
                  {togglingFlag === flag.key ? (
                    <ActivityIndicator size="small" color="#3b82f6" />
                  ) : (
                    <Switch
                      value={flag.enabled}
                      onValueChange={() => handleToggleFlag(flag)}
                      trackColor={{ true: '#3b82f6', false: '#d1d5db' }}
                    />
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <AlertModal
        visible={broadcastConfirm}
        icon="megaphone"
        tone="danger"
        title="전체 푸시 발송"
        message={`제목: ${pushTitle}\n내용: ${pushBody}\n\n모든 사용자에게 발송됩니다. 계속하시겠어요?`}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setBroadcastConfirm(false) },
          { text: '발송', style: 'destructive', onPress: performBroadcast },
        ]}
        onRequestClose={() => setBroadcastConfirm(false)}
      />

      <AlertModal
        visible={simpleAlert !== null}
        icon="alert-circle"
        tone={simpleAlert?.tone ?? 'danger'}
        title={simpleAlert?.title ?? ''}
        message={simpleAlert?.message}
        buttons={[{ text: '확인', onPress: () => setSimpleAlert(null) }]}
        onRequestClose={() => setSimpleAlert(null)}
      />
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** 0~1 비율을 퍼센트 문자열로. 소수 첫째 자리까지. */
function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricRight}>
        <Text style={styles.metricValue}>{value}</Text>
        {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function RetentionBox({ label, point }: { label: string; point: RetentionPoint }) {
  // 대상 코호트가 없으면 비율이 의미 없다 — 0.0% 대신 '–' 로 구분해서 보여준다
  const empty = point.eligible === 0;
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, empty && styles.statValueMuted]}>
        {empty ? '–' : pct(point.rate)}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statSubLabel}>
        {empty ? '대상 없음' : `${point.retained}/${point.eligible}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea:   { flex: 1, backgroundColor: '#f9fafb' },
  content:    { padding: 16 },

  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1f2937', borderRadius: 12,
    padding: 16, marginBottom: 20,
  },
  adminBadgeIcon: { fontSize: 28 },
  adminBadgeName: { fontSize: 16, fontWeight: '700', color: '#f9fafb' },
  adminBadgeRole: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8, marginTop: 4, letterSpacing: 0.5 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },

  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  statBox:   { alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#111827' },
  statValueMuted: { color: '#d1d5db' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  statSubLabel: { fontSize: 11, color: '#9ca3af', marginTop: 1 },

  metricRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 },
  metricLabel: { fontSize: 14, color: '#374151', flex: 1 },
  metricRight: { alignItems: 'flex-end' },
  metricValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  metricSub:   { fontSize: 11, color: '#9ca3af', marginTop: 1 },

  headlineRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  headlineValue: { fontSize: 34, fontWeight: '800', color: '#111827' },
  headlineWarn:  { color: '#ef4444' },
  headlineLabel: { fontSize: 13, color: '#6b7280' },
  warnText:      { fontSize: 12, color: '#ef4444', marginTop: 6, lineHeight: 17 },
  noteText:      { fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 16 },

  refreshBtn:    { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  refreshBtnTxt: { fontSize: 13, color: '#6b7280' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#f9fafb',
  },
  inputMultiline: { height: 80, textAlignVertical: 'top' },

  sendBtn: {
    marginTop: 14, backgroundColor: '#dc2626', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  sendBtnTxt:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  flagRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  flagKey:  { fontSize: 15, fontWeight: '600', color: '#111827' },
  flagDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  divider:  { height: 1, backgroundColor: '#f3f4f6' },

  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
  errorText: { fontSize: 14, color: '#ef4444', textAlign: 'center' },
});
