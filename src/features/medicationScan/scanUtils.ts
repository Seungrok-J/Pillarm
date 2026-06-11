import * as ImageManipulator from 'expo-image-manipulator';

export type DosageUnit = '정' | 'mg' | 'ml';
export const DOSAGE_UNITS: DosageUnit[] = ['정', 'mg', 'ml'];

export type MealSlot = 'morning' | 'lunch' | 'dinner' | 'bedtime';

export interface MealSettings {
  mealTimeBreakfast: string;
  mealTimeLunch:     string;
  mealTimeDinner:    string;
}

const FALLBACK_MEAL: MealSettings = {
  mealTimeBreakfast: '09:00',
  mealTimeLunch:     '12:00',
  mealTimeDinner:    '18:00',
};
const BEDTIME_DEFAULT = '22:00';

export interface MedicationScanResult {
  medicationName: string;
  dosageValue?:   number;
  dosageUnit?:    DosageUnit;
  timesPerDay?:   number;
  dosePerIntake?: string;
  durationDays?:  number;
  withFood?:      'before' | 'after' | 'none';
  suggestedTimes: string[];
  note?:          string;
}

/** AI 인식 결과 단위 문자열 → DosageUnit 정규화. 정/정제/캡슐 등은 "정"으로 우선 처리. */
export function normalizeUnit(raw: string | undefined): DosageUnit | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/\s/g, '');
  if (/정|정제|캡슐|캡|tab|tablet|cap|capsule|ea|알|개/.test(s)) return '정';
  if (/ml|cc/.test(s)) return 'ml';
  if (/mg|mcg|ug|μg|[0-9]g/.test(s)) return 'mg';
  return undefined;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.max(0, Math.min(1439, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function inferMealSlots(timesPerDay: number | undefined): MealSlot[] {
  switch (timesPerDay) {
    case 1:  return ['morning'];
    case 2:  return ['morning', 'dinner'];
    case 3:  return ['morning', 'lunch', 'dinner'];
    case 4:  return ['morning', 'lunch', 'dinner', 'bedtime'];
    default: return ['morning'];
  }
}

/** 식사 시간 설정 + AI 인식 결과(mealSlots, withFoodMinutes)로 복용 시간 계산 */
export function suggestTimesFromMeals(
  mealSlots:       MealSlot[] | null | undefined,
  withFoodMinutes: number | null | undefined,
  timesPerDay:     number | undefined,
  mealSettings:    MealSettings | null,
): string[] {
  const settings = mealSettings ?? FALLBACK_MEAL;
  const slots    = (mealSlots && mealSlots.length > 0) ? mealSlots : inferMealSlots(timesPerDay);
  const offset   = withFoodMinutes ?? 0;

  return slots
    .map((slot) => {
      const base = slot === 'morning' ? settings.mealTimeBreakfast
        : slot === 'lunch'   ? settings.mealTimeLunch
        : slot === 'dinner'  ? settings.mealTimeDinner
        : BEDTIME_DEFAULT;
      return addMinutes(base, offset);
    })
    .sort();
}

const DEFAULT_TIMES: Record<number, string[]> = {
  1: ['08:00'],
  2: ['08:00', '20:00'],
  3: ['08:00', '13:00', '20:00'],
  4: ['08:00', '12:00', '18:00', '22:00'],
};

/** timesPerDay만 있을 때 사용하는 fallback (설정 미전달 경우) */
export function suggestTimes(timesPerDay: number | undefined): string[] {
  if (!timesPerDay || timesPerDay < 1 || timesPerDay > 4) return ['08:00'];
  return DEFAULT_TIMES[timesPerDay] ?? ['08:00'];
}

export async function prepareImageBase64(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  if (!result.base64) throw new Error('이미지 변환에 실패했습니다');
  return result.base64;
}
