export type RootStackParamList = {
  Main:         undefined;
  ScheduleNew:  undefined;
  ScheduleEdit: { scheduleId: string; medicationId: string; suggestedTime?: string };
  ThemeShop:    undefined;
  CareCircle:   undefined;
  JoinCareCircle: { code?: string } | undefined;
  CareMonitor:  { circleId: string; patientId: string; patientName?: string };
  Login:          undefined;
  Signup:         undefined;
  Account:        undefined;
  ForgotPassword: undefined;
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
