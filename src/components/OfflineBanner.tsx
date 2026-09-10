import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import { useNetworkStore } from '../store/networkStore';

export interface OfflineBannerProps {
  /**
   * 이 화면에서 인터넷이 왜 필요한지. 생략하면 일반 문구를 쓴다.
   * 온라인 전용 화면에서는 이유를 같이 알려주는 편이 낫다.
   */
  message?: string;
  /**
   * 화면 콘텐츠 안에서 카드처럼 놓는다(모서리 둥글게, 아래 여백).
   * 생략하면 앱 최상단 띠 형태 — 상태 표시줄 아래에서 화면 폭을 꽉 채운다.
   */
  inline?: boolean;
}

const DEFAULT_MESSAGE = '오프라인 상태 — 인터넷 연결을 확인해주세요';

export default function OfflineBanner({ message, inline }: OfflineBannerProps) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const insets = useSafeAreaInsets();
  if (isOnline) return null;

  return (
    <View
      testID="offline-banner"
      style={[
        styles.banner,
        inline ? styles.inline : { paddingTop: styles.banner.paddingVertical + insets.top },
      ]}
    >
      <Text style={styles.text}>{message ?? DEFAULT_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1f2937',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  inline: {
    borderRadius: 10,
    marginBottom: 16,
  },
  text: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
