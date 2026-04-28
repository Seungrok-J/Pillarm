import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import OnboardingScreen, { ONBOARDING_KEY } from '../app/onboarding/OnboardingScreen';
import ScheduleStackNavigator from './ScheduleStackNavigator';
import { useAuthStore } from '../store/authStore';

export default function RootNavigator() {
  const { loadSession } = useAuthStore();
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

  if (onboardingDone === null) return null;

  return (
    <NavigationContainer>
      {!onboardingDone ? (
        <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
      ) : (
        <ScheduleStackNavigator />
      )}
    </NavigationContainer>
  );
}
