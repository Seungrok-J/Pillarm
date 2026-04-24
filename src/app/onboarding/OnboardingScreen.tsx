import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermission } from '../../notifications';

// ── 슬라이드 데이터 ───────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    emoji: '⏰',
    title: '제때 약을 챙기기\n어렵지 않으셨나요?',
    subtitle: '필람이 정확한 시간에 복용 알림을 드립니다',
  },
  {
    id: '2',
    emoji: '✅',
    title: '한 번의 탭으로\n복용 완료',
    subtitle: '복잡한 절차 없이 탭 한 번으로 기록됩니다',
  },
  {
    id: '3',
    emoji: '📊',
    title: '꾸준히 복용하는\n습관을 만들어요',
    subtitle: '복용 통계로 나의 패턴을 확인하고\n건강한 루틴을 만들어 보세요',
  },
];

export const ONBOARDING_KEY = 'onboarding_done';

// ── 화면 ──────────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const isLast = currentIndex === SLIDES.length - 1;

  function handleNext() {
    if (isLast) return;
    const nextIndex = currentIndex + 1;
    flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    setCurrentIndex(nextIndex);
  }

  async function handleStart() {
    await requestNotificationPermission();
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
  }

  function renderSlide({ item }: { item: Slide }) {
    return (
      <View
        testID={`slide-${item.id}`}
        style={[styles.slide, { width: SCREEN_WIDTH }]}
      >
        <Text style={styles.emoji}>{item.emoji}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="screen-onboarding">
      {/* 슬라이드 */}
      <FlatList<Slide>
        ref={flatListRef}
        testID="onboarding-slides"
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* 페이지 도트 */}
      <View style={styles.dots} testID="page-dots">
        {SLIDES.map((_, i) => (
          <View
            key={i}
            testID={`dot-${i}`}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          testID={isLast ? 'btn-start' : 'btn-next'}
          onPress={isLast ? handleStart : handleNext}
          style={styles.btn}
          accessibilityLabel={isLast ? '시작하기' : '다음'}
        >
          <Text style={styles.btnText}>{isLast ? '시작하기' : '다음'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
  },
  emoji: { fontSize: 72, marginBottom: 32 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 24,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  dotActive: { backgroundColor: '#3b82f6', width: 20 },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  btn: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
