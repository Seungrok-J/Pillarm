/**
 * LoginScreen — 소셜 로그인 전용 진입 화면
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../store/authStore';
import { initialPush, pullFromServer } from '../../sync/syncService';
import { getUserSettings } from '../../db';
import { rescheduleAllSchedules } from '../../notifications';
import {
  isAppleAuthAvailable,
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
} from '../../features/socialAuth';
import {
  confirmSocialLink,
  type SocialAuthResponse,
  type SocialLinkRequired,
  type DeviceConflict,
} from '../../features/socialAuth/socialAuthApi';
import AlertModal, { type AlertModalTone } from '../../components/AlertModal';
import GoogleLogo from '../../components/GoogleLogo';

type Nav = StackNavigationProp<RootStackParamList>;

export default function LoginScreen() {
  const navigation  = useNavigation<Nav>();
  const { saveSession } = useAuthStore();

  const [loading,         setLoading]         = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<{ link: SocialLinkRequired; providerName: string } | null>(null);
  const [deviceConflictPrompt, setDeviceConflictPrompt] = useState<{
    conflict: DeviceConflict;
    providerName: string;
    loginFn: () => Promise<SocialAuthResponse | SocialLinkRequired | DeviceConflict>;
  } | null>(null);
  const [simpleAlert, setSimpleAlert] = useState<{ title: string; message?: string; tone?: AlertModalTone } | null>(null);

  // ── 소셜 로그인 공통 처리 ──────────────────────────────────────────────────

  async function handleSocialLogin(
    providerName: string,
    loginFn: () => Promise<SocialAuthResponse | SocialLinkRequired | DeviceConflict>,
  ) {
    setLoading(true);
    setLoadingProvider(providerName);
    try {
      const result = await loginFn();

      if ('requiresLink' in result && result.requiresLink) {
        const link = result as unknown as SocialLinkRequired;
        setLoading(false);
        setLoadingProvider(null);
        setLinkPrompt({ link, providerName });
        return;
      }

      // 중복 로그인 감지 (다른 기기에서 이미 로그인 중)
      if ('deviceConflict' in result && result.deviceConflict) {
        const conflict = result as unknown as DeviceConflict;
        setLoading(false);
        setLoadingProvider(null);
        setDeviceConflictPrompt({ conflict, providerName, loginFn });
        return;
      }

      await afterLogin(result as unknown as SocialAuthResponse);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED' || code === 'SIGN_IN_CANCELLED') return;

      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (err as Error)?.message ?? `${providerName} 로그인에 실패했습니다`;
      setSimpleAlert({ title: '로그인 실패', message: msg, tone: 'danger' });
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  }

  async function confirmLink() {
    if (!linkPrompt) return;
    const { link, providerName } = linkPrompt;
    setLinkPrompt(null);
    setLoading(true);
    setLoadingProvider(providerName);
    try {
      const data = await confirmSocialLink(link.linkToken);
      await afterLogin(data);
    } catch {
      setSimpleAlert({ title: '오류', message: '계정 연결에 실패했습니다. 다시 시도해주세요.', tone: 'danger' });
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  }

  async function confirmDeviceConflict() {
    if (!deviceConflictPrompt) return;
    const { providerName, loginFn } = deviceConflictPrompt;
    setDeviceConflictPrompt(null);
    setLoading(true);
    setLoadingProvider(providerName);
    try {
      const forceResult = await loginFn();
      if ('accessToken' in forceResult) {
        await afterLogin(forceResult as SocialAuthResponse);
      }
    } catch {
      setSimpleAlert({ title: '오류', message: '로그인에 실패했습니다. 다시 시도해주세요.', tone: 'danger' });
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  }

  async function afterLogin(data: SocialAuthResponse) {
    // saveSession이 기존 알림을 취소하고 세션을 저장
    await saveSession({
      accessToken:  data.accessToken,
      refreshToken: data.refreshToken,
      userId:       data.userId,
      userEmail:    null,
      userName:     data.name ?? null,
      isAdmin:      data.isAdmin ?? false,
    });
    if (data.isNewUser) {
      initialPush(data.userId).catch(() => {});
    } else {
      pullFromServer(data.userId).catch(() => {});
    }
    // 로그인 계정의 일정으로 알림 재등록
    getUserSettings()
      .then((s) => rescheduleAllSchedules(s))
      .catch(() => {});
    navigation.goBack();
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.logo}>💊</Text>
        <Text style={styles.title}>필람에 오신 걸 환영해요</Text>
        <Text style={styles.sub}>간편로그인으로 시작하세요</Text>
      </View>

      {/* 소셜 로그인 버튼 */}
      <View style={styles.socialGroup}>
        {isAppleAuthAvailable() && (
          <TouchableOpacity
            testID="btn-apple"
            style={[styles.socialBtn, styles.appleBtn]}
            onPress={() => handleSocialLogin('Apple', signInWithApple)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Apple로 계속하기"
          >
            {loadingProvider === 'Apple'
              ? <ActivityIndicator color="#111827" />
              : (
                <View style={styles.socialBtnRow}>
                  <Ionicons name="logo-apple" size={20} color="#000" style={styles.socialIcon} />
                  <Text style={styles.appleBtnText}>Apple로 계속하기</Text>
                </View>
              )
            }
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="btn-google"
          style={[styles.socialBtn, styles.googleBtn]}
          onPress={() => handleSocialLogin('Google', signInWithGoogle)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Google로 계속하기"
        >
          {loadingProvider === 'Google'
            ? <ActivityIndicator color="#374151" />
            : (
              <View style={styles.socialBtnRow}>
                <View style={styles.socialIcon}>
                  <GoogleLogo size={19} />
                </View>
                <Text style={styles.googleBtnText}>Google로 계속하기</Text>
              </View>
            )
          }
        </TouchableOpacity>

        <TouchableOpacity
          testID="btn-kakao"
          style={[styles.socialBtn, styles.kakaoBtn]}
          onPress={() => handleSocialLogin('카카오', signInWithKakao)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="카카오로 계속하기"
        >
          {loadingProvider === '카카오'
            ? <ActivityIndicator color="#191919" />
            : (
              <View style={styles.socialBtnRow}>
                <Ionicons name="chatbubble" size={18} color="#191919" style={styles.socialIcon} />
                <Text style={styles.kakaoBtnText}>카카오로 계속하기</Text>
              </View>
            )
          }
        </TouchableOpacity>
      </View>

      {/* 로딩 오버레이 */}
      {loadingProvider && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>{loadingProvider}로 로그인 중...</Text>
          </View>
        </View>
      )}

      <Text style={styles.terms}>
        계속 진행하면 필람의{' '}
        <Text style={styles.termsLink}>서비스 이용약관</Text>
        {' '}및{' '}
        <Text style={styles.termsLink}>개인정보 처리방침</Text>
        에 동의하는 것으로 간주합니다.
      </Text>
    </ScrollView>

    <AlertModal
      visible={linkPrompt !== null}
      icon="link"
      title="이미 가입된 이메일"
      message={
        linkPrompt
          ? `${linkPrompt.link.email}\n\n이 이메일은 이미 ${linkPrompt.link.existingProvider} 계정으로 가입되어 있어요.\n${linkPrompt.link.newProvider} 계정을 기존 계정에 연결할까요?\n\n연결하면 두 방법 모두로 로그인할 수 있습니다.`
          : undefined
      }
      buttons={[
        { text: '취소', style: 'cancel', onPress: () => setLinkPrompt(null) },
        { text: '연결하기', onPress: confirmLink },
      ]}
      onRequestClose={() => setLinkPrompt(null)}
    />

    <AlertModal
      visible={deviceConflictPrompt !== null}
      icon="phone-portrait-outline"
      tone="warning"
      title="다른 기기에서 로그인 중"
      message={
        deviceConflictPrompt?.conflict.message ||
        '이 계정은 다른 기기에서 이미 로그인되어 있습니다.\n이 기기로 로그인하면 다른 기기는 자동으로 로그아웃됩니다.'
      }
      buttons={[
        { text: '취소', style: 'cancel', onPress: () => setDeviceConflictPrompt(null) },
        { text: '이 기기로 로그인', style: 'destructive', onPress: confirmDeviceConflict },
      ]}
      onRequestClose={() => setDeviceConflictPrompt(null)}
    />

    <AlertModal
      visible={simpleAlert !== null}
      icon="alert-circle"
      tone={simpleAlert?.tone ?? 'danger'}
      title={simpleAlert?.title ?? ''}
      message={simpleAlert?.message}
      buttons={[{ text: '확인', onPress: () => setSimpleAlert(null) }]}
      onRequestClose={() => setSimpleAlert(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: '#fff',
    justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48,
  },

  header: { alignItems: 'center', marginBottom: 44 },
  logo:   { fontSize: 56, marginBottom: 16 },
  title:  { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center' },
  sub:    { fontSize: 15, color: '#6b7280', marginTop: 8, textAlign: 'center' },

  socialGroup: { gap: 12 },
  socialBtn: {
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16,
    alignItems: 'center', borderWidth: 1,
  },
  // 아이콘 + 텍스트를 한 덩어리로 붙여서 버튼 안에서 가운데 정렬
  socialBtnRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%',
  },
  socialIcon: { marginRight: 10 },

  appleBtn:     { backgroundColor: '#fff', borderColor: '#d1d5db' },
  appleBtnText: { color: '#111827', fontSize: 16, fontWeight: '600' },

  googleBtn:     { backgroundColor: '#fff', borderColor: '#d1d5db' },
  googleBtnText: { color: '#111827', fontSize: 16, fontWeight: '600' },

  kakaoBtn:     { backgroundColor: '#FEE500', borderColor: '#FEE500' },
  kakaoBtnText: { color: '#191919', fontSize: 16, fontWeight: '600' },

  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', zIndex: 99,
  },
  loadingBox: {
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 28, paddingHorizontal: 40,
    alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  loadingText: { fontSize: 15, color: '#374151', fontWeight: '600' },

  terms:     { fontSize: 11, color: '#d1d5db', textAlign: 'center', marginTop: 28, lineHeight: 17 },
  termsLink: { color: '#9ca3af' },
});
