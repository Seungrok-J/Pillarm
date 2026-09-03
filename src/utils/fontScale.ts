import { useSettingsStore } from '../store/settingsStore';

/**
 * 앱 자체 글씨 크기 배율.
 *
 * `App.tsx` 가 `Text.defaultProps.allowFontScaling = false` 로 OS 글꼴 확대를 끄고 있어
 * (레이아웃 보호 목적), 그 대체 수단으로 앱이 직접 배율을 제공한다.
 * 실제 적용은 `AppText`·`AppTextInput` 래퍼가 담당한다.
 */

export interface FontScaleOption {
  value: number;
  label: string;
}

/** 설정 화면에 노출하는 배율 단계 */
export const FONT_SCALE_OPTIONS: readonly FontScaleOption[] = [
  { value: 1.0,  label: '보통' },
  { value: 1.15, label: '크게' },
  { value: 1.3,  label: '아주 크게' },
] as const;

export const DEFAULT_FONT_SCALE = 1.0;

/** 저장된 값이 손상됐거나 예전 값이어도 안전한 배율로 되돌린다 */
export function normalizeFontScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FONT_SCALE;
  const known = FONT_SCALE_OPTIONS.find((o) => Math.abs(o.value - value) < 0.001);
  return known ? known.value : DEFAULT_FONT_SCALE;
}

/** 설정에서 글씨 크기 배율을 읽어 반환. 기본 1.0 */
export function useFontScale(): number {
  return useSettingsStore((s) => normalizeFontScale(s.settings?.fontScale));
}

/** 폰트 크기를 배율에 맞게 계산 */
export function scaledFont(base: number, scale: number): number {
  return Math.round(base * scale);
}
