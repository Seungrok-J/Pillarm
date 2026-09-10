import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WeekStrip, { weekDatesOf } from '../../src/components/WeekStrip';

describe('weekDatesOf', () => {
  it('선택일이 속한 주를 일요일부터 7일 반환한다', () => {
    // 2026-09-10 은 목요일
    expect(weekDatesOf('2026-09-10')).toEqual([
      '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09',
      '2026-09-10', '2026-09-11', '2026-09-12',
    ]);
  });

  it('일요일을 고르면 그 날이 첫 칸이 된다', () => {
    expect(weekDatesOf('2026-09-06')[0]).toBe('2026-09-06');
  });

  it('월 경계를 넘는 주도 이어서 반환한다', () => {
    // 2026-10-01 은 목요일 — 앞쪽 4일은 9월
    expect(weekDatesOf('2026-10-01')).toEqual([
      '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
      '2026-10-01', '2026-10-02', '2026-10-03',
    ]);
  });

  it('연 경계를 넘는 주도 이어서 반환한다', () => {
    // 2027-01-01 은 금요일
    expect(weekDatesOf('2027-01-01')[0]).toBe('2026-12-27');
    expect(weekDatesOf('2027-01-01')[6]).toBe('2027-01-02');
  });

  it('UTC 로 파싱해 하루 밀리지 않는다 — 월초 자정 경계', () => {
    // new Date('2026-03-01') 은 UTC 자정이라 KST 기준 2/28 로 읽힐 수 있다
    expect(weekDatesOf('2026-03-01')).toContain('2026-03-01');
  });
});

describe('WeekStrip', () => {
  const noop = () => {};

  it('7일을 모두 렌더한다', () => {
    const { getByTestId } = render(
      <WeekStrip selectedDate="2026-09-10" dotColors={{}} onSelectDate={noop} />,
    );
    for (const d of weekDatesOf('2026-09-10')) {
      expect(getByTestId(`week-day-${d}`)).toBeTruthy();
    }
  });

  it('날짜를 탭하면 그 날짜로 onSelectDate 를 호출한다', () => {
    const onSelectDate = jest.fn();
    const { getByTestId } = render(
      <WeekStrip selectedDate="2026-09-10" dotColors={{}} onSelectDate={onSelectDate} />,
    );
    fireEvent.press(getByTestId('week-day-2026-09-08'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-09-08');
  });

  it('선택된 날짜만 selected 상태로 표시한다', () => {
    const { getByTestId } = render(
      <WeekStrip selectedDate="2026-09-10" dotColors={{}} onSelectDate={noop} />,
    );
    expect(getByTestId('week-day-2026-09-10').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('week-day-2026-09-09').props.accessibilityState.selected).toBe(false);
  });
});
