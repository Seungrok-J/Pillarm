import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { AppText as Text } from '../../components/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useDoseEventStore } from '../../store';
import { getAllSchedules } from '../../db';
import { useAuthStore } from '../../store/authStore';
import type { Schedule } from '../../domain';
import { generateCoachingMessages, type CoachingMessage } from './coachingEngine';

const COACHING_KEY    = '@pillarm/coaching_last_refresh';
const WEEK_MS         = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000;

const TYPE_CONFIG: Record<
  CoachingMessage['type'],
  { icon: string; color: string; bg: string }
> = {
  suggest_time_change: { icon: '⏰', color: '#eca154', bg: '#fef5ec' },
  suggest_delay:       { icon: '💤', color: '#3182f6', bg: '#e8f3ff' },
  praise:              { icon: '🏆', color: '#00b894', bg: '#e6f7f4' },
};

type Nav = StackNavigationProp<RootStackParamList>;

export default function CoachingSection() {
  const navigation = useNavigation<Nav>();
  const { fetchByDateRange } = useDoseEventStore();

  const [messages,    setMessages]    = useState<CoachingMessage[]>([]);
  const [schedules,   setSchedules]   = useState<Schedule[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored    = await AsyncStorage.getItem(COACHING_KEY);
        const lastDate  = stored ? new Date(stored) : null;
        const now       = new Date();
        const needsNew  = !lastDate || now.getTime() - lastDate.getTime() >= WEEK_MS;

        const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
        const [events, allSchedules] = await Promise.all([
          fetchByDateRange(cutoff, now.toISOString()),
          getAllSchedules(useAuthStore.getState().userId ?? 'local'),
        ]);

        setSchedules(allSchedules);
        const msgs = generateCoachingMessages(events, allSchedules);
        setMessages(msgs);

        if (needsNew) {
          await AsyncStorage.setItem(COACHING_KEY, now.toISOString());
          setLastRefresh(now.toISOString());
        } else {
          setLastRefresh(stored!);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleQuickFix(msg: CoachingMessage) {
    if (!msg.scheduleId) return;
    const schedule = schedules.find((s) => s.id === msg.scheduleId);
    if (!schedule) return;
    navigation.navigate('ScheduleEdit', {
      scheduleId:    msg.scheduleId,
      medicationId:  schedule.medicationId,
      suggestedTime: msg.suggestedTime,
    });
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#3182f6" />
      </View>
    );
  }

  if (messages.length === 0) return null;

  const lastRefreshLabel = lastRefresh
    ? (() => {
        const diffDays = Math.floor(
          (Date.now() - new Date(lastRefresh).getTime()) / 86_400_000,
        );
        return diffDays === 0 ? '오늘' : `${diffDays}일 전`;
      })()
    : null;

  return (
    <View testID="coaching-section" style={styles.container}>
      {/* 섹션 헤더 */}
      <View style={styles.header}>
        <Text style={styles.title}>AI 코칭 🤖</Text>
        {lastRefreshLabel && (
          <Text style={styles.subtitle}>마지막 업데이트: {lastRefreshLabel}</Text>
        )}
      </View>

      {/* 메시지 카드 리스트 */}
      <View style={styles.cardList}>
        {messages.map((msg) => {
          const cfg = TYPE_CONFIG[msg.type];
          return (
            <View
              key={msg.id}
              testID={`coaching-card-${msg.type}`}
              style={[styles.card, { backgroundColor: cfg.bg }]}
            >
              <Text style={styles.cardIcon}>{cfg.icon}</Text>
              <Text style={[styles.cardText, { color: cfg.color }]}>{msg.message}</Text>
              {msg.scheduleId && (
                <TouchableOpacity
                  testID={`btn-quickfix-${msg.id}`}
                  style={styles.quickFixBtn}
                  onPress={() => handleQuickFix(msg)}
                  accessibilityRole="button"
                  accessibilityLabel="바로 수정"
                >
                  <Text style={styles.quickFixText}>바로 수정 →</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: 16, alignItems: 'center' },

  container: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e8eb',
    gap: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title:    { fontSize: 14, fontWeight: '700', color: '#191f28' },
  subtitle: { fontSize: 12, color: '#8b95a1' },

  cardList: { gap: 12 },
  card: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardIcon: { fontSize: 20 },
  cardText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },

  quickFixBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(49,130,246,0.1)',
    borderRadius: 8,
  },
  quickFixText: { fontSize: 13, color: '#3182f6', fontWeight: '700' },
});
