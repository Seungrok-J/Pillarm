import { api } from '../careCircle/careCircleApi';
import type { MedicationScanResult } from './scanUtils';
import { suggestTimes } from './scanUtils';

interface RawScanItem {
  medicationName: string;
  dosageValue?:   number | null;
  dosageUnit?:    string | null;
  timesPerDay?:   number | null;
  dosePerIntake?: string | null;
  durationDays?:  number | null;
  withFood?:      'before' | 'after' | 'none' | null;
  note?:          string | null;
}

interface ScanResponse {
  results: RawScanItem[];
  confidence: 'high' | 'medium' | 'low';
}

export async function scanMedicationImage(
  base64Image: string,
): Promise<MedicationScanResult[]> {
  const { data } = await api.post<ScanResponse>('/ai/scan-medication', {
    image: base64Image,
  });

  if (!data.results?.length) {
    throw new Error('약봉투 정보를 인식하지 못했습니다.\n사진을 다시 찍거나 직접 입력해주세요.');
  }

  return data.results.map((r) => ({
    medicationName: r.medicationName,
    dosageValue:    r.dosageValue ?? undefined,
    dosageUnit:     r.dosageUnit ?? undefined,
    timesPerDay:    r.timesPerDay ?? undefined,
    dosePerIntake:  r.dosePerIntake ?? undefined,
    durationDays:   r.durationDays ?? undefined,
    withFood:       r.withFood ?? undefined,
    suggestedTimes: suggestTimes(r.timesPerDay ?? undefined),
    note:           r.note ?? undefined,
  }));
}
