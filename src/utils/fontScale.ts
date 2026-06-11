import { useSettingsStore } from '../store/settingsStore';

/** 설정에서 글씨 크기 배율을 읽어 반환. 기본 1.0 */
export function useFontScale(): number {
  return useSettingsStore((s) => s.settings?.fontScale ?? 1.0);
}

/** 폰트 크기를 배율에 맞게 계산 */
export function scaledFont(base: number, scale: number): number {
  return Math.round(base * scale);
}
