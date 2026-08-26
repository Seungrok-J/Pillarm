import type { MedicationScanResult } from '../features/medicationScan/scanUtils';

export interface PresetPacket {
  packetId:   string;
  packetName?: string;
  times:      string[];
  startDate:  string;
  endDate?:   string;
}

export type RootStackParamList = {
  Main:           undefined;
  ScheduleNew:    { presetPacket?: PresetPacket } | undefined;
  ScheduleEdit:   { scheduleId: string; medicationId: string; suggestedTime?: string };
  ScheduleManage: undefined;
  PacketEdit:     { packetId: string };
  ThemeShop:      undefined;
  CareCircle:     undefined;
  JoinCareCircle: { code?: string } | undefined;
  CareMonitor:    { circleId: string; patientId: string; patientName?: string };
  Login:   undefined;
  Account: undefined;
  Admin:   undefined;
  // Phase 4
  GuideList:      undefined;
  GuideDetail:    { id: string };
  ScanNew:        undefined;
  ScanResult:     { results: MedicationScanResult[] };
};

export type BottomTabParamList = {
  Home:        undefined;
  History:     undefined;
  Stats:       undefined;
  CareCircle:  undefined;
  Settings:    undefined;
};

