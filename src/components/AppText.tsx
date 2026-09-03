import React, { forwardRef, useMemo } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { useFontScale, scaledFont } from '../utils/fontScale';

/**
 * 설정의 글씨 크기 배율을 적용하는 Text·TextInput 래퍼.
 *
 * `App.tsx` 가 OS 글꼴 확대(`allowFontScaling`)를 꺼 두었기 때문에, 고령 사용자를 위한
 * 글씨 크기 조절은 앱이 직접 제공해야 한다. 화면마다 fontSize 를 곱하는 대신 여기서
 * 한 번에 처리해서, 새 화면을 만들 때 배율을 잊어버릴 여지를 없앤다.
 *
 * **화면에서는 `react-native` 의 `Text`/`TextInput` 대신 이 컴포넌트를 쓴다.**
 *
 * lineHeight 도 같은 비율로 키운다 — fontSize 만 키우면 줄이 겹쳐서 오히려 읽기 어려워진다.
 */

/** 배율이 1.0 이면 원본 style 을 그대로 돌려준다(평탄화 비용도 들이지 않는다) */
function useScaledStyle(style: TextProps['style'], scale: number): TextProps['style'] {
  return useMemo(() => {
    if (scale === 1) return style;

    const flat = StyleSheet.flatten(style) as TextStyle | undefined;
    if (!flat) return style;

    const out: TextStyle = { ...flat };
    if (typeof flat.fontSize === 'number')   out.fontSize   = scaledFont(flat.fontSize, scale);
    if (typeof flat.lineHeight === 'number') out.lineHeight = scaledFont(flat.lineHeight, scale);
    return out;
  }, [style, scale]);
}

// ref 를 그대로 넘긴다 — 인증 코드 입력처럼 focus() 를 직접 호출하는 화면이 있다.
export const AppText = forwardRef<RNText, TextProps>(function AppText({ style, ...rest }, ref) {
  const scaled = useScaledStyle(style, useFontScale());
  return <RNText ref={ref} style={scaled} {...rest} />;
});

export const AppTextInput = forwardRef<RNTextInput, TextInputProps>(
  function AppTextInput({ style, ...rest }, ref) {
    const scaled = useScaledStyle(style as TextProps['style'], useFontScale());
    return <RNTextInput ref={ref} style={scaled as TextInputProps['style']} {...rest} />;
  },
);

export default AppText;
