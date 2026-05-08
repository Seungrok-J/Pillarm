import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as ExpoLinking from 'expo-linking';
import OnboardingScreen, { ONBOARDING_KEY } from '../app/onboarding/OnboardingScreen';
import ScheduleStackNavigator from './ScheduleStackNavigator';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import type { RootStackParamList } from './types';
import { syncPushToken } from '../notifications/pushToken';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [ExpoLinking.createURL('/'), 'pillarm://'],
  config: {
    screens: {
      JoinCareCircle: 'join/:code',
    },
  },
};

export default function RootNavigator() {
  const { loadSession } = useAuthStore();
  const loadTheme = useThemeStore((s) => s.loadTheme);
  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDING_KEY),
      loadSession(),
      loadTheme(),
    ]).then(([value]) => {
      setOnboardingDone(value === 'true');
      SplashScreen.hideAsync().catch(() => {});
      // 이미 로그인된 경우 토큰 갱신 (기기 재시작·토큰 만료 대응)
      if (useAuthStore.getState().isLoggedIn) {
        syncPushToken().catch(() => {});
      }
    });
  }, []);

  if (onboardingDone === null) return null;

  return (
    <NavigationContainer linking={linking}>
      {!onboardingDone ? (
        <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
      ) : (
        <ScheduleStackNavigator />
      )}
    </NavigationContainer>
  );
}
