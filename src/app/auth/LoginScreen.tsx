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
import {
  isAppleAuthAvailable,
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
  signInWithNaver,
  type SocialAuthResponse,
} from '../../features/socialAuth';

type Nav = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { saveSession } = useAuthStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

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
      pullFromServer(data.userId).catch(() => {});
      initialPush(data.userId).catch(() => {});
      navigation.goBack();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? '로그인에 실패했습니다';
      Alert.alert('로그인 실패', msg);
    } finally {
      setLoading(false);
    }
  }

  // ── 소셜 로그인 공통 처리 ──────────────────────────────────────────────────────

  async function handleSocialLogin(
    providerName: string,
    loginFn: () => Promise<SocialAuthResponse>,
  ) {
    setLoading(true);
    try {
      const data = await loginFn();
      await saveSession({
        accessToken:  data.accessToken,
        refreshToken: data.refreshToken,
        userId:       data.userId,
        userEmail:    null,
        userName:     data.name ?? null,
      });
      if (data.isNewUser) {
        initialPush(data.userId).catch(() => {});
      } else {
        pullFromServer(data.userId).catch(() => {});
      }
      navigation.goBack();
    } catch (err: unknown) {
      // 사용자가 직접 취소한 경우 Alert 생략
      const code = (err as { code?: string })?.code;
      if (
        code === 'ERR_REQUEST_CANCELED' || // Apple
        code === 'SIGN_IN_CANCELLED'      // Google
      ) return;

      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? `${providerName} 로그인에 실패했습니다`;
      Alert.alert('로그인 실패', msg);
    } finally {
      setLoading(false);
    }
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

          <TouchableOpacity
            testID="btn-naver"
            style={[styles.socialBtn, styles.naverBtn]}
            onPress={() => handleSocialLogin('네이버', signInWithNaver)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="네이버로 계속하기"
          >
            <Text style={styles.naverBtnText}>N  네이버로 계속하기</Text>
          </TouchableOpacity>
        </View>

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

  naverBtn:     { backgroundColor: '#03C75A', borderColor: '#03C75A' },
  naverBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 32, gap: 6 },
  footerText: { fontSize: 14, color: '#6b7280' },
  linkText:   { fontSize: 14, color: '#3b82f6', fontWeight: '600' },
});
