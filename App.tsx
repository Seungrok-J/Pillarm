import './global.css';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { configureGoogle } from './src/features/socialAuth/googleAuth';
import { getDatabase } from './src/db';
import { checkAndMarkMissed } from './src/notifications';
import { useSettingsStore, useDoseEventStore } from './src/store';
import { todayString } from './src/utils';
import RootNavigator from './src/navigation';
// permissions.ts 에서 setNotificationHandler + userId 필터링을 통합 관리
import './src/notifications/permissions';

// 네이티브 스플래시를 유지 — RootNavigator 마운트 후 hideAsync 호출
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── DB 초기화 & 설정 로드 ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const kakaoKey = process.env.EXPO_PUBLIC_KAKAO_APP_KEY;
      if (kakaoKey) {
        try { await initializeKakaoSDK(kakaoKey); } catch (e) { console.warn('[App] initKakao:', e); }
      } else {
        console.warn('[App] EXPO_PUBLIC_KAKAO_APP_KEY 환경변수가 설정되지 않았습니다');
      }
      try { configureGoogle(); } catch (e) { console.warn('[App] configureGoogle:', e); }

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
