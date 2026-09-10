import React from 'react';
import { View, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useLargeFont } from '../utils/fontScale';

export interface AlertModalButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

/** 아이콘 뱃지·버튼 색을 함께 결정하는 톤 — 브랜드 컬러 토큰과 동일한 값을 재사용한다 */
export type AlertModalTone = 'primary' | 'success' | 'danger' | 'warning';

interface AlertModalProps {
  visible: boolean;
  /** Ionicons 아이콘 이름. 이모지 대신 원형 뱃지 안에 그려진다. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  tone?: AlertModalTone;
  title: string;
  message?: string;
  buttons: AlertModalButton[];
  onRequestClose?: () => void;
}

/** 이 길이부터는 큰 글씨에서 한 칸에 안 들어간다(카드 폭 기준 실측) */
const LONG_LABEL_CHARS = 4;

const TONE_COLORS: Record<AlertModalTone, { bg: string; fg: string }> = {
  primary: { bg: '#eff6ff', fg: '#3b82f6' },
  success: { bg: '#f0fdf4', fg: '#16a34a' },
  danger:  { bg: '#fef2f2', fg: '#ef4444' },
  warning: { bg: '#fffbeb', fg: '#f59e0b' },
};

/** 시스템 Alert.alert 대신 쓰는 앱 스타일 확인창 — 원형 아이콘 뱃지·둥근 카드·브랜드 색상 버튼 */
export default function AlertModal({ visible, icon, tone = 'primary', title, message, buttons, onRequestClose }: AlertModalProps) {
  const toneColor = TONE_COLORS[tone];
  const largeFont = useLargeFont();

  // 버튼 두 개를 나란히 두면 큰 글씨에서 긴 라벨이 쪼개진다("계속 등/록").
  // '취소'·'확인' 같은 짧은 라벨은 나란히 둬도 멀쩡하므로 길 때만 세로로 쌓는다.
  const hasLongLabel = buttons.some((b) => b.text.length >= LONG_LABEL_CHARS);
  const stacked = buttons.length > 2 || (largeFont && hasLongLabel);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {icon ? (
            <View style={[styles.iconBadge, { backgroundColor: toneColor.bg }]}>
              <Ionicons name={icon} size={30} color={toneColor.fg} />
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.btnRow, stacked && styles.btnCol]}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  b.style === 'destructive'
                    ? styles.btnDestructive
                    : b.style === 'cancel'
                      ? styles.btnCancel
                      : { backgroundColor: toneColor.fg },
                ]}
                onPress={b.onPress}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.btnText,
                    b.style === 'destructive' ? styles.btnTextDestructive
                      : b.style === 'cancel' ? styles.btnTextCancel
                      : styles.btnTextDefault,
                  ]}
                >
                  {b.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(17,24,39,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 28,
    paddingTop: 28, paddingBottom: 20, paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  iconBadge: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  message: {
    fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 21,
    marginTop: 8,
  },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 22, width: '100%' },
  btnCol: { flexDirection: 'column' },
  btn: {
    flex: 1, minHeight: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  btnCancel:      { backgroundColor: '#f3f4f6' },
  btnDestructive: { backgroundColor: '#fef2f2' },

  btnText:            { fontSize: 15, fontWeight: '700' },
  btnTextDefault:     { color: '#fff' },
  btnTextCancel:      { color: '#374151' },
  btnTextDestructive: { color: '#ef4444' },
});
