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
import { authSignup } from '../../features/careCircle/careCircleApi';
import { getExpoPushToken } from '../../notifications/pushToken';
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
} from '../../features/socialAuth/socialAuthApi';

type Nav = StackNavigationProp<RootStackParamList, 'Signup'>;

const PROVIDER_LABEL: Record<string, string> = {
  apple:  'Apple',
  google: 'Google',
  kakao:  '카카오',
};

export default function SignupScreen() {
  const navigation = useNavigation<Nav>();
  const { saveSession } = useAuthStore();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // 소셜 계정 충돌 시 해당 버튼을 강조하기 위한 상태
  const [highlightProvider, setHighlightProvider] = useState<string | null>(null);

  const passwordMismatch = password.length > 0 && confirm.length > 0 && password !== confirm;
  const canSubmit = !!name.trim() && !!email && password.length >= 8 && password === confirm && !loading;

  // ── 이메일 회원가입 ──────────────────────────────────────────────────────────

  async function handleSignup() {
    if (!canSubmit) return;
    setLoading(true);
    setHighlightProvider(null);
    try {
      const fcmToken = await getExpoPushToken();
      const data = await authSignup(email.trim().toLowerCase(), password, name.trim(), fcmToken ?? undefined);
      await saveSession({
        accessToken:  data.accessToken,
        refreshToken: data.refreshToken,
        userId:       data.userId,
        userEmail:    email.trim().toLowerCase(),
        userName:     data.name ?? name.trim(),
      });
      initialPush(data.userId).catch(() => {});
      navigation.goBack();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string; existingProvider?: string } } };
      const status = e.response?.status;
      const msg    = e.response?.data?.error ?? '회원가입에 실패했습니다';
      const existingProvider = e.response?.data?.existingProvider;

      if (status === 409) {
        if (existingProvider) {
          // 소셜 계정이 있는 이메일 → 해당 소셜 버튼 강조
          setHighlightProvider(existingProvider);
          Alert.alert(
            '이미 가입된 이메일',
            `${msg}\n\n아래 ${PROVIDER_LABEL[existingProvider] ?? existingProvider} 버튼으로 로그인해보세요.`,
            [{ text: '확인' }],
          );
        } else {
          // 일반 이메일 계정이 이미 있는 경우
          Alert.alert(
            '이미 가입된 이메일',
            msg,
            [
              { text: '확인' },
              { text: '로그인하기', onPress: () => navigation.navigate('Login') },
            ],
          );
        }
      } else {
        Alert.alert('회원가입 실패', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── 소셜 로그인/가입 공통 처리 ────────────────────────────────────────────────

  async function handleSocialSignup(
    providerName: string,
    loginFn: () => Promise<SocialAuthResponse | SocialLinkRequired>,
  ) {
    setLoading(true);
    setLoadingProvider(providerName);
    try {
      const result = await loginFn();

      // 동일 이메일 기존 계정 → 연결 확인
      if ('requiresLink' in result && result.requiresLink) {
        const link = result as SocialLinkRequired;
        setLoading(false);
        setLoadingProvider(null);
        Alert.alert(
          '이미 가입된 이메일',
          `${link.email}\n\n이 이메일은 이미 ${link.existingProvider} 계정으로 가입되어 있어요.\n${link.newProvider} 계정을 연결할까요?`,
          [
            { text: '취소', style: 'cancel' },
            {
              text: '연결하기',
              onPress: async () => {
                setLoading(true);
                setLoadingProvider(providerName);
                try {
                  const data = await confirmSocialLink(link.linkToken);
                  await afterSocialLogin(data);
                } catch {
                  Alert.alert('오류', '계정 연결에 실패했습니다.');
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

      await afterSocialLogin(result as SocialAuthResponse);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED' || code === 'SIGN_IN_CANCELLED') return;
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (err as Error)?.message ?? `${providerName} 로그인에 실패했습니다`;
      Alert.alert('로그인 실패', msg);
    } finally {
      setLoading(false);
      setLoadingProvider(null);
    }
  }

  async function afterSocialLogin(data: SocialAuthResponse) {
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

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <Text style={styles.logo}>💊</Text>
          <Text style={styles.title}>계정 만들기</Text>
          <Text style={styles.sub}>소셜 계정으로 간편하게 시작할 수도 있어요</Text>
        </View>

        {/* ── 소셜 가입 ── */}
        <View style={styles.socialGroup}>
          {isAppleAuthAvailable() && (
            <TouchableOpacity
              testID="btn-apple"
              style={[
                styles.socialBtn, styles.appleBtn,
                highlightProvider === 'apple' && styles.socialBtnHighlight,
              ]}
              onPress={() => handleSocialSignup('Apple', signInWithApple)}
              disabled={loading}
              accessibilityRole="button"
            >
              {loadingProvider === 'Apple'
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.appleBtnText}> Apple로 계속하기</Text>
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity
            testID="btn-google"
            style={[
              styles.socialBtn, styles.googleBtn,
              highlightProvider === 'google' && styles.socialBtnHighlight,
            ]}
            onPress={() => handleSocialSignup('Google', signInWithGoogle)}
            disabled={loading}
            accessibilityRole="button"
          >
            {loadingProvider === 'Google'
              ? <ActivityIndicator color="#374151" />
              : <Text style={styles.googleBtnText}>G  Google로 계속하기</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            testID="btn-kakao"
            style={[
              styles.socialBtn, styles.kakaoBtn,
              highlightProvider === 'kakao' && styles.socialBtnHighlight,
            ]}
            onPress={() => handleSocialSignup('카카오', signInWithKakao)}
            disabled={loading}
            accessibilityRole="button"
          >
            {loadingProvider === '카카오'
              ? <ActivityIndicator color="#191919" />
              : <Text style={styles.kakaoBtnText}>💬  카카오로 계속하기</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── 구분선 ── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는 이메일로 가입</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── 이메일 가입 폼 ── */}
        <View style={styles.form}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            testID="input-name"
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="홍길동"
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>이메일</Text>
          <TextInput
            testID="input-email"
            style={styles.input}
            value={email}
            onChangeText={(t) => { setEmail(t); setHighlightProvider(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
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
            placeholder="8자 이상"
            placeholderTextColor="#9ca3af"
          />
          {password.length > 0 && password.length < 8 && (
            <Text style={styles.errorHint}>비밀번호는 8자 이상이어야 합니다</Text>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>비밀번호 확인</Text>
          <TextInput
            testID="input-confirm"
            style={[styles.input, passwordMismatch && styles.inputError]}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="동일하게 입력하세요"
            placeholderTextColor="#9ca3af"
          />
          {passwordMismatch && (
            <Text style={styles.errorHint}>비밀번호가 일치하지 않습니다</Text>
          )}

          <TouchableOpacity
            testID="btn-signup"
            style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
            onPress={handleSignup}
            disabled={!canSubmit}
            accessibilityRole="button"
          >
            {loading && !loadingProvider
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>가입하기</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>이미 계정이 있으신가요?</Text>
          <TouchableOpacity testID="btn-go-login" onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>로그인</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  header:  { alignItems: 'center', marginBottom: 28 },
  logo:    { fontSize: 48, marginBottom: 12 },
  title:   { fontSize: 22, fontWeight: '700', color: '#111827' },
  sub:     { fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center' },

  socialGroup: { gap: 10, marginBottom: 8 },
  socialBtn: {
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1,
  },
  socialBtnHighlight: { borderWidth: 2, borderColor: '#3b82f6' },

  appleBtn:     { backgroundColor: '#000', borderColor: '#000' },
  appleBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  googleBtn:     { backgroundColor: '#fff', borderColor: '#d1d5db' },
  googleBtnText: { color: '#111827', fontSize: 15, fontWeight: '600' },

  kakaoBtn:     { backgroundColor: '#FEE500', borderColor: '#FEE500' },
  kakaoBtnText: { color: '#191919', fontSize: 15, fontWeight: '600' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: '#9ca3af' },

  form:      {},
  label:     { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  errorHint: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#111827', backgroundColor: '#f9fafb',
  },
  inputError: { borderColor: '#ef4444' },

  primaryBtn: {
    marginTop: 24, backgroundColor: '#3b82f6',
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  btnDisabled:    { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 32, gap: 6 },
  footerText: { fontSize: 14, color: '#6b7280' },
  linkText:   { fontSize: 14, color: '#3b82f6', fontWeight: '600' },
});
