import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, StyleSheet, ActivityIndicator, TouchableOpacity, AppState } from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation';
import { getSnapshot, type DoseSnapshot } from './careCircleApi';
import OfflineBanner from '../../components/OfflineBanner';
import { useNetworkStore } from '../../store/networkStore';

type Route = RouteProp<RootStackParamList, 'CareMonitor'>;

// SharePolicy.allowedFields 기본값: 서버가 없으면 모두 표시
const DEFAULT_ALLOWED = ['status', 'time', 'note', 'name'];

// ── 복용 이벤트 타입 (서버 스냅샷 data 필드) ────────────────────────────────

interface SnapshotEvent {
  id:           string;
  medicationId: string;
  medicationName?: string; // allowedFields에 포함될 때만
  plannedAt:    string;
  takenAt?:     string;
  status:       'scheduled' | 'taken' | 'late' | 'missed' | 'skipped';
  note?:        string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  taken:     { label: '복용 완료', color: '#42a873', bg: '#ebf7f1' },
  late:      { label: '복용 완료', color: '#42a873', bg: '#ebf7f1' },
  missed:    { label: '복용 누락', color: '#e84a5f', bg: '#fdebec' },
  skipped:   { label: '건너뜀',   color: '#8b95a1', bg: '#f2f4f6' },
  scheduled: { label: '복용 예정', color: '#eca154', bg: '#fef5ec' },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

// ── 상태 아이콘 ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: SnapshotEvent['status'] }) {
  if (status === 'taken' || status === 'late') {
    return <Ionicons name="checkmark" size={20} color="#42a873" />;
  }
  if (status === 'missed') {
    return <Ionicons name="alert-circle" size={20} color="#e84a5f" />;
  }
  if (status === 'skipped') {
    return <Text style={styles.cardIconEmoji}>⏭️</Text>;
  }
  return <Text style={styles.cardIconEmoji}>💊</Text>;
}

// ── 이벤트 카드 ───────────────────────────────────────────────────────────────

function EventCard({ event, allowedFields }: { event: SnapshotEvent; allowedFields: string[] }) {
  const cfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.scheduled;
  const showName = allowedFields.includes('name') && event.medicationName;
  const showTime = allowedFields.includes('time');
  const showNote = allowedFields.includes('note') && event.note;

  return (
    <View testID={`event-card-${event.id}`} style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={[styles.cardIconWrap, { backgroundColor: cfg.bg }]}>
          <StatusIcon status={event.status} />
        </View>
        <View style={styles.cardTextMeta}>
          {showName && <Text style={styles.cardMedName}>{event.medicationName}</Text>}
          {showTime && (
            <Text style={styles.cardTime}>
              예정 {fmtTime(event.plannedAt)}
              {event.takenAt ? <Text style={styles.cardTimeTaken}>{`  →  복용 ${fmtTime(event.takenAt)}`}</Text> : ''}
            </Text>
          )}
          {showNote && <Text style={styles.cardNote}>{event.note}</Text>}
        </View>
      </View>
      <View style={[styles.statusTag, { backgroundColor: cfg.bg }]}>
        <Text style={[styles.statusTagText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </View>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────────────────

export default function CareMonitorScreen() {
  const { params } = useRoute<Route>();
  const { circleId, patientId, patientName } = params;

  const [snapshot,  setSnapshot]  = useState<DoseSnapshot | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync,  setLastSync]  = useState<Date | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const appStateRef = useRef(AppState.currentState);

  // ── 데이터 로드 ──────────────────────────────────────────────────────────────

  const loadSnapshot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getSnapshot(circleId, patientId);
      setSnapshot(data);
      setLastSync(new Date());
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setSnapshot(null);
        setLastSync(new Date());
      } else if (status === 403) {
        setError('보호 그룹 접근이 차단되었습니다.\n피보호자가 그룹을 해제했거나 멤버에서 삭제되었어요.');
      } else if (!useNetworkStore.getState().isOnline) {
        setError('오프라인 상태에서는 복용 현황을 볼 수 없습니다');
      } else {
        setError('복용 현황을 불러오지 못했습니다');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [circleId, patientId]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  // 재연결되면 자동으로 다시 불러온다 — '다시 시도' 를 누르지 않아도 된다
  const isOnline = useNetworkStore((st) => st.isOnline);
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) loadSnapshot();
    wasOnlineRef.current = isOnline;
  }, [isOnline, loadSnapshot]);

  // AppState active 전환 시 조용히 새로고침 (AC1: 실시간 확인)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current !== 'active' && next === 'active') {
        loadSnapshot(true);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [loadSnapshot]);

  function handleRefresh() {
    setRefreshing(true);
    loadSnapshot(true);
  }

  // ── 스냅샷 파싱 ───────────────────────────────────────────────────────────

  const events: SnapshotEvent[] = (() => {
    if (!snapshot?.data) return [];
    try {
      const data = snapshot.data as { events?: SnapshotEvent[] };
      return Array.isArray(data.events) ? data.events : [];
    } catch {
      return [];
    }
  })();

  // SharePolicy의 allowedFields 적용 (서버에서 받은 policy가 없으면 기본값)
  const allowedFields: string[] =
    (snapshot?.data as { allowedFields?: string[] } | null)?.allowedFields ?? DEFAULT_ALLOWED;

  // 통계
  const takenCount    = events.filter((e) => e.status === 'taken' || e.status === 'late').length;
  const missedCount   = events.filter((e) => e.status === 'missed').length;
  const scheduledCount = events.filter((e) => e.status === 'scheduled').length;
  const totalCount    = events.length;
  const progressPct   = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

  // ── 렌더 ───────────────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="screen-care-monitor"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#2d8a81"
          colors={['#2d8a81']}
        />
      }
    >
      {/* 헤더 */}
      <View style={styles.headerSection}>
        <View style={styles.userIntro}>
          <View>
            <Text style={styles.eyebrow}>CARE & PROTECT</Text>
            <Text style={styles.headerPatient}>
              {patientName ? `${patientName}님의 복용 현황` : '보호 대상자 복용 현황'}
            </Text>
          </View>
          <TouchableOpacity
            testID="btn-refresh"
            onPress={handleRefresh}
            style={styles.profileTrigger}
            accessibilityLabel="새로고침"
            accessibilityRole="button"
          >
            <Ionicons name="person" size={20} color="#4e5968" />
          </TouchableOpacity>
        </View>

        <OfflineBanner inline message="오프라인 상태입니다 — 복용 현황은 인터넷 연결이 필요합니다. 연결되면 자동으로 다시 불러옵니다." />

        {/* 로딩 */}
        {loading && <ActivityIndicator testID="loading-indicator" style={{ marginTop: 40 }} color="#2d8a81" />}

        {/* 에러 */}
        {!loading && error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => loadSnapshot()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 요약 카드 */}
        {!loading && !error && (
          <View style={styles.summaryCard}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTopTitle}>오늘의 복용 진척도 🗓️</Text>
              <Text style={styles.cardTopDate}>{today}</Text>
            </View>

            {totalCount === 0 ? (
              <Text style={styles.summaryOk}>오늘 예정된 복용이 없습니다</Text>
            ) : (
              <>
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressDone}>{takenCount}건 완료</Text>
                    <Text style={styles.progressTotal}>전체 {totalCount}건 중</Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={[styles.statPill, { backgroundColor: '#ebf7f1' }]}>
                    <View style={styles.statIconWrap}>
                      <Ionicons name="checkmark" size={14} color="#42a873" />
                    </View>
                    <View>
                      <Text style={[styles.statLabel, { color: '#42a873' }]}>완료</Text>
                      <Text style={styles.statCount}>{takenCount}건</Text>
                    </View>
                  </View>
                  <View style={[styles.statPill, { backgroundColor: '#fef5ec' }]}>
                    <View style={styles.statIconWrap}>
                      <Ionicons name="time-outline" size={14} color="#eca154" />
                    </View>
                    <View>
                      <Text style={[styles.statLabel, { color: '#eca154' }]}>예정</Text>
                      <Text style={styles.statCount}>{scheduledCount}건</Text>
                    </View>
                  </View>
                  <View style={[styles.statPill, { backgroundColor: '#fdebec' }]}>
                    <View style={styles.statIconWrap}>
                      <Ionicons name="alert-circle-outline" size={14} color="#e84a5f" />
                    </View>
                    <View>
                      <Text style={[styles.statLabel, { color: '#e84a5f' }]}>누락</Text>
                      <Text style={styles.statCount}>{missedCount}건</Text>
                    </View>
                  </View>
                </View>
              </>
            )}
          </View>
        )}
      </View>

      {/* 이벤트 목록 */}
      {!loading && !error && events.length > 0 && (
        <View style={styles.medicationListSection}>
          <View style={styles.sectionTitleBar}>
            <Text style={styles.sectionTitle}>오늘의 복용 내역 💊</Text>
            {lastSync && (
              <Text style={styles.lastSync}>마지막 업데이트: {fmtDateTime(lastSync.toISOString())}</Text>
            )}
          </View>
          {events
            .slice()
            .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt))
            .map((evt) => (
              <EventCard key={evt.id} event={evt} allowedFields={allowedFields} />
            ))}
        </View>
      )}

      {/* 비어 있음 */}
      {!loading && !error && events.length === 0 && (
        <Text testID="txt-no-events" style={styles.emptyText}>
          아직 오늘의 복용 데이터가 없습니다.{'\n'}
          보호 대상자가 앱에서 복용 기록을 동기화하면 여기에 표시돼요.
        </Text>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const CARD_SHADOW = {
  shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1,
};

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: '#f5f7f6' },
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  content:   { paddingBottom: 40 },

  headerSection: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 12 },
  userIntro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 13, fontWeight: '600', color: '#2d8a81', textTransform: 'uppercase' },
  headerPatient: { fontSize: 22, fontWeight: '800', color: '#191f28', marginTop: 2 },
  profileTrigger: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', ...CARD_SHADOW,
  },

  summaryCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 16, ...CARD_SHADOW,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTopTitle: { fontSize: 16, fontWeight: '700', color: '#191f28' },
  cardTopDate:  { fontSize: 13, fontWeight: '600', color: '#8b95a1' },
  summaryOk:    { fontSize: 15, color: '#42a873', fontWeight: '600' },

  progressWrap:  { gap: 8 },
  progressTrack: { height: 10, borderRadius: 100, backgroundColor: '#eceff0', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 100, backgroundColor: '#2d8a81' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressDone:  { fontSize: 13, fontWeight: '600', color: '#2d8a81' },
  progressTotal: { fontSize: 13, fontWeight: '500', color: '#4e5968' },

  statsRow: { flexDirection: 'row', gap: 12 },
  statPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
  },
  statIconWrap: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statCount: { fontSize: 14, fontWeight: '700', color: '#191f28', marginTop: 1 },

  medicationListSection: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  sectionTitleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#191f28' },
  lastSync:     { fontSize: 12, fontWeight: '600', color: '#2e8c7d' },

  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8eceb', borderRadius: 16,
    padding: 16, ...CARD_SHADOW,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  cardIconEmoji: { fontSize: 20 },
  cardTextMeta: { gap: 3, flexShrink: 1 },
  cardMedName:  { fontSize: 16, fontWeight: '700', color: '#191f28' },
  cardTime:     { fontSize: 12, color: '#8b95a1' },
  cardTimeTaken: { fontWeight: '700', color: '#42a873' },
  cardNote:     { fontSize: 12, color: '#8b95a1', marginTop: 2, fontStyle: 'italic' },

  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusTagText: { fontSize: 12, fontWeight: '700' },

  errorCard:   { marginTop: 16, backgroundColor: '#fdebec', borderRadius: 12, padding: 16, alignItems: 'center' },
  errorText:   { fontSize: 14, color: '#e84a5f', textAlign: 'center' },
  retryBtn:    { marginTop: 12, backgroundColor: '#2d8a81', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20 },
  retryBtnText:{ color: '#fff', fontWeight: '600' },

  emptyText: {
    textAlign: 'center', color: '#8b95a1', fontSize: 14,
    lineHeight: 22, marginTop: 40, paddingHorizontal: 32,
  },
});
