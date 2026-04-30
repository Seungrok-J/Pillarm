import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { usePointStore } from '../../store';
import type { PointLedger, PointReason } from '../../domain';

type Nav = StackNavigationProp<RootStackParamList>;

// ── 상수 ─────────────────────────────────────────────────────────────────────

const ICON: Record<PointReason, string> = {
  dose_taken:     '💊',
  streak_7days:   '🔥',
  perfect_week:   '🏆',
  theme_purchase: '🛍️',
  badge_unlock:   '🏅',
};

const LABEL: Record<PointReason, string> = {
  dose_taken:     '복용 완료',
  streak_7days:   '7일 연속 달성',
  perfect_week:   '완벽한 주',
  theme_purchase: '테마 구매',
  badge_unlock:   '배지 잠금 해제',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function PointHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { balance, history, fetchBalance, fetchHistory } = usePointStore();

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
      fetchHistory();
    }, []),
  );

  function renderItem({ item }: { item: PointLedger }) {
    const gain = item.delta > 0;
    return (
      <View testID={`history-item-${item.id}`} style={styles.item}>
        <Text style={styles.itemIcon}>{ICON[item.reason]}</Text>
        <View style={styles.itemBody}>
          <Text style={styles.itemLabel}>{LABEL[item.reason]}</Text>
          <Text style={styles.itemDate}>{fmtDate(item.createdAt)}</Text>
        </View>
        <Text
          testID={`history-delta-${item.id}`}
          style={[styles.delta, gain ? styles.gain : styles.spend]}
        >
          {gain ? `+${item.delta}` : String(item.delta)}P
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <View style={styles.container} testID="screen-point-history">
      {/* 잔액 카드 */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceSub}>현재 포인트</Text>
        <View style={styles.balanceRow}>
          <Text testID="txt-balance" style={styles.balanceValue}>
            {balance.toLocaleString()}
          </Text>
          <Text style={styles.balanceUnit}>P</Text>
        </View>
      </View>

      {/* 테마 상점 버튼 */}
      <TouchableOpacity
        testID="btn-theme-shop"
        onPress={() => navigation.navigate('ThemeShop')}
        style={styles.shopBtn}
        accessibilityLabel="테마 상점 열기"
        accessibilityRole="button"
      >
        <Text style={styles.shopBtnText}>🎨  테마 상점</Text>
      </TouchableOpacity>

      {/* 내역 */}
      <FlatList<PointLedger>
        testID="list-point-history"
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ListHeaderComponent={
          history.length > 0
            ? <Text style={styles.sectionTitle}>포인트 내역</Text>
            : null
        }
        ListEmptyComponent={
          <Text testID="txt-no-history" style={styles.emptyText}>
            포인트 내역이 없습니다
          </Text>
        }
      />
    </View>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:     { flex: 1, backgroundColor: '#3b82f6' },
  container:    { flex: 1, backgroundColor: '#f9fafb' },

  balanceCard: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  balanceSub:   { color: '#bfdbfe', fontSize: 14, marginBottom: 4 },
  balanceRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  balanceValue: { color: '#fff', fontSize: 48, fontWeight: '800', lineHeight: 56 },
  balanceUnit:  { color: '#bfdbfe', fontSize: 20, fontWeight: '600', marginBottom: 6 },

  shopBtn: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  shopBtnText: { fontSize: 16, fontWeight: '600', color: '#3b82f6' },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    paddingHorizontal: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  itemIcon:  { fontSize: 24, width: 36 },
  itemBody:  { flex: 1, marginLeft: 4 },
  itemLabel: { fontSize: 16, fontWeight: '500', color: '#111827' },
  itemDate:  { fontSize: 13, color: '#9ca3af', marginTop: 2 },

  delta:  { fontSize: 17, fontWeight: '700', minWidth: 56, textAlign: 'right' },
  gain:   { color: '#16a34a' },
  spend:  { color: '#dc2626' },

  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 48,
    fontSize: 16,
  },
});
