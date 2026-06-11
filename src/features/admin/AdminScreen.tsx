import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import {
  getAdminStats, broadcastPush, getFeatureFlags, setFeatureFlag,
  type AdminStats, type FeatureFlag,
} from './adminApi';

export default function AdminScreen() {
  const { userName, userEmail } = useAuthStore();

  const [stats,         setStats]         = useState<AdminStats | null>(null);
  const [flags,         setFlags]         = useState<FeatureFlag[]>([]);
  const [loadingStats,  setLoadingStats]  = useState(true);
  const [loadingFlags,  setLoadingFlags]  = useState(true);
  const [pushTitle,     setPushTitle]     = useState('');
  const [pushBody,      setPushBody]      = useState('');
  const [sendingPush,   setSendingPush]   = useState(false);
  const [togglingFlag,  setTogglingFlag]  = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    loadFlags();
  }, []);

  async function loadStats() {
    setLoadingStats(true);
    try {
      setStats(await getAdminStats());
    } catch {
      Alert.alert('오류', '통계를 불러오지 못했습니다.');
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

  async function handleBroadcast() {
    if (!pushTitle.trim() || !pushBody.trim()) {
      Alert.alert('알림', '제목과 내용을 모두 입력해주세요.');
      return;
    }
    Alert.alert(
      '전체 푸시 발송',
      `제목: ${pushTitle}\n내용: ${pushBody}\n\n모든 사용자에게 발송됩니다. 계속하시겠어요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '발송',
          style: 'destructive',
          onPress: async () => {
            setSendingPush(true);
            try {
              await broadcastPush(pushTitle.trim(), pushBody.trim());
              Alert.alert('완료', '푸시 알림이 발송되었습니다.');
              setPushTitle('');
              setPushBody('');
            } catch {
              Alert.alert('오류', '발송에 실패했습니다. 다시 시도해주세요.');
            } finally {
              setSendingPush(false);
            }
          },
        },
      ],
    );
  }

  async function handleToggleFlag(flag: FeatureFlag) {
    setTogglingFlag(flag.key);
    try {
      await setFeatureFlag(flag.key, !flag.enabled);
      setFlags((prev) =>
        prev.map((f) => (f.key === flag.key ? { ...f, enabled: !f.enabled } : f)),
      );
    } catch {
      Alert.alert('오류', '설정 변경에 실패했습니다.');
    } finally {
      setTogglingFlag(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>

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
            <View style={styles.statsGrid}>
              <StatBox label="전체 유저" value={stats.totalUsers} />
              <StatBox label="오늘 활성" value={stats.activeToday} />
              <StatBox label="이번 주 신규" value={stats.newThisWeek} />
            </View>
          ) : (
            <Text style={styles.errorText}>통계를 불러오지 못했습니다</Text>
          )}
          <TouchableOpacity style={styles.refreshBtn} onPress={loadStats}>
            <Text style={styles.refreshBtnTxt}>새로고침</Text>
          </TouchableOpacity>
        </View>

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
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },

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
