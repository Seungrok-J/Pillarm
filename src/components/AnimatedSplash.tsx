import React, { useEffect } from 'react';
import { StyleSheet, Image, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
  // 아이콘은 네이티브 스플래시와 동일한 크기·불투명도·각도(scale 1 / opacity 1 / rotate 0)로
  // 시작한다 — 네이티브 → JS 전환 순간에 아이콘이 튀거나 커지는 "점프"가 보이지 않게 하기 위함.
  const iconScale   = useSharedValue(1);
  const iconOpacity = useSharedValue(1);
  const textOpacity = useSharedValue(0);
  const textY       = useSharedValue(8);
  const containerOpacity = useSharedValue(1);

  // 등장 애니메이션 — 아이콘은 이미 보이는 상태에서 살짝 통통 튀어 "살아있다"는 느낌만 더하고,
  // 이후 텍스트가 이어서 나타난다. 대기 시간 동안은 은은하게 숨쉬듯 반복 확대/축소된다.
  useEffect(() => {
    iconScale.value = withSequence(
      withTiming(1.08, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 220, easing: Easing.inOut(Easing.quad) }),
    );
    const t = setTimeout(() => {
      iconScale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    }, 440);
    textOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
    textY.value        = withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) });
    return () => clearTimeout(t);
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
    transform: [{ scale: iconScale.value }],
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
  // app.json의 expo-splash-screen 플러그인 imageWidth(200)와 동일한 값 — 두 플랫폼 모두 이 크기로
  // 고정 렌더링되므로(추정이 아니라 명시값) 네이티브→JS 전환 시 크기 점프가 생기지 않는다.
  icon:  { width: 200, height: 200 },
  title: { marginTop: 18, fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
});
