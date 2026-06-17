import React from 'react';
import { Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabParamList, RootStackParamList } from './types';
import HomeScreen from '../app/home/HomeScreen';
import HistoryScreen from '../app/history/HistoryScreen';
import StatsScreen from '../app/stats/StatsScreen';
import SettingsScreen from '../app/settings/SettingsScreen';
import CareCircleScreen from '../features/careCircle/CareCircleScreen';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';

const Tab = createBottomTabNavigator<BottomTabParamList>();

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof BottomTabParamList, { on: IconName; off: IconName }> = {
  Home:        { on: 'home',          off: 'home-outline' },
  History:     { on: 'calendar',      off: 'calendar-outline' },
  Stats:       { on: 'bar-chart',     off: 'bar-chart-outline' },
  CareCircle:  { on: 'people',        off: 'people-outline' },
  Settings:    { on: 'settings',      off: 'settings-outline' },
};

export default function MainTabNavigator() {
  const primary = useThemeStore((s) => s.activeTheme.primary);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: primary,
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#f3f4f6' },
        tabBarIcon: ({ focused, color, size }) => {
          const icon = ICONS[route.name as keyof BottomTabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"        component={HomeScreen}       options={{ title: '홈' }} />
      <Tab.Screen name="History"     component={HistoryScreen}    options={{ title: '기록' }} />
      <Tab.Screen name="Stats"       component={StatsScreen}      options={{ title: '통계' }} />
      <Tab.Screen
        name="CareCircle"
        component={CareCircleScreen}
        options={{ title: '보호자' }}
        listeners={{
          tabPress: (e) => {
            if (isLoggedIn) return;
            e.preventDefault();
            Alert.alert(
              '로그인이 필요합니다',
              '보호자 기능을 사용하려면 먼저 로그인해 주세요.',
              [
                { text: '취소', style: 'cancel' },
                { text: '로그인하기', onPress: () => navigation.navigate('Login') },
              ],
            );
          },
        }}
      />
      <Tab.Screen name="Settings"    component={SettingsScreen}   options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}
