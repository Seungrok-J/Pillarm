import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { THEMES, type Theme } from '../../utils/themeManager';
import { useThemeStore } from '../../store';
import { usePointStore } from '../../store';
import { spendPoints } from '../points/pointEngine';

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function ThemeShopScreen() {
  const { activeTheme, purchasedIds, markPurchased, setTheme } = useThemeStore();
  const { balance, fetchBalance } = usePointStore();

  const [confirmTarget, setConfirmTarget] = useState<Theme | null>(null);
  const [showInsufficient, setShowInsufficient] = useState(false);

  useEffect(() => {
    fetchBalance();
  }, []);

  async function handleBuy(theme: Theme) {
    const ok = await spendPoints('local', theme.price, 'theme_purchase');
    if (!ok) {
      setConfirmTarget(null);
      setShowInsufficient(true);
      return;
    }
    markPurchased(theme.id);
    await setTheme(theme.id);
    setConfirmTarget(null);
    fetchBalance();
  }

  function renderThemeCard({ item }: { item: Theme }) {
    const isActive = activeTheme.id === item.id;
    const isPurchased = purchasedIds.includes(item.id);

    return (
      <View testID={`theme-card-${item.id}`} style={styles.card}>
        {/* 색상 미리보기 */}
        <View style={[styles.swatch, { backgroundColor: item.primary }]} />
        <View style={[styles.swatchAccent, { backgroundColor: item.primaryLight }]} />

        <Text style={styles.themeName}>{item.name}</Text>

        {item.price > 0 ? (
          <Text style={styles.themePrice}>{item.price.toLocaleString()}P</Text>
        ) : (
          <Text style={styles.themePriceFree}>무료</Text>
        )}

        {isActive ? (
          <View style={[styles.actionBtn, styles.activeBtn]}>
            <Text style={styles.activeBtnText}>적용 중</Text>
          </View>
        ) : isPurchased ? (
          <TouchableOpacity
            testID={`btn-apply-${item.id}`}
            style={[styles.actionBtn, styles.applyBtn]}
            onPress={() => setTheme(item.id)}
            accessibilityLabel={`${item.name} 테마 적용`}
            accessibilityRole="button"
          >
            <Text style={styles.applyBtnText}>적용</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID={`btn-buy-${item.id}`}
            style={[styles.actionBtn, styles.buyBtn]}
            onPress={() => setConfirmTarget(item)}
            accessibilityLabel={`${item.name} 테마 구매 ${item.price}포인트`}
            accessibilityRole="button"
          >
            <Text style={styles.buyBtnText}>구매 {item.price}P</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="screen-theme-shop">
      {/* 잔액 표시 */}
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>보유 포인트</Text>
        <Text testID="txt-shop-balance" style={styles.balanceValue}>
          {balance.toLocaleString()}P
        </Text>
      </View>

      <FlatList<Theme>
        data={THEMES}
        keyExtractor={(t) => t.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        renderItem={renderThemeCard}
      />

      {/* 구매 확인 모달 */}
      <Modal
        visible={confirmTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmTarget(null)}
      >
        <View style={styles.overlay}>
          <View testID="modal-confirm" style={styles.modal}>
            <Text style={styles.modalTitle}>테마 구매</Text>
            <Text style={styles.modalBody}>
              <Text style={styles.modalEmphasis}>{confirmTarget?.name}</Text> 테마를{'\n'}
              <Text style={styles.modalEmphasis}>{confirmTarget?.price}P</Text>에 구매할까요?
            </Text>
            <Text style={styles.modalBalance}>현재 잔액: {balance.toLocaleString()}P</Text>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                testID="btn-cancel-confirm"
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setConfirmTarget(null)}
              >
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="btn-confirm-buy"
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={() => confirmTarget && handleBuy(confirmTarget)}
              >
                <Text style={styles.confirmBtnText}>구매</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 잔액 부족 모달 */}
      <Modal
        visible={showInsufficient}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInsufficient(false)}
      >
        <View style={styles.overlay}>
          <View testID="modal-insufficient" style={styles.modal}>
            <Text style={styles.modalTitle}>포인트가 부족해요</Text>
            <Text style={styles.modalBody}>
              약 복용을 완료하면{'\n'}포인트를 적립할 수 있어요! 💊
            </Text>
            <TouchableOpacity
              testID="btn-close-insufficient"
              style={[styles.modalBtn, styles.confirmBtn, { alignSelf: 'center', minWidth: 100 }]}
              onPress={() => setShowInsufficient(false)}
            >
              <Text style={styles.confirmBtnText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f9fafb' },

  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  balanceLabel: { fontSize: 14, color: '#6b7280' },
  balanceValue: { fontSize: 18, fontWeight: '700', color: '#3b82f6' },

  listContent: { padding: 12, paddingBottom: 40 },
  row:         { justifyContent: 'space-between' },

  card: {
    flex: 1,
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    paddingBottom: 14,
    alignItems: 'center',
  },
  swatch:      { width: '100%', height: 64 },
  swatchAccent:{ width: '100%', height: 16 },
  themeName:   { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 12 },
  themePrice:  { fontSize: 13, color: '#6b7280', marginTop: 2 },
  themePriceFree: { fontSize: 13, color: '#16a34a', fontWeight: '600', marginTop: 2 },

  actionBtn: {
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  activeBtn:    { backgroundColor: '#f3f4f6' },
  activeBtnText:{ fontSize: 13, color: '#9ca3af', fontWeight: '600' },
  applyBtn:     { backgroundColor: '#eff6ff' },
  applyBtnText: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
  buyBtn:       { backgroundColor: '#3b82f6' },
  buyBtnText:   { fontSize: 13, color: '#fff', fontWeight: '600' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalTitle:    { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  modalBody:     { fontSize: 15, color: '#374151', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  modalEmphasis: { fontWeight: '700', color: '#3b82f6' },
  modalBalance:  { fontSize: 13, color: '#9ca3af', marginBottom: 20 },
  modalBtns:     { flexDirection: 'row', gap: 12 },
  modalBtn:      { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28 },
  cancelBtn:     { backgroundColor: '#f3f4f6' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  confirmBtn:    { backgroundColor: '#3b82f6' },
  confirmBtnText:{ fontSize: 15, fontWeight: '600', color: '#fff' },
});
