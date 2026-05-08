import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  RefreshControl,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useDoseEventStore, usePointStore } from '../../store';
import {
  calculateWeeklyStats,
  calculateMissedPatterns,
  type MissedPattern,
} from '../../utils/statsCalculator';
import type { DoseEvent } from '../../domain';
import CoachingSection from '../../features/aiCoaching/CoachingSection';

const { width: SW } = Dimensions.get('window');

// ── 날짜 유틸 ────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(d: Date)   { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getWeekRange(): { start: string; end: string; label: string } {
  const today = new Date();
  const dow = today.getDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today); mon.setDate(today.getDate() + daysToMon);
  const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
  return {
    start: `${fmt(mon)}T00:00:00`,
    end:   `${fmt(sun)}T23:59:59`,
    label: `${mon.getMonth() + 1}.${mon.getDate()} – ${sun.getMonth() + 1}.${sun.getDate()}`,
  };
}

function getMonthRange(): { start: string; end: string; label: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${pad(m)}-01T00:00:00`,
    end:   `${y}-${pad(m)}-${pad(lastDay)}T23:59:59`,
    label: `${m}월`,
  };
}

function getLastNMonths(n: number) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (n - 1 - i), 1);
    return {
      ym:    `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: `${d.getMonth() + 1}월`,
    };
  });
}

interface MonthBar { ym: string; label: string; rate: number; taken: number; total: number; }

function calcMonthlyBars(events: DoseEvent[], n = 12): MonthBar[] {
  const months = getLastNMonths(n);
  const byMonth: Record<string, { taken: number; total: number }> = {};
  for (const e of events) {
    if (e.status !== 'taken' && e.status !== 'missed' && e.status !== 'late') continue;
    const ym = e.plannedAt.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = { taken: 0, total: 0 };
    byMonth[ym].total += 1;
    if (e.status === 'taken') byMonth[ym].taken += 1;
  }
  return months.map(({ ym, label }) => {
    const d = byMonth[ym] ?? { taken: 0, total: 0 };
    return { ym, label, taken: d.taken, total: d.total, rate: d.total > 0 ? d.taken / d.total : 0 };
  });
}

// ── 색상 ─────────────────────────────────────────────────────────────────────

function rateColor(r: number): string {
  if (r >= 0.9) return '#22c55e';
  if (r >= 0.6) return '#3b82f6';
  if (r > 0)    return '#f97316';
  return '#ef4444';
}

// ── 완료율 링 ─────────────────────────────────────────────────────────────────

const RING = { size: 160, cx: 80, cy: 80, r: 66, sw: 16 };
const CIRC = 2 * Math.PI * RING.r;

function CompletionRing({ rate }: { rate: number }) {
  const clamped = Math.min(1, Math.max(0, rate));
  const offset  = CIRC * (1 - clamped);
  const color   = rateColor(clamped);
  const pct     = `${Math.round(clamped * 100)}%`;
  return (
    <View style={{ width: RING.size, height: RING.size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING.size} height={RING.size}>
        <Circle cx={RING.cx} cy={RING.cy} r={RING.r} stroke="#e5e7eb" strokeWidth={RING.sw} fill="none" />
        <Circle
          cx={RING.cx} cy={RING.cy} r={RING.r}
          stroke={color} strokeWidth={RING.sw} fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${RING.cx}, ${RING.cy})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text testID="gauge-percentage" style={[st.ringPct, { color }]}>{pct}</Text>
        <Text style={st.ringLabel}>완료율</Text>
      </View>
    </View>
  );
}

// ── 지표 카드 (작은 것) ───────────────────────────────────────────────────────

function MetricCard({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <View style={st.metricCard}>
      <Text style={st.metricIcon}>{icon}</Text>
      <Text style={[st.metricValue, { color }]}>{value}</Text>
      <Text style={st.metricLabel}>{label}</Text>
    </View>
  );
}

// ── 주간 막대 차트 ────────────────────────────────────────────────────────────

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABELS = ['일','월','화','수','목','금','토'];

function WeekBars({ byDayOfWeek }: { byDayOfWeek: ReturnType<typeof calculateWeeklyStats>['byDayOfWeek'] }) {
  const maxPct = Math.max(1, ...DOW_ORDER.map(d => byDayOfWeek[d].total > 0 ? byDayOfWeek[d].completionRate * 100 : 0));
  return (
    <View style={st.barsWrap}>
      {DOW_ORDER.map((dow) => {
        const day = byDayOfWeek[dow];
        const pct = day.total > 0 ? day.completionRate * 100 : null;
        const barH = pct != null ? Math.max(4, (pct / 100) * 80) : 0;
        const color = pct != null ? rateColor(day.completionRate) : '#e5e7eb';
        return (
          <View key={dow} style={st.barCol}>
            <Text style={st.barPctTxt}>{pct != null ? `${Math.round(pct)}%` : ''}</Text>
            <View style={st.barTrackV}>
              <View style={[st.barFillV, { height: barH, backgroundColor: color }]} />
            </View>
            <Text style={st.barDayTxt}>{DOW_LABELS[dow]}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 월별 막대 차트 ────────────────────────────────────────────────────────────

function MonthBars({ bars }: { bars: MonthBar[] }) {
  const visible = bars.filter(b => b.total > 0);
  if (visible.length === 0) {
    return <Text style={st.emptyTxt}>아직 기록이 없습니다</Text>;
  }
  return (
    <View style={st.barsWrap}>
      {bars.map((b) => {
        const pct = b.total > 0 ? b.rate * 100 : null;
        const barH = pct != null ? Math.max(4, (pct / 100) * 80) : 0;
        const color = pct != null ? rateColor(b.rate) : '#e5e7eb';
        return (
          <View key={b.ym} style={st.barCol}>
            <Text style={[st.barPctTxt, { fontSize: 9 }]}>{pct != null ? `${Math.round(pct)}%` : ''}</Text>
            <View style={st.barTrackV}>
              <View style={[st.barFillV, { height: barH, backgroundColor: color }]} />
            </View>
            <Text style={[st.barDayTxt, { fontSize: 10 }]}>{b.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 누락 패턴 ────────────────────────────────────────────────────────────────

function MissedList({ patterns }: { patterns: MissedPattern[] }) {
  const top3 = patterns.slice(0, 3);
  if (top3.length === 0) {
    return <Text testID="txt-no-missed-patterns" style={[st.emptyTxt, { color: '#16a34a' }]}>누락된 복용이 없어요 👍</Text>;
  }
  return (
    <View testID="missed-pattern-list">
      {top3.map((p, i) => (
        <View key={p.timeSlot} style={st.patternRow}>
          <View style={[st.patternRankBadge, { backgroundColor: i === 0 ? '#fef3c7' : '#f3f4f6' }]}>
            <Text style={[st.patternRankTxt, { color: i === 0 ? '#d97706' : '#6b7280' }]}>{i + 1}</Text>
          </View>
          <Text testID={`missed-slot-${i}`} style={st.patternSlot}>{p.timeSlot}</Text>
          <Text testID={`missed-count-${i}`} style={st.patternCount}>{`${p.count}회`}</Text>
        </View>
      ))}
    </View>
  );
}

// ── 화면 ──────────────────────────────────────────────────────────────────────

type Tab = 'week' | 'month';

export default function StatsScreen() {
  const [tab,       setTab]       = useState<Tab>('week');
  const [events,    setEvents]    = useState<DoseEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { fetchByDateRange }     = useDoseEventStore();
  const { streak } = usePointStore();

  const range = tab === 'week' ? getWeekRange() : getMonthRange();

  // 탭 포커스 시마다 재조회
  useFocusEffect(
    useCallback(() => {
      const r = tab === 'week' ? getWeekRange() : getMonthRange();
      setIsLoading(true);
      fetchByDateRange(r.start, r.end).then((result) => {
        setEvents(result);
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    const result = await fetchByDateRange(range.start, range.end);
    setEvents(result);
    setRefreshing(false);
  }

  const stats    = useMemo(() => calculateWeeklyStats(events), [events]);
  const patterns = useMemo(() => calculateMissedPatterns(events), [events]);
  const monthBars = useMemo(() => calcMonthlyBars(events, 8), [events]);

  const streakLabel = `${streak}일`;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
    <View style={st.container} testID="screen-stats">

      {/* ── 상단 헤더 ── */}
      <View style={st.header}>
        <Text style={st.headerTitle}>복용 통계</Text>
        {/* 세그먼트 컨트롤 */}
        <View style={st.segment}>
          {(['week', 'month'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              testID={`tab-${t}`}
              style={[st.segBtn, tab === t && st.segBtnActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[st.segTxt, tab === t && st.segTxtActive]}>
                {t === 'week' ? '이번 주' : '이번 달'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator testID="loading-indicator" style={{ marginTop: 60 }} color="#3b82f6" size="large" />
      ) : (
        <ScrollView
          testID="stats-scroll"
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
          }
        >

          {/* 기간 레이블 */}
          <Text style={st.periodLabel}>{range.label}</Text>

          {/* ── 완료율 링 카드 ── */}
          <View style={st.ringCard}>
            <CompletionRing rate={stats.completionRate} />
            <View style={st.ringInfo}>
              <Text style={st.ringInfoTitle}>
                {stats.total === 0 ? '기록 없음' : stats.completionRate >= 0.9 ? '훌륭해요! 🏆' : stats.completionRate >= 0.6 ? '잘 하고 있어요' : '더 노력해 봐요'}
              </Text>
              <Text testID="txt-count-summary" style={st.ringInfoSub}>
                완료 {stats.taken}건 / 전체 {stats.total}건
              </Text>
              {tab === 'week' && stats.total > 0 && stats.missed === 0 && (
                <Text testID="txt-perfect-week" style={st.perfectWeekTxt}>이번 주 완벽해요! 🏆</Text>
              )}
            </View>
          </View>

          {/* ── 3가지 지표 ── */}
          <View style={st.metricsRow}>
            <MetricCard icon="🔥" value={streakLabel} label="연속 복용"  color="#f97316" />
            <MetricCard icon="💊" value={`${stats.taken}회`} label="복용 완료" color="#22c55e" />
            <MetricCard icon="❌" value={`${stats.missed}회`} label="누락"     color="#ef4444" />
          </View>

          {/* ── 차트 카드 ── */}
          <View style={st.card}>
            <Text style={st.cardTitle}>
              {tab === 'week' ? '요일별 복용 현황' : '월별 복용 현황'}
            </Text>
            {tab === 'week'
              ? <WeekBars byDayOfWeek={stats.byDayOfWeek} />
              : <MonthBars bars={monthBars} />
            }
          </View>

          {/* ── 누락 패턴 카드 ── */}
          <View style={st.card}>
            <Text style={st.cardTitle}>자주 누락되는 시간대</Text>
            <MissedList patterns={patterns} />
          </View>

          {/* ── AI 코칭 ── */}
          <CoachingSection />

        </ScrollView>
      )}
    </View>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#f2f2f7' },
  container: { flex: 1, backgroundColor: '#f2f2f7' },

  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  // 세그먼트 컨트롤
  segment: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 2,
  },
  segBtn:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  segBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  segTxt:       { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  segTxtActive: { color: '#111827', fontWeight: '700' },

  scroll:      { paddingHorizontal: 16, paddingBottom: 40 },
  periodLabel: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 14, marginBottom: 4 },

  // 링 카드
  ringCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    flexDirection: 'row', alignItems: 'center', gap: 20,
    marginTop: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  ringPct:   { fontSize: 34, fontWeight: '800' },
  ringLabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  ringInfo:  { flex: 1 },
  ringInfoTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4 },
  ringInfoSub:   { fontSize: 13, color: '#6b7280' },
  perfectWeekTxt: { fontSize: 13, color: '#16a34a', fontWeight: '600', marginTop: 4 },
  ringInfoLate:  { fontSize: 12, color: '#f97316', marginTop: 4 },

  // 지표 카드 행
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  metricCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  metricIcon:  { fontSize: 22, marginBottom: 6 },
  metricValue: { fontSize: 20, fontWeight: '800' },
  metricLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2, textAlign: 'center' },

  // 일반 카드
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, marginTop: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 16 },

  // 세로 막대 차트
  barsWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 120 },
  barCol:   { alignItems: 'center', gap: 4, flex: 1 },
  barPctTxt:  { fontSize: 10, color: '#9ca3af', height: 14 },
  barTrackV:  { width: 20, height: 80, backgroundColor: '#f3f4f6', borderRadius: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  barFillV:   { width: '100%', borderRadius: 10 },
  barDayTxt:  { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // 누락 패턴
  patternRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  patternRankBadge:{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  patternRankTxt:  { fontSize: 12, fontWeight: '700' },
  patternSlot:     { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },
  patternCount:    { fontSize: 13, color: '#ef4444', fontWeight: '500' },

  emptyTxt: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
});
