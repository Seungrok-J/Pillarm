/**
 * AppText — 글씨 크기 배율 적용 래퍼
 *
 * 화면마다 fontSize 를 곱하는 대신 이 래퍼가 한 번에 처리하므로,
 * 여기서 깨지면 앱 전체 글씨 크기 조절이 조용히 동작하지 않는다.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { AppText, AppTextInput } from '../../src/components/AppText';
import { useSettingsStore } from '../../src/store';
import type { UserSettings } from '../../src/domain';

const BASE: UserSettings = {
  userId: 'local',
  timeZone: 'Asia/Seoul',
  defaultSnoozeMinutes: 15,
  maxSnoozeCount: 3,
  missedToLateMinutes: 120,
  autoMarkMissedEnabled: true,
  mealTimeBreakfast: '08:00',
  mealTimeLunch: '12:00',
  mealTimeDinner: '19:00',
  fontScale: 1.0,
};

const setScale = (fontScale: number) =>
  useSettingsStore.setState({ settings: { ...BASE, fontScale } });

/** 렌더된 노드의 최종 style 을 평탄화해서 돌려준다 */
function styleOf(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as Record<string, number>;
}

beforeEach(() => setScale(1.0));

describe('AppText — 배율 적용', () => {
  it('배율 1.0 이면 크기를 바꾸지 않는다', () => {
    const { getByText } = render(<AppText style={{ fontSize: 15 }}>본문</AppText>);
    expect(styleOf(getByText('본문')).fontSize).toBe(15);
  });

  it('배율에 맞춰 fontSize 를 키운다', () => {
    setScale(1.3);
    const { getByText } = render(<AppText style={{ fontSize: 15 }}>본문</AppText>);
    expect(styleOf(getByText('본문')).fontSize).toBe(20); // round(15 * 1.3)
  });

  it('lineHeight 도 같은 비율로 키운다', () => {
    // fontSize 만 키우면 줄이 겹쳐서 오히려 읽기 어려워진다
    setScale(1.3);
    const { getByText } = render(
      <AppText style={{ fontSize: 14, lineHeight: 20 }}>본문</AppText>,
    );
    const s = styleOf(getByText('본문'));
    expect(s.fontSize).toBe(18);
    expect(s.lineHeight).toBe(26);
  });

  it('style 배열도 평탄화해서 적용한다', () => {
    setScale(1.15);
    const styles = StyleSheet.create({
      base:   { fontSize: 20, color: '#111827' },
      active: { fontSize: 10 },   // 뒤쪽이 이긴다
    });
    const { getByText } = render(
      <AppText style={[styles.base, styles.active]}>본문</AppText>,
    );
    const s = styleOf(getByText('본문'));
    expect(s.fontSize).toBe(12);       // round(10 * 1.15)
    expect(s.color).toBe('#111827');   // 다른 속성은 보존
  });

  it('조건부 style 의 falsy 항목을 무시한다', () => {
    setScale(1.3);
    const { getByText } = render(
      <AppText style={[{ fontSize: 10 }, false && { fontSize: 99 }]}>본문</AppText>,
    );
    expect(styleOf(getByText('본문')).fontSize).toBe(13);
  });

  it('fontSize 가 없으면 크기 속성을 만들어내지 않는다', () => {
    setScale(1.3);
    const { getByText } = render(<AppText style={{ color: '#000' }}>본문</AppText>);
    expect(styleOf(getByText('본문')).fontSize).toBeUndefined();
  });

  it('설정이 아직 로드되지 않아도 기본 배율로 렌더된다', () => {
    useSettingsStore.setState({ settings: null });
    const { getByText } = render(<AppText style={{ fontSize: 15 }}>본문</AppText>);
    expect(styleOf(getByText('본문')).fontSize).toBe(15);
  });

  it('알 수 없는 배율이 저장돼 있으면 확대하지 않는다', () => {
    setScale(2.5);
    const { getByText } = render(<AppText style={{ fontSize: 15 }}>본문</AppText>);
    expect(styleOf(getByText('본문')).fontSize).toBe(15);
  });
});

describe('AppTextInput — 배율 적용', () => {
  it('입력 글씨도 함께 커진다', () => {
    setScale(1.15);
    const { getByTestId } = render(
      <AppTextInput testID="inp" style={{ fontSize: 20 }} value="" onChangeText={() => {}} />,
    );
    expect(styleOf(getByTestId('inp')).fontSize).toBe(23);
  });
});
