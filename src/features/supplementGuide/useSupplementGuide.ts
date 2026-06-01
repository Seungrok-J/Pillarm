import { useMemo, useState } from 'react';
import bundledData from './data/supplements.json';
import type { SupplementGuide, SupplementCategory } from './types';

const ALL_DATA = bundledData as SupplementGuide[];

export const CATEGORY_LABELS: Record<SupplementCategory | 'all', string> = {
  all:           '전체',
  vitamin_fat:   '지용성 비타민',
  vitamin_water: '수용성 비타민',
  mineral:       '미네랄',
  omega:         '오메가',
  probiotic:     '프로바이오틱스',
  other:         '기타',
};

export function useSupplementGuide(
  category: SupplementCategory | 'all',
  query: string,
) {
  const filtered = useMemo(() => {
    let list = ALL_DATA;
    if (category !== 'all') list = list.filter((s) => s.category === category);
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.nameEn?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [category, query]);

  return filtered;
}

export function useSupplementById(id: string): SupplementGuide | undefined {
  return useMemo(() => ALL_DATA.find((s) => s.id === id), [id]);
}

export function timingLabel(type: SupplementGuide['timing']['type']): string {
  const map: Record<string, string> = {
    after_meal:    '식후',
    before_meal:   '식전',
    with_meal:     '식사 중',
    empty_stomach: '공복',
    bedtime:       '취침 전',
    anytime:       '무관',
  };
  return map[type] ?? type;
}
