import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence,
  withSpring, withDelay, runOnJS, Easing,
} from 'react-native-reanimated';

interface Props {
  names: [string, string];
  onComplete: () => void;
}

/** 두 일정을 포로 합칠 때 iOS 폴더 생성처럼 박스가 만들어지는 짧은 연출 */
export default function MergeAnimation({ names, onComplete }: Props) {
  const overlayOpacity = useSharedValue(0);
  const progress = useSharedValue(0);
  const boxOpacity = useSharedValue(0);
  const boxScale = useSharedValue(0.6);

  useEffect(() => {
    overlayOpacity.value = withTiming(1, { duration: 150 });
    progress.value = withDelay(150, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    boxOpacity.value = withDelay(420, withTiming(1, { duration: 120 }));
    boxScale.value = withDelay(
      420,
      withSequence(
        withSpring(1.1, { damping: 6, stiffness: 260 }),
        withSpring(1, { damping: 10, stiffness: 260 }),
      ),
    );
    overlayOpacity.value = withDelay(
      1050,
      withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(onComplete)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const boxStyle = useAnimatedStyle(() => ({
    opacity: boxOpacity.value,
    transform: [{ scale: boxScale.value }],
  }));
  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * -46 }],
    opacity: 1 - boxOpacity.value * 0.15,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * 46 }],
    opacity: 1 - boxOpacity.value * 0.15,
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <View style={styles.stage}>
        <Animated.View style={[styles.box, boxStyle]} />
        <Animated.View style={[styles.chip, styles.chipLeft, leftStyle]}>
          <Text style={styles.chipEmoji}>💊</Text>
          <Text numberOfLines={1} style={styles.chipText}>{names[0]}</Text>
        </Animated.View>
        <Animated.View style={[styles.chip, styles.chipRight, rightStyle]}>
          <Text style={styles.chipEmoji}>💊</Text>
          <Text numberOfLines={1} style={styles.chipText}>{names[1]}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.35)',
    alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  stage: { width: 220, height: 120, alignItems: 'center', justifyContent: 'center' },
  box: {
    position: 'absolute', width: 152, height: 96, borderRadius: 22,
    backgroundColor: '#eff6ff', borderWidth: 2, borderColor: '#3b82f6',
  },
  chip: {
    position: 'absolute', width: 92, borderRadius: 14, backgroundColor: '#fff',
    paddingVertical: 10, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  chipLeft:  { left: 12 },
  chipRight: { right: 12 },
  chipEmoji: { fontSize: 18 },
  chipText:  { fontSize: 11, fontWeight: '600', color: '#374151', paddingHorizontal: 6 },
});
