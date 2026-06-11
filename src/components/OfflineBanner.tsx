import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStore } from '../store/networkStore';

export default function OfflineBanner() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>오프라인 상태 — 인터넷 연결을 확인해주세요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#1f2937',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '500',
  },
});
