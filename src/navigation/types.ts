import type { MedicationScanResult } from '../features/medicationScan/scanUtils';

export type RootStackParamList = {
  Main:           undefined;
  ScheduleNew:    undefined;
  ScheduleEdit:   { scheduleId: string; medicationId: string; suggestedTime?: string };
  ScheduleManage: undefined;
  ThemeShop:      undefined;
  CareCircle:     undefined;
  JoinCareCircle: { code?: string } | undefined;
  CareMonitor:    { circleId: string; patientId: string; patientName?: string };
  Login:          undefined;
  Signup:         undefined;
  Account:        undefined;
  ForgotPassword: undefined;
  // Phase 4
  GuideList:      undefined;
  GuideDetail:    { id: string };
  ScanNew:        undefined;
  ScanResult:     { results: MedicationScanResult[] };
};

export type BottomTabParamList = {
  Home:     undefined;
  History:  undefined;
  Stats:    undefined;
  Points:   undefined;
  Settings: undefined;
};

export type AuthStackParamList = {
  Login:  undefined;
  Signup: undefined;
};
