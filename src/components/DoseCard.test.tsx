import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DoseCard from './DoseCard';
import { DoseEvent } from '../domain';

// plannedAt 을 30분 후로 설정하여 'active' 상태로 만듭니다 (2시간 전 ~ 예정 시각).
const FUTURE = new Date(Date.now() + 30 * 60_000);
const pad = (n: number) => String(n).padStart(2, '0');
const PLANNED_AT =
  `${FUTURE.getFullYear()}-${pad(FUTURE.getMonth() + 1)}-${pad(FUTURE.getDate())}` +
  `T${pad(FUTURE.getHours())}:${pad(FUTURE.getMinutes())}:00`;

const mockEvent: DoseEvent = {
  id: 'evt-1',
  scheduleId: 'sched-1',
  medicationId: 'med-1',
  plannedAt: PLANNED_AT,
  status: 'scheduled',
  snoozeCount: 0,
  source: 'notification',
  createdAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
};

describe('DoseCard', () => {
  it('renders medication name and time', () => {
    const { getByText } = render(
      <DoseCard event={mockEvent} medicationName="혈압약" onTake={jest.fn()} />,
    );
    expect(getByText('혈압약')).toBeTruthy();
    expect(getByText('복용')).toBeTruthy();
  });

  it('calls onTake when button pressed for scheduled event', () => {
    const onTake = jest.fn();
    const { getByText } = render(
      <DoseCard event={mockEvent} medicationName="혈압약" onTake={onTake} />,
    );
    fireEvent.press(getByText('복용'));
    expect(onTake).toHaveBeenCalledWith('evt-1');
  });

  it('does not call onTake for taken event', () => {
    const onTake = jest.fn();
    const takenEvent = { ...mockEvent, status: 'taken' as const };
    const { getByText } = render(
      <DoseCard event={takenEvent} medicationName="혈압약" onTake={onTake} />,
    );
    fireEvent.press(getByText('완료 ✓'));
    expect(onTake).not.toHaveBeenCalled();
  });
});
