export type RootStackParamList = {
  Main:         undefined;
  ScheduleNew:  undefined;
  ScheduleEdit: { scheduleId: string; medicationId: string; suggestedTime?: string };
  ThemeShop:    undefined;
  CareCircle:   undefined;
  JoinCareCircle: undefined;
  CareMonitor:  { circleId: string; patientId: string };
  Login:        undefined;
  Signup:       undefined;
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
