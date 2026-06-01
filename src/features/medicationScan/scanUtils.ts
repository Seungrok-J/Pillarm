import * as ImageManipulator from 'expo-image-manipulator';

export interface MedicationScanResult {
  medicationName: string;
  dosageValue?:   number;
  dosageUnit?:    string;
  timesPerDay?:   number;
  dosePerIntake?: string;
  durationDays?:  number;
  withFood?:      'before' | 'after' | 'none';
  suggestedTimes: string[];
  note?:          string;
}

export function suggestTimes(timesPerDay: number | undefined): string[] {
  switch (timesPerDay) {
    case 1:  return ['08:00'];
    case 2:  return ['08:00', '20:00'];
    case 3:  return ['08:00', '13:00', '20:00'];
    case 4:  return ['08:00', '12:00', '18:00', '22:00'];
    default: return ['08:00'];
  }
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
