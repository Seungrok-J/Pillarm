import React from 'react';
import { render } from '@testing-library/react-native';
import NextDoseBanner from '../../src/components/NextDoseBanner';
import type { DoseEvent } from '../../src/domain';

function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: 'evt-1',
    scheduleId: 'sch-1',
    medicationId: 'med-1',
    plannedAt: new Date(Date.now() + 7_200_000).toISOString(), // 2시간 후
    status: 'scheduled',
    snoozeCount: 0,
    source: 'scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const MED_NAMES: Record<string, string> = { 'med-1': '이부프로펜' };

describe('NextDoseBanner', () => {
  it('다음 복용 이벤트가 없으면 완료 배너를 표시한다', () => {
    const { getByTestId } = render(<NextDoseBanner events={[]} medicationNames={{}} />);
    expect(getByTestId('banner-all-done')).toBeTruthy();
  });

  it('taken 이벤트만 있으면 완료 배너를 표시한다', () => {
    const takenEvt = makeEvent({ status: 'taken' });
    const { getByTestId } = render(<NextDoseBanner events={[takenEvt]} medicationNames={MED_NAMES} />);
    expect(getByTestId('banner-all-done')).toBeTruthy();
  });

  it('scheduled 이벤트가 있으면 다음 복용 배너를 표시한다', () => {
    const { getByTestId } = render(<NextDoseBanner events={[makeEvent()]} medicationNames={MED_NAMES} />);
    expect(getByTestId('banner-next-dose')).toBeTruthy();
  });

  it('1시간 이상 남은 경우 "N시간 M분 후" 형식으로 표시한다', () => {
    const { getByText } = render(<NextDoseBanner events={[makeEvent()]} medicationNames={MED_NAMES} />);
    expect(getByText(/시간/)).toBeTruthy();
  });

  it('30분 남은 경우 배너가 렌더링된다', () => {
    const soon = makeEvent({ plannedAt: new Date(Date.now() + 1_800_000).toISOString() }); // 30분 후
    const { getByTestId } = render(<NextDoseBanner events={[soon]} medicationNames={MED_NAMES} />);
    // formatRemaining 의 hours===0 경로 (line 16) 를 커버
    expect(getByTestId('banner-next-dose')).toBeTruthy();
    const remaining = getByTestId('banner-remaining');
    const text = (remaining.props.children as string[]).join('');
    expect(text).toMatch(/분 후/);
  });

  it('medicationNames 에 없는 ID 면 "약" 으로 표시한다', () => {
    const { getByTestId } = render(<NextDoseBanner events={[makeEvent()]} medicationNames={{}} />);
    expect(getByTestId('banner-med-name').props.children).toBe('약');
  });
});
