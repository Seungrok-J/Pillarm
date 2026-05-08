import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabParamList } from './types';
import HomeScreen from '../app/home/HomeScreen';
import HistoryScreen from '../app/history/HistoryScreen';
import StatsScreen from '../app/stats/StatsScreen';
import SettingsScreen from '../app/settings/SettingsScreen';
import PointHistoryScreen from '../features/points/PointHistoryScreen';
import { useThemeStore } from '../store/themeStore';

const Tab = createBottomTabNavigator<BottomTabParamList>();

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<keyof BottomTabParamList, { on: IconName; off: IconName }> = {
  Home:     { on: 'home',      off: 'home-outline' },
  History:  { on: 'calendar',  off: 'calendar-outline' },
  Stats:    { on: 'bar-chart', off: 'bar-chart-outline' },
  Points:   { on: 'star',      off: 'star-outline' },
  Settings: { on: 'settings',  off: 'settings-outline' },
};

export default function MainTabNavigator() {
  const primary = useThemeStore((s) => s.activeTheme.primary);

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
      <Tab.Screen name="Home"     component={HomeScreen}         options={{ title: '홈' }} />
      <Tab.Screen name="History"  component={HistoryScreen}      options={{ title: '기록' }} />
      <Tab.Screen name="Stats"    component={StatsScreen}        options={{ title: '통계' }} />
      <Tab.Screen name="Points"   component={PointHistoryScreen} options={{ title: '포인트' }} />
      <Tab.Screen name="Settings" component={SettingsScreen}     options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}
