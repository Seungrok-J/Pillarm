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
import { initialPush } from '../../sync/syncService';

type Nav = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { saveSession } = useAuthStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

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

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 32, gap: 6 },
  footerText: { fontSize: 14, color: '#6b7280' },
  linkText:   { fontSize: 14, color: '#3b82f6', fontWeight: '600' },
});
