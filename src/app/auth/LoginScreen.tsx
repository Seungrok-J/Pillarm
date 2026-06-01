import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../store/authStore';
import { authLogin } from '../../features/careCircle/careCircleApi';
import { getExpoPushToken } from '../../notifications/pushToken';
import { initialPush, pullFromServer } from '../../sync/syncService';
import { getUserSettings } from '../../db';
import { rescheduleAllSchedules } from '../../notifications';
import {
  isAppleAuthAvailable,
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
  type SocialAuthResponse,
} from '../../features/socialAuth';
import {
  confirmSocialLink,
  type SocialLinkRequired,
} from '../../features/socialAuth/socialAuthApi';

type Nav = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { saveSession } = useAuthStore();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // ── 이메일 로그인 ─────────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const fcmToken = await getExpoPushToken();
      const data = await authLogin(email.trim().toLowerCase(), password, fcmToken ?? undefined);
      await saveSession({
        accessToken:  data.accessToken,
        refreshToken: data.refreshToken,
        userId:       data.userId,
        userEmail:    email.trim().toLowerCase(),
        userName:     data.name ?? null,
      });
      pullFromServer(data.userId)
        .then(() => getUserSettings())
        .then((s) => rescheduleAllSchedules(s))
        .catch(() => {});
      navigation.goBack();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      const msg = e.response?.data?.error ?? '로그인에 실패했습니다';
      // 소셜 계정 충돌: 어떤 소셜로 로그인해야 하는지 안내
      const title = e.response?.status === 401 && msg.includes('로그인을 이용해주세요')
        ? '로그인 방식 확인'
        : '로그인 실패';
      Alert.alert(title, msg);
    } finally {
      setLoading(false);
    }
  }

  // ── 소셜 로그인 공통 처리 ──────────────────────────────────────────────────────

  async function handleSocialLogin(
    providerName: string,
    loginFn: () => Promise<SocialAuthResponse | SocialLinkRequired>,
  ) {
    setLoading(true);
    setLoadingProvider(providerName);
    try {
      const result = await loginFn();

      // 동일 이메일 계정 존재 → 연결 확인 다이얼로그
      if ('requiresLink' in result && result.requiresLink) {
        const link = result as unknown as SocialLinkRequired;
        setLoading(false);
        setLoadingProvider(null);
        Alert.alert(
          '이미 가입된 이메일',
          `${link.email}\n\n이 이메일은 이미 ${link.existingProvider} 계정으로 가입되어 있어요.\n${link.newProvider} 계정을 기존 계정에 연결할까요?\n\n연결하면 두 방법 모두로 로그인할 수 있습니다.`,
          [
            { text: '취소', style: 'cancel' },
            {
              text: '연결하기',
              onPress: async () => {
                setLoading(true);
                setLoadingProvider(providerName);
                try {
                  const data = await confirmSocialLink(link.linkToken);
                  await afterLogin(data);
                } catch {
                  Alert.alert('오류', '계정 연결에 실패했습니다. 다시 시도해주세요.');
                } finally {
                  setLoading(false);
                  setLoadingProvider(null);
                }
              },
            },
          ],
        );
        return;
      }

      await afterLogin(result as unknown as SocialAuthResponse);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED' || code === 'SIGN_IN_CANCELLED') return;

      const e = err as { code?: string; message?: string; response?: { status?: number; data?: { error?: string } } };
      const msg = e.response?.data?.error ?? e.message ?? `${providerName} 로그인에 실패했습니다`;
      Alert.alert('로그인 실패', msg);
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  }

  async function afterLogin(data: SocialAuthResponse) {
    await saveSession({
      accessToken:  data.accessToken,
      refreshToken: data.refreshToken,
      userId:       data.userId,
      userEmail:    null,
      userName:     data.name ?? null,
    });
    if (data.isNewUser) {
      initialPush(data.userId).catch(() => {});
      getUserSettings().then((s) => rescheduleAllSchedules(s)).catch(() => {});
    } else {
      pullFromServer(data.userId)
        .then(() => getUserSettings())
        .then((s) => rescheduleAllSchedules(s))
        .catch(() => {});
    }
    navigation.goBack();
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>💊</Text>
          <Text style={styles.title}>필람에 오신 걸 환영해요</Text>
          <Text style={styles.sub}>로그인하면 보호자 공유 기능을 사용할 수 있어요</Text>
        </View>

        {/* 이메일 로그인 */}
        <View style={styles.form}>
          <Text style={styles.label}>이메일</Text>
          <TextInput
            testID="input-email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="hello@example.com"
            placeholderTextColor="#9ca3af"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>비밀번호</Text>
          <TextInput
            testID="input-password"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="8자 이상"
            placeholderTextColor="#9ca3af"
          />

          <TouchableOpacity
            testID="btn-login"
            style={[styles.primaryBtn, (!email || !password || loading) && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={!email || !password || loading}
            accessibilityLabel="로그인"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>로그인</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="btn-forgot-password"
            style={styles.forgotBtn}
            onPress={() => navigation.navigate('ForgotPassword')}
            accessibilityRole="button"
          >
            <Text style={styles.forgotBtnText}>비밀번호를 잊으셨나요?</Text>
          </TouchableOpacity>
        </View>

        {/* 구분선 */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는</Text>
          <View style={styles.dividerLine} />
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
              <Text style={styles.appleBtnText}> Apple로 계속하기</Text>
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
            <Text style={styles.googleBtnText}>G  Google로 계속하기</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="btn-kakao"
            style={[styles.socialBtn, styles.kakaoBtn]}
            onPress={() => handleSocialLogin('카카오', signInWithKakao)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="카카오로 계속하기"
          >
            <Text style={styles.kakaoBtnText}>💬  카카오로 계속하기</Text>
          </TouchableOpacity>

        </View>

        {loadingProvider && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>{loadingProvider}로 로그인 중...</Text>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>아직 계정이 없으신가요?</Text>
          <TouchableOpacity testID="btn-go-signup" onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.linkText}>회원가입</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  header:  { alignItems: 'center', marginBottom: 40 },
  logo:    { fontSize: 48, marginBottom: 12 },
  title:   { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  sub:     { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  form:  {},
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },

  primaryBtn: {
    marginTop: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled:    { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  forgotBtn:     { marginTop: 16, alignItems: 'center' },
  forgotBtnText: { fontSize: 14, color: '#6b7280' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { marginHorizontal: 12, fontSize: 13, color: '#9ca3af' },

  socialGroup: { gap: 12 },
  socialBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },

  appleBtn:     { backgroundColor: '#000', borderColor: '#000' },
  appleBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  googleBtn:     { backgroundColor: '#fff', borderColor: '#d1d5db' },
  googleBtnText: { color: '#111827', fontSize: 15, fontWeight: '600' },

  kakaoBtn:     { backgroundColor: '#FEE500', borderColor: '#FEE500' },
  kakaoBtnText: { color: '#191919', fontSize: 15, fontWeight: '600' },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 32, gap: 6 },
  footerText: { fontSize: 14, color: '#6b7280' },
  linkText:   { fontSize: 14, color: '#3b82f6', fontWeight: '600' },

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
});
