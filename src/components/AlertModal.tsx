import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

export interface AlertModalButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertModalProps {
  visible: boolean;
  icon?: string;
  title: string;
  message?: string;
  buttons: AlertModalButton[];
  onRequestClose?: () => void;
}

/** 시스템 Alert.alert 대신 쓰는 앱 스타일 확인창 — 아이콘·둥근 카드·브랜드 색상 버튼 */
export default function AlertModal({ visible, icon, title, message, buttons, onRequestClose }: AlertModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.btnRow, buttons.length > 2 && styles.btnCol]}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  b.style === 'destructive' ? styles.btnDestructive
                    : b.style === 'cancel' ? styles.btnCancel
                    : styles.btnDefault,
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
    width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 20,
    paddingTop: 28, paddingBottom: 18, paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  icon:  { fontSize: 40, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: '#111827', textAlign: 'center' },
  message: {
    fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 21,
    marginTop: 8,
  },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 22, width: '100%' },
  btnCol: { flexDirection: 'column' },
  btn: {
    flex: 1, minHeight: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  btnDefault:     { backgroundColor: '#3b82f6' },
  btnCancel:      { backgroundColor: '#f3f4f6' },
  btnDestructive: { backgroundColor: '#fef2f2' },

  btnText:            { fontSize: 15, fontWeight: '700' },
  btnTextDefault:     { color: '#fff' },
  btnTextCancel:      { color: '#374151' },
  btnTextDestructive: { color: '#ef4444' },
});
