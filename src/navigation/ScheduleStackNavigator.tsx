import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { RootStackParamList } from './types';
import MainTabNavigator from './MainTabNavigator';
import ScheduleFormScreen from '../app/schedule/ScheduleFormScreen';
import ThemeShopScreen from '../features/points/ThemeShopScreen';
import CareCircleScreen from '../features/careCircle/CareCircleScreen';
import JoinCareCircleScreen from '../features/careCircle/JoinCareCircleScreen';
import CareMonitorScreen from '../features/careCircle/CareMonitorScreen';
import LoginScreen from '../app/auth/LoginScreen';
import SignupScreen from '../app/auth/SignupScreen';
import AccountScreen from '../app/settings/AccountScreen';
import ForgotPasswordScreen from '../app/auth/ForgotPasswordScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function ScheduleStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ScheduleNew"
        component={ScheduleFormScreen}
        options={{ title: '일정 추가', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="ScheduleEdit"
        component={ScheduleFormScreen}
        options={{ title: '일정 수정', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="ThemeShop"
        component={ThemeShopScreen}
        options={{ title: '테마 상점', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="CareCircle"
        component={CareCircleScreen}
        options={{ title: '보호 그룹', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="JoinCareCircle"
        component={JoinCareCircleScreen}
        options={{ title: '보호 그룹 참여', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="CareMonitor"
        component={CareMonitorScreen}
        options={{ title: '복용 현황', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: '로그인', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="Signup"
        component={SignupScreen}
        options={{ title: '회원가입', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: '내 계정', headerBackTitle: '뒤로' }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ title: '비밀번호 찾기', headerBackTitle: '뒤로' }}
      />
    </Stack.Navigator>
  );
}
