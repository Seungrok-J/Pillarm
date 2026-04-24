export type RootStackParamList = {
  Main:         undefined;
  ScheduleNew:  undefined;
  ScheduleEdit: { scheduleId: string; medicationId: string };
  ThemeShop:    undefined;
  CareCircle:   undefined;
  JoinCareCircle: undefined;
  CareMonitor:  { circleId: string; patientId: string };
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
