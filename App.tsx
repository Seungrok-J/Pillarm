import './global.css';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { getDatabase } from './src/db';
import { checkAndMarkMissed } from './src/notifications';
import { useSettingsStore, useDoseEventStore } from './src/store';
import { todayString } from './src/utils';
import RootNavigator from './src/navigation';

// 포그라운드 알림 핸들러: 이미 복용 완료된 이벤트는 알림을 표시하지 않음
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown>;
    const doseEventId = data?.doseEventId as string | undefined;
    if (doseEventId) {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ status: string }>(
          'SELECT status FROM dose_events WHERE id = ?',
          doseEventId,
        );
        if (row?.status === 'taken' || row?.status === 'skipped') {
          return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
        }
      } catch {}
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

// 네이티브 스플래시를 유지 — RootNavigator 마운트 후 hideAsync 호출
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── DB 초기화 & 설정 로드 ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await getDatabase();                              // 마이그레이션 실행
        await useSettingsStore.getState().loadSettings(); // UserSettings 로드
      } catch (e) {
        console.error('[App] init error:', e);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  // ── AppState 리스너: 앱 복귀 시 누락 처리 + 오늘 이벤트 새로고침 ─────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') {
        const settings = useSettingsStore.getState().settings;
        if (settings) {
          await checkAndMarkMissed(settings);
          await useDoseEventStore.getState().fetchTodayEvents(todayString());
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // isReady 전까지 null 반환 → 네이티브 스플래시 유지
  if (!isReady) return null;

  return (
    <SafeAreaProvider>
      <RootNavigator />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
