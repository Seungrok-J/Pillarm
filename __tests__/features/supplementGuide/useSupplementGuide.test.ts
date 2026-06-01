/**
 * useSupplementGuide 훅 테스트
 *
 * AC1 — 전체(all) 카테고리: 20종 반환
 * AC2 — 카테고리 필터: vitamin_fat만 반환
 * AC3 — 검색 쿼리: 이름 포함 항목만 반환
 * AC4 — 검색 쿼리 대소문자 무관 (영문)
 * AC5 — useSupplementById: ID로 단일 항목 조회
 * AC6 — useSupplementById: 없는 ID → undefined
 * AC7 — timingLabel: 각 타입별 한글 반환
 * AC8 — 카테고리 + 검색 동시 적용
 */

import { renderHook } from '@testing-library/react-native';
import {
  useSupplementGuide,
  useSupplementById,
  timingLabel,
  CATEGORY_LABELS,
} from '../../../src/features/supplementGuide/useSupplementGuide';

describe('useSupplementGuide', () => {
  describe('AC1 — 전체 카테고리', () => {
    it('카테고리 all 이면 20종 모두 반환한다', () => {
      const { result } = renderHook(() => useSupplementGuide('all', ''));
      expect(result.current.length).toBe(20);
    });
  });

  describe('AC2 — 카테고리 필터', () => {
    it('vitamin_fat 필터 시 지용성 비타민만 반환한다', () => {
      const { result } = renderHook(() => useSupplementGuide('vitamin_fat', ''));
      expect(result.current.length).toBeGreaterThan(0);
      result.current.forEach((item) => {
        expect(item.category).toBe('vitamin_fat');
      });
    });

    it('mineral 필터 시 미네랄만 반환한다', () => {
      const { result } = renderHook(() => useSupplementGuide('mineral', ''));
      result.current.forEach((item) => expect(item.category).toBe('mineral'));
    });

    it('probiotic 필터 시 프로바이오틱스만 반환한다', () => {
      const { result } = renderHook(() => useSupplementGuide('probiotic', ''));
      result.current.forEach((item) => expect(item.category).toBe('probiotic'));
    });
  });

  describe('AC3 — 검색 쿼리', () => {
    it('철분 검색 시 철분 항목만 반환한다', () => {
      const { result } = renderHook(() => useSupplementGuide('all', '철분'));
      expect(result.current.length).toBeGreaterThan(0);
      result.current.forEach((item) => {
        expect(item.name.includes('철분')).toBe(true);
      });
    });

    it('존재하지 않는 이름 검색 시 빈 배열 반환', () => {
      const { result } = renderHook(() => useSupplementGuide('all', '없는영양제xyz'));
      expect(result.current).toHaveLength(0);
    });
  });

  describe('AC4 — 영문 검색 대소문자 무관', () => {
    it('omega 소문자 검색 시 Omega-3 반환', () => {
      const { result } = renderHook(() => useSupplementGuide('all', 'omega'));
      expect(result.current.some((i) => i.id === 'omega3')).toBe(true);
    });

    it('IRON 대문자 검색 시 Iron 반환', () => {
      const { result } = renderHook(() => useSupplementGuide('all', 'IRON'));
      expect(result.current.some((i) => i.id === 'iron')).toBe(true);
    });
  });

  describe('AC5 — useSupplementById', () => {
    it('id 로 단일 항목을 반환한다', () => {
      const { result } = renderHook(() => useSupplementById('iron'));
      expect(result.current).toBeDefined();
      expect(result.current?.id).toBe('iron');
      expect(result.current?.name).toBe('철분');
    });
  });

  describe('AC6 — useSupplementById 없는 ID', () => {
    it('존재하지 않는 id → undefined 반환', () => {
      const { result } = renderHook(() => useSupplementById('not-exist'));
      expect(result.current).toBeUndefined();
    });
  });

  describe('AC7 — timingLabel', () => {
    it.each([
      ['after_meal',    '식후'],
      ['before_meal',   '식전'],
      ['with_meal',     '식사 중'],
      ['empty_stomach', '공복'],
      ['bedtime',       '취침 전'],
      ['anytime',       '무관'],
    ] as const)('%s → %s', (type, expected) => {
      expect(timingLabel(type)).toBe(expected);
    });
  });

  describe('AC8 — 카테고리 + 검색 동시 적용', () => {
    it('mineral 카테고리에서 칼슘만 검색하면 칼슘만 반환', () => {
      const { result } = renderHook(() => useSupplementGuide('mineral', '칼슘'));
      expect(result.current.every((i) => i.category === 'mineral')).toBe(true);
      expect(result.current.some((i) => i.id === 'calcium')).toBe(true);
    });
  });

  describe('AC9 — 데이터 품질', () => {
    it('모든 항목에 sources 가 1개 이상 존재한다', () => {
      const { result } = renderHook(() => useSupplementGuide('all', ''));
      result.current.forEach((item) => {
        expect(item.sources.length).toBeGreaterThan(0);
        item.sources.forEach((s) => {
          expect(s.name).toBeTruthy();
          expect(s.url).toMatch(/^https?:\/\//);
        });
      });
    });

    it('모든 항목에 timing.detail 이 존재한다', () => {
      const { result } = renderHook(() => useSupplementGuide('all', ''));
      result.current.forEach((item) => {
        expect(item.timing.detail).toBeTruthy();
      });
    });
  });
});

describe('CATEGORY_LABELS', () => {
  it('all 포함 7개 카테고리 레이블이 정의되어 있다', () => {
    const keys = ['all', 'vitamin_fat', 'vitamin_water', 'mineral', 'omega', 'probiotic', 'other'];
    keys.forEach((k) => {
      expect(CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS]).toBeTruthy();
    });
  });
});
