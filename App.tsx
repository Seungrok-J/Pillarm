import './global.css';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Text, TextInput, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { configureGoogle } from './src/features/socialAuth/googleAuth';
import { getDatabase } from './src/db';
import { checkAndMarkMissed, topUpNotifications } from './src/notifications';
import { useSettingsStore, useDoseEventStore } from './src/store';
import { useNetworkStore } from './src/store/networkStore';
import { retrySyncIfPending } from './src/sync/syncService';
import { todayString } from './src/utils';
import RootNavigator from './src/navigation';
import OfflineBanner from './src/components/OfflineBanner';
import AnimatedSplash from './src/components/AnimatedSplash';
// permissions.ts 에서 setNotificationHandler + userId 필터링을 통합 관리
import './src/notifications/permissions';

// 네이티브 스플래시를 유지 — 마운트 직후 바로 내리고 이후는 AnimatedSplash(JS)가 이어받는다
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [dbReady,      setDbReady]      = useState(false);
  const [navReady,     setNavReady]     = useState(false);
  const [minTimeDone,  setMinTimeDone]  = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const appReady = dbReady && navReady && minTimeDone;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // 네이티브 스플래시는 최대한 빨리 내리고, 초기화가 끝날 때까지는
  // AnimatedSplash가 대신 화면을 덮은 채 애니메이션을 보여준다.
  // 초기화가 너무 빨리 끝나 애니메이션이 아예 안 보이는 걸 막기 위해 최소 노출 시간을 둔다.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => setMinTimeDone(true), 700);
    return () => clearTimeout(t);
  }, []);
  // 시스템 폰트 스케일을 끄고 앱 자체 fontScale 설정으로 제어
  useEffect(() => {
    (Text as { defaultProps?: Record<string, unknown> }).defaultProps =
      (Text as { defaultProps?: Record<string, unknown> }).defaultProps || {};
    (Text as { defaultProps?: Record<string, unknown> }).defaultProps!.allowFontScaling = false;
    (TextInput as { defaultProps?: Record<string, unknown> }).defaultProps =
      (TextInput as { defaultProps?: Record<string, unknown> }).defaultProps || {};
    (TextInput as { defaultProps?: Record<string, unknown> }).defaultProps!.allowFontScaling = false;
  }, []);

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
        setDbReady(true);
      }
    })();
  }, []);

  // ── NetInfo: 온라인 상태 감지 + 재연결 시 pending sync 재시도 ────────────
  useEffect(() => {
    const { setOnline, loadPendingSync } = useNetworkStore.getState();
    loadPendingSync();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      const wasOnline = useNetworkStore.getState().isOnline;
      setOnline(online);
      if (!wasOnline && online) {
        retrySyncIfPending().catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  // ── AppState 리스너: 앱 복귀 시 누락 처리 + 오늘 이벤트 새로고침 ─────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') {
        const settings = useSettingsStore.getState().settings;
        if (settings) {
          await checkAndMarkMissed(settings);
          await useDoseEventStore.getState().fetchTodayEvents(todayString());
          // 알림 예산(iOS 64개 한도)에 여유가 생기면 미래 이벤트 알림을 보충
          topUpNotifications(settings).catch(() => {});
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          {/* 배너를 화면 위에 겹치면 각 화면의 헤더를 가린다 — 흐름 안에 두고 아래를 민다 */}
          <OfflineBanner />
          {dbReady && <RootNavigator onReady={() => setNavReady(true)} />}
        </View>
        <StatusBar style="dark" />
        {splashMounted && (
          <AnimatedSplash visible={!appReady} onExited={() => setSplashMounted(false)} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
