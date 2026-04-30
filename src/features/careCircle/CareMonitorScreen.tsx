import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl,
  StyleSheet, ActivityIndicator, TouchableOpacity, AppState,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation';
import { getSnapshot, type DoseSnapshot } from './careCircleApi';

type Route = RouteProp<RootStackParamList, 'CareMonitor'>;

// SharePolicy.allowedFields 기본값: 서버가 없으면 모두 표시
const DEFAULT_ALLOWED = ['status', 'time', 'note'];

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  taken:     { label: '복용 완료', color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
  late:      { label: '늦게 복용', color: '#ca8a04', bg: '#fefce8', icon: '⏰' },
  missed:    { label: '복용 누락', color: '#dc2626', bg: '#fef2f2', icon: '❌' },
  skipped:   { label: '건너뜀',   color: '#6b7280', bg: '#f9fafb', icon: '⏭️' },
  scheduled: { label: '예정',     color: '#3b82f6', bg: '#eff6ff', icon: '💊' },
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

// ── 이벤트 카드 ───────────────────────────────────────────────────────────────

function EventCard({ event, allowedFields }: { event: SnapshotEvent; allowedFields: string[] }) {
  const cfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.scheduled;
  const showName = allowedFields.includes('name') && event.medicationName;
  const showTime = allowedFields.includes('time');
  const showNote = allowedFields.includes('note') && event.note;

  return (
    <View testID={`event-card-${event.id}`} style={[styles.card, { backgroundColor: cfg.bg }]}>
      <Text style={styles.cardIcon}>{cfg.icon}</Text>
      <View style={styles.cardBody}>
        {showName && <Text style={styles.cardMedName}>{event.medicationName}</Text>}
        <Text style={[styles.cardStatus, { color: cfg.color }]}>{cfg.label}</Text>
        {showTime && (
          <Text style={styles.cardTime}>
            예정 {fmtTime(event.plannedAt)}
            {event.takenAt ? `  →  복용 ${fmtTime(event.takenAt)}` : ''}
          </Text>
        )}
        {showNote && <Text style={styles.cardNote}>{event.note}</Text>}
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
  const takenCount   = events.filter((e) => e.status === 'taken' || e.status === 'late').length;
  const missedCount  = events.filter((e) => e.status === 'missed').length;
  const totalCount   = events.length;
  const hasMissed    = missedCount > 0;

  // ── 렌더 ───────────────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="screen-care-monitor"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#3b82f6"
          colors={['#3b82f6']}
        />
      }
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerDate}>{today}</Text>
        <Text style={styles.headerPatient}>
          {patientName ? `${patientName}님의 복용 현황` : '보호 대상자 복용 현황'}
        </Text>
        {lastSync && (
          <Text style={styles.lastSync}>마지막 업데이트: {fmtDateTime(lastSync.toISOString())}</Text>
        )}
        <TouchableOpacity
          testID="btn-refresh"
          onPress={handleRefresh}
          style={styles.refreshBtn}
          accessibilityLabel="새로고침"
          accessibilityRole="button"
        >
          <Text style={styles.refreshBtnText}>↻ 새로고침</Text>
        </TouchableOpacity>
      </View>

      {/* 로딩 */}
      {loading && <ActivityIndicator testID="loading-indicator" style={{ marginTop: 40 }} color="#3b82f6" />}

      {/* 에러 */}
      {!loading && error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadSnapshot()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 통계 요약 */}
      {!loading && !error && (
        <View style={[styles.summaryCard, hasMissed && styles.summaryCardWarning]}>
          {hasMissed ? (
            <Text testID="txt-missed-warning" style={styles.missedWarning}>
              ⚠️ 오늘 {missedCount}건의 복용이 누락됐어요
            </Text>
          ) : (
            <Text style={styles.summaryOk}>
              {totalCount > 0
                ? `오늘 ${totalCount}건 중 ${takenCount}건 복용 완료`
                : '오늘 예정된 복용이 없습니다'}
            </Text>
          )}
        </View>
      )}

      {/* 이벤트 목록 */}
      {!loading && !error && events.length > 0 && (
        <View style={styles.eventList}>
          <Text style={styles.sectionTitle}>복용 내역</Text>
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
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content:   { paddingBottom: 40 },

  header: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerDate:    { color: '#bfdbfe', fontSize: 13 },
  headerPatient: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  lastSync:      { color: '#bfdbfe', fontSize: 12, marginTop: 4 },

  refreshBtn:     { marginTop: 10, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  refreshBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  summaryCard: {
    margin: 16,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  summaryCardWarning: { backgroundColor: '#fef2f2', borderLeftColor: '#dc2626' },
  summaryOk:       { fontSize: 15, color: '#16a34a', fontWeight: '600' },
  missedWarning:   { fontSize: 15, color: '#dc2626', fontWeight: '700' },

  eventList:    { paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  cardIcon:    { fontSize: 22, marginRight: 12, lineHeight: 28 },
  cardBody:    { flex: 1 },
  cardMedName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  cardStatus:  { fontSize: 14, fontWeight: '600' },
  cardTime:    { fontSize: 13, color: '#6b7280', marginTop: 2 },
  cardNote:    { fontSize: 12, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' },

  errorCard:   { margin: 16, backgroundColor: '#fef2f2', borderRadius: 12, padding: 16, alignItems: 'center' },
  errorText:   { fontSize: 14, color: '#dc2626', textAlign: 'center' },
  retryBtn:    { marginTop: 12, backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20 },
  retryBtnText:{ color: '#fff', fontWeight: '600' },

  emptyText: {
    textAlign: 'center', color: '#9ca3af', fontSize: 14,
    lineHeight: 22, marginTop: 40, paddingHorizontal: 32,
  },
});
