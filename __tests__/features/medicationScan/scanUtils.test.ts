jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

/**
 * medicationScan 유틸 테스트
 *
 * AC1 — suggestTimes: timesPerDay → 시간 배열 변환
 * AC2 — suggestTimes: 1~4회 범위 외는 기본값 반환
 * AC3 — suggestTimes: undefined 입력 시 기본값
 */

import { suggestTimes } from '../../../src/features/medicationScan/scanUtils';

describe('suggestTimes', () => {
  describe('AC1 — 1~4회 정상 변환', () => {
    it('1회/일 → ["08:00"]', () => {
      expect(suggestTimes(1)).toEqual(['08:00']);
    });

    it('2회/일 → ["08:00", "20:00"]', () => {
      expect(suggestTimes(2)).toEqual(['08:00', '20:00']);
    });

    it('3회/일 → ["08:00", "13:00", "20:00"]', () => {
      expect(suggestTimes(3)).toEqual(['08:00', '13:00', '20:00']);
    });

    it('4회/일 → ["08:00", "12:00", "18:00", "22:00"]', () => {
      expect(suggestTimes(4)).toEqual(['08:00', '12:00', '18:00', '22:00']);
    });
  });

  describe('AC2 — 범위 외 입력', () => {
    it('0회 → 기본값 ["08:00"]', () => {
      expect(suggestTimes(0)).toEqual(['08:00']);
    });

    it('5회 이상 → 기본값 ["08:00"]', () => {
      expect(suggestTimes(5)).toEqual(['08:00']);
      expect(suggestTimes(10)).toEqual(['08:00']);
    });
  });

  describe('AC3 — undefined 입력', () => {
    it('undefined → 기본값 ["08:00"]', () => {
      expect(suggestTimes(undefined)).toEqual(['08:00']);
    });
  });

  describe('AC4 — 반환 배열 유효성', () => {
    it('모든 시간이 HH:mm 형식이다', () => {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      [1, 2, 3, 4].forEach((n) => {
        suggestTimes(n).forEach((t) => {
          expect(t).toMatch(timeRegex);
        });
      });
    });

    it('반환된 시간이 오름차순이다', () => {
      [1, 2, 3, 4].forEach((n) => {
        const times = suggestTimes(n);
        for (let i = 1; i < times.length; i++) {
          expect(times[i]! > times[i - 1]!).toBe(true);
        }
      });
    });
  });
});
