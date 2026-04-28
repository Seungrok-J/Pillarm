import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  type DimensionValue,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useDoseEventStore } from '../../store';
import {
  calculateWeeklyStats,
  calculateMissedPatterns,
  type DayStats,
  type MissedPattern,
} from '../../utils/statsCalculator';
import type { DoseEvent } from '../../domain';
import CoachingSection from '../../features/aiCoaching/CoachingSection';

// ── 날짜 범위 유틸 ────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getWeekRange(): { start: string; end: string } {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + daysToMonday);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: `${fmt(mon)}T00:00:00`, end: `${fmt(sun)}T23:59:59` };
}

function getMonthRange(): { start: string; end: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${pad(m)}-01T00:00:00`,
    end: `${y}-${pad(m)}-${pad(lastDay)}T23:59:59`,
  };
}

// ── SVG 게이지 ────────────────────────────────────────────────────────────────

const GAUGE_SIZE = 140;
const GAUGE_CX = 70;
const GAUGE_CY = 70;
const GAUGE_R = 54;
const CIRCUMFERENCE = 2 * Math.PI * GAUGE_R;

function gaugeColor(rate: number): string {
  if (rate >= 1) return '#22c55e';
  if (rate >= 0.5) return '#3b82f6';
  if (rate > 0) return '#f97316';
  return '#ef4444';
}

interface GaugeProps {
  rate: number;
}

function CompletionGauge({ rate }: GaugeProps) {
  const clamped = Math.min(1, Math.max(0, rate));
  const offset = CIRCUMFERENCE * (1 - clamped);
  const color = gaugeColor(clamped);

  return (
    <View style={styles.gaugeWrapper} testID="completion-gauge">
      <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
        {/* 배경 트랙 */}
        <Circle
          cx={GAUGE_CX}
          cy={GAUGE_CY}
          r={GAUGE_R}
          stroke="#e5e7eb"
          strokeWidth={12}
          fill="none"
        />
        {/* 진행 아크 */}
        <Circle
          cx={GAUGE_CX}
          cy={GAUGE_CY}
          r={GAUGE_R}
          stroke={color}
          strokeWidth={12}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${GAUGE_CX}, ${GAUGE_CY})`}
        />
      </Svg>
      {/* 중앙 퍼센트 텍스트 (absolute overlay) */}
      <View style={styles.gaugeCenter} pointerEvents="none">
        <Text testID="gauge-percentage" style={[styles.gaugePct, { color }]}>
          {`${Math.round(clamped * 100)}%`}
        </Text>
      </View>
    </View>
  );
}

// ── 요일 막대 차트 ────────────────────────────────────────────────────────────

const DOW_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~토~일

interface DayBarsProps {
  byDayOfWeek: DayStats[];
}

function DayBars({ byDayOfWeek }: DayBarsProps) {
  return (
    <View testID="day-bars">
      {DOW_DISPLAY_ORDER.map((dow) => {
        const day = byDayOfWeek[dow];
        const pct = day.total > 0 ? Math.round(day.completionRate * 100) : null;
        return (
          <View key={dow} style={styles.barRow}>
            <Text style={styles.barDayLabel}>{day.label}</Text>
            <View style={styles.barTrack}>
              {pct != null && (
                <View
                  testID={`bar-fill-${dow}`}
                  style={[
                    styles.barFill,
                    {
                      width: `${pct}%` as DimensionValue,
                      backgroundColor: gaugeColor(day.completionRate),
                    },
                  ]}
                />
              )}
            </View>
            <Text
              testID={`bar-pct-${dow}`}
              style={styles.barPct}
            >
              {pct != null ? `${pct}%` : '-'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 누락 패턴 리스트 ──────────────────────────────────────────────────────────

interface MissedPatternsProps {
  patterns: MissedPattern[];
}

function MissedPatternList({ patterns }: MissedPatternsProps) {
  const top3 = patterns.slice(0, 3);

  if (top3.length === 0) {
    return (
      <Text testID="txt-no-missed-patterns" style={styles.noPatternText}>
        누락된 복용이 없어요 👍
      </Text>
    );
  }

  return (
    <View testID="missed-pattern-list">
      {top3.map((p, i) => (
        <View
          key={p.timeSlot}
          testID={`missed-pattern-${i}`}
          style={styles.patternRow}
        >
          <Text style={styles.patternRank}>{i + 1}위</Text>
          <Text testID={`missed-slot-${i}`} style={styles.patternSlot}>
            {p.timeSlot}
          </Text>
          <Text testID={`missed-count-${i}`} style={styles.patternCount}>
            {`${p.count}회`}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── 화면 ──────────────────────────────────────────────────────────────────────

type Tab = 'week' | 'month';

export default function StatsScreen() {
  const [tab, setTab] = useState<Tab>('week');
  const [events, setEvents] = useState<DoseEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { fetchByDateRange } = useDoseEventStore();

  useEffect(() => {
    const range = tab === 'week' ? getWeekRange() : getMonthRange();
    setIsLoading(true);
    fetchByDateRange(range.start, range.end).then((result) => {
      setEvents(result);
      setIsLoading(false);
    });
  }, [tab]);

  const stats = useMemo(() => calculateWeeklyStats(events), [events]);
  const patterns = useMemo(() => calculateMissedPatterns(events), [events]);

  const isPerfectWeek =
    tab === 'week' && stats.total > 0 && stats.missed === 0;

  return (
    <View style={styles.container} testID="screen-stats">
      {/* 탭 */}
      <View style={styles.tabRow}>
        {(['week', 'month'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            testID={`tab-${t}`}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityLabel={t === 'week' ? '이번 주 통계' : '이번 달 통계'}
            accessibilityState={{ selected: tab === t }}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'week' ? '이번 주' : '이번 달'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator testID="loading-indicator" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          testID="stats-scroll"
          contentContainerStyle={styles.scrollContent}
        >
          {/* 완료율 게이지 섹션 */}
          <View style={styles.section}>
            <CompletionGauge rate={stats.completionRate} />

            {/* 누락 0건 완벽 메시지 */}
            {isPerfectWeek && (
              <Text testID="txt-perfect-week" style={styles.perfectText}>
                이번 주 완벽해요! 🏆
              </Text>
            )}

            {/* 완료/전체 카운트 */}
            <Text testID="txt-count-summary" style={styles.countSummary}>
              완료 {stats.taken}건 / 전체 {stats.total}건
            </Text>
          </View>

          {/* 요일별 완료율 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>요일별 완료율</Text>
            <DayBars byDayOfWeek={stats.byDayOfWeek} />
          </View>

          {/* 가장 많이 누락된 시간대 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>가장 많이 누락된 시간대</Text>
            <MissedPatternList patterns={patterns} />
          </View>

          {/* AI 코칭 섹션 */}
          <CoachingSection />
        </ScrollView>
      )}
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  // 탭
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: { fontSize: 15, color: '#9ca3af' },
  tabTextActive: { color: '#3b82f6', fontWeight: '600' },

  scrollContent: { paddingBottom: 40 },

  // 섹션
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    alignSelf: 'flex-start',
    marginBottom: 12,
  },

  // 게이지
  gaugeWrapper: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugePct: { fontSize: 28, fontWeight: '700' },
  perfectText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#22c55e',
    marginTop: 12,
  },
  countSummary: { fontSize: 13, color: '#6b7280', marginTop: 6 },

  // 막대 차트
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  barDayLabel: { width: 24, fontSize: 13, color: '#374151', textAlign: 'center' },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 5,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 5 },
  barPct: { width: 36, fontSize: 12, color: '#6b7280', textAlign: 'right' },

  // 누락 패턴
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  patternRank: { width: 32, fontSize: 13, color: '#9ca3af' },
  patternSlot: { flex: 1, fontSize: 15, fontWeight: '600', color: '#374151' },
  patternCount: { fontSize: 14, color: '#ef4444' },
  noPatternText: { fontSize: 14, color: '#16a34a', paddingVertical: 8 },
});
