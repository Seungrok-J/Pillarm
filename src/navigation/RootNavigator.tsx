import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import OnboardingScreen, { ONBOARDING_KEY } from '../app/onboarding/OnboardingScreen';
import ScheduleStackNavigator from './ScheduleStackNavigator';
import AuthStackNavigator from './AuthStackNavigator';
import { useAuthStore } from '../store/authStore';

export default function RootNavigator() {
  const { isLoggedIn, isLoading, loadSession } = useAuthStore();
  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDING_KEY),
      loadSession(),
    ]).then(([value]) => {
      setOnboardingDone(value === 'true');
      SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

  // 온보딩 또는 인증 상태 로딩 중
  if (onboardingDone === null || isLoading) return null;

  return (
    <NavigationContainer>
      {!onboardingDone ? (
        <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
      ) : isLoggedIn ? (
        <ScheduleStackNavigator />
      ) : (
        <AuthStackNavigator />
      )}
    </NavigationContainer>
  );
}
