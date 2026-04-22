import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './app/home/HomeScreen';
import HistoryScreen from './app/history/HistoryScreen';
import StatsScreen from './app/stats/StatsScreen';
import SettingsScreen from './app/settings/SettingsScreen';
import ScheduleNewScreen from './app/schedule/ScheduleNewScreen';
import ScheduleEditScreen from './app/schedule/ScheduleEditScreen';

export type RootStackParamList = {
  Main: undefined;
  ScheduleNew: undefined;
  ScheduleEdit: { scheduleId: string; medicationId: string };
};

export type BottomTabParamList = {
  Home: undefined;
  History: undefined;
  Stats: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<BottomTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '홈' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: '기록' }} />
      <Tab.Screen name="Stats" component={StatsScreen} options={{ title: '통계' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="ScheduleNew" component={ScheduleNewScreen} options={{ title: '일정 추가' }} />
        <Stack.Screen name="ScheduleEdit" component={ScheduleEditScreen} options={{ title: '일정 수정' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
