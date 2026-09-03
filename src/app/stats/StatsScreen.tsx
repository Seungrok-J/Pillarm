import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions, RefreshControl, type DimensionValue } from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useDoseEventStore, usePointStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
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
  if (r >= 0.9) return '#00b894';
  if (r >= 0.6) return '#3182f6';
  if (r > 0)    return '#ff7675';
  return '#8b95a1';
}

// ── 완료율 도넛 ───────────────────────────────────────────────────────────────

const RING = { size: 90, cx: 45, cy: 45, r: 37, sw: 10 };
const CIRC = 2 * Math.PI * RING.r;

function CompletionRing({ rate }: { rate: number }) {
  const clamped = Math.min(1, Math.max(0, rate));
  const offset  = CIRC * (1 - clamped);
  const color   = rateColor(clamped);
  const pct     = `${Math.round(clamped * 100)}%`;
  return (
    <View style={{ width: RING.size, height: RING.size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING.size} height={RING.size}>
        <Circle cx={RING.cx} cy={RING.cy} r={RING.r} stroke="#f2f3f4" strokeWidth={RING.sw} fill="none" />
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
        <Text testID="gauge-percentage" style={st.ringPct}>{pct}</Text>
      </View>
    </View>
  );
}

// ── 지표 카드 (작은 것) ───────────────────────────────────────────────────────

function MetricCard({ icon, value, label, iconBg }: { icon: string; value: string; label: string; iconBg: string }) {
  return (
    <View style={st.metricCard}>
      <View style={[st.metricIconWrap, { backgroundColor: iconBg }]}>
        <Text style={st.metricIcon}>{icon}</Text>
      </View>
      <Text style={st.metricLabel}>{label}</Text>
      <Text style={st.metricValue}>{value}</Text>
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
        const barH = pct != null ? Math.max(8, (pct / 100) * 80) : 8;
        const color = pct != null ? rateColor(day.completionRate) : '#f2f3f4';
        return (
          <View key={dow} style={st.barCol}>
            <Text style={[st.barPctTxt, { color }]}>{pct != null ? `${Math.round(pct)}%` : ''}</Text>
            <View style={st.barTrackV}>
              <View style={[st.barFillV, { height: barH, backgroundColor: color }]} />
            </View>
            <Text style={[st.barDayTxt, pct == null && { color: '#8b95a1' }]}>{DOW_LABELS[dow]}</Text>
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
        const barH = pct != null ? Math.max(8, (pct / 100) * 80) : 8;
        const color = pct != null ? rateColor(b.rate) : '#f2f3f4';
        return (
          <View key={b.ym} style={st.barCol}>
            <Text style={[st.barPctTxt, { fontSize: 9, color }]}>{pct != null ? `${Math.round(pct)}%` : ''}</Text>
            <View style={st.barTrackV}>
              <View style={[st.barFillV, { height: barH, backgroundColor: color }]} />
            </View>
            <Text style={[st.barDayTxt, { fontSize: 10 }, pct == null && { color: '#8b95a1' }]}>{b.label}</Text>
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
    return <Text testID="txt-no-missed-patterns" style={[st.emptyTxt, { color: '#00b894' }]}>누락된 복용이 없어요 👍</Text>;
  }
  const [top, ...rest] = top3;
  return (
    <View testID="missed-pattern-list" style={{ gap: 10 }}>
      <View style={st.alertBox}>
        <Ionicons name="warning" size={18} color="#ff7675" />
        <Text style={st.alertBoxText}>
          <Text testID="missed-slot-0">{top.timeSlot}</Text>
          {' 복용 일정이 자주 누락됩니다 ('}
          <Text testID="missed-count-0">{`${top.count}회`}</Text>
          {')'}
        </Text>
      </View>
      {rest.map((p, i) => (
        <View key={p.timeSlot} style={st.patternRow}>
          <Text testID={`missed-slot-${i + 1}`} style={st.patternSlot}>{p.timeSlot}</Text>
          <Text testID={`missed-count-${i + 1}`} style={st.patternCount}>{`${p.count}회`}</Text>
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

  const { fetchByDateRange }         = useDoseEventStore();
  const { streak, fetchBalance }     = usePointStore();
  const { userId }                   = useAuthStore();

  const range = tab === 'week' ? getWeekRange() : getMonthRange();

  // 탭 포커스 or 계정 전환 시 재조회 (userId 변경 감지 포함)
  useFocusEffect(
    useCallback(() => {
      const r = tab === 'week' ? getWeekRange() : getMonthRange();
      setIsLoading(true);
      fetchBalance();
      fetchByDateRange(r.start, r.end).then((result) => {
        setEvents(result);
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, userId]),
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

      {/* ── 상단 헤더: 토글 스위치 + 기간 표시 ── */}
      <View style={st.header}>
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
        <View style={st.dateRangeRow}>
          <Text style={st.dateRangeText}>{range.label}</Text>
          <Ionicons name="calendar-outline" size={18} color="#191f28" />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator testID="loading-indicator" style={{ marginTop: 60 }} color="#3182f6" size="large" />
      ) : (
        <ScrollView
          testID="stats-scroll"
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3182f6" />
          }
        >

          {/* ── 완료율 카드 ── */}
          <View style={st.ringCard}>
            <CompletionRing rate={stats.completionRate} />
            <View style={st.ringInfo}>
              <Text style={st.ringInfoTitle}>
                {stats.total === 0 ? '기록 없음' : stats.completionRate >= 0.9 ? '훌륭해요! 🏆' : stats.completionRate >= 0.6 ? '꾸준히 잘하고 있어요!' : '더 노력해 봐요'}
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
            <MetricCard icon="🔥" value={streakLabel} label="연속 복용"  iconBg="#e8f3ff" />
            <MetricCard icon="💊" value={`${stats.taken}회`} label="복용 완료" iconBg="#e6f7f4" />
            <MetricCard icon="❌" value={`${stats.missed}회`} label="누락/패스" iconBg="#ffebeb" />
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
  safe:      { flex: 1, backgroundColor: '#f2f4f7' },
  container: { flex: 1, backgroundColor: '#f2f4f7' },

  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e8eb',
  },

  // 토글 스위치
  segment: {
    flexDirection: 'row',
    backgroundColor: '#f2f3f4',
    borderRadius: 100,
    padding: 4,
  },
  segBtn:       { flex: 1, paddingVertical: 8, borderRadius: 100, alignItems: 'center' },
  segBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  segTxt:       { fontSize: 14, color: '#8b95a1', fontWeight: '700' },
  segTxtActive: { color: '#3182f6' },

  dateRangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateRangeText: { fontSize: 14, fontWeight: '700', color: '#191f28' },

  scroll: { padding: 20, gap: 16, paddingBottom: 40 },

  // 완료율 카드
  ringCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 20,
    borderWidth: 1, borderColor: '#e5e8eb',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  ringPct:   { fontSize: 18, fontWeight: '800', color: '#191f28' },
  ringInfo:  { flex: 1, gap: 6 },
  ringInfoTitle: { fontSize: 16, fontWeight: '700', color: '#191f28' },
  ringInfoSub:   { fontSize: 12, color: '#4e5968', lineHeight: 18 },
  perfectWeekTxt: { fontSize: 13, color: '#00b894', fontWeight: '600' },

  // 지표 카드 행
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'flex-start', gap: 8,
    borderWidth: 1, borderColor: '#e5e8eb',
  },
  metricIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  metricIcon:  { fontSize: 16 },
  metricValue: { fontSize: 16, fontWeight: '700', color: '#191f28' },
  metricLabel: { fontSize: 12, color: '#4e5968' },

  // 일반 카드
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 16,
    borderWidth: 1, borderColor: '#e5e8eb',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#191f28' },

  // 세로 막대 차트
  barsWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130 },
  barCol:   { alignItems: 'center', gap: 8, width: 32 },
  barPctTxt:  { fontSize: 10, fontWeight: '600', height: 14 },
  barTrackV:  { width: 14, height: 80, justifyContent: 'flex-end', overflow: 'hidden' },
  barFillV:   { width: '100%', borderRadius: 100 },
  barDayTxt:  { fontSize: 12, fontWeight: '700', color: '#191f28', marginTop: 2 },

  // 누락 패턴
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#ffebeb', borderRadius: 10, padding: 12,
  },
  alertBoxText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#ff7675' },
  patternRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  patternSlot:     { fontSize: 13, fontWeight: '600', color: '#4e5968' },
  patternCount:    { fontSize: 13, color: '#8b95a1', fontWeight: '500' },

  emptyTxt: { fontSize: 14, color: '#8b95a1', textAlign: 'center', paddingVertical: 12 },
});
