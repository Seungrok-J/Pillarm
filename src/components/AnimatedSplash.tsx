import React, { useEffect } from 'react';
import { StyleSheet, Image, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

interface Props {
  /** true인 동안 계속 보임. false로 바뀌면 fade-out 애니메이션 후 onExited 호출 */
  visible: boolean;
  onExited?: () => void;
}

/**
 * JS 단(reanimated)에서 그리는 커스텀 스플래시.
 * 네이티브 스플래시(정적 이미지)는 App 마운트 직후 바로 내리고, 이 컴포넌트가
 * 앱 초기화가 끝날 때까지 애니메이션으로 이어받는다.
 */
export default function AnimatedSplash({ visible, onExited }: Props) {
  const iconScale   = useSharedValue(0.7);
  const iconRotate  = useSharedValue(-6);
  const iconOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const textY       = useSharedValue(8);
  const containerOpacity = useSharedValue(1);

  // 등장 애니메이션 — 아이콘이 살짝 회전하며 스프링으로 튀어오르듯 나타난 뒤,
  // 대기 시간 동안 은은하게 숨쉬듯 반복 확대/축소된다.
  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 260 });
    iconRotate.value  = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    iconScale.value = withSpring(1, { damping: 9, stiffness: 120 }, (finished) => {
      if (finished) {
        iconScale.value = withRepeat(
          withSequence(
            withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
        );
      }
    });
    textOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
    textY.value        = withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 종료 애니메이션 — visible이 false가 되면 살짝 커지며 사라진다
  useEffect(() => {
    if (!visible) {
      containerOpacity.value = withTiming(0, { duration: 280 }, (finished) => {
        if (finished && onExited) runOnJS(onExited)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [
      { scale: iconScale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Animated.View style={iconStyle}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.icon}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={styles.title}>필람</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  icon:  { width: 140, height: 140 },
  title: { marginTop: 18, fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
});
