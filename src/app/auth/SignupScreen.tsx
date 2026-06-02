/**
 * SignupScreen — 기존 이메일 계정 보유자 전용 로그인 화면
 * 신규 이메일 가입은 지원하지 않습니다. 소셜 로그인을 이용해주세요.
 */

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
import { pullFromServer } from '../../sync/syncService';
import { getUserSettings } from '../../db';
import { rescheduleAllSchedules } from '../../notifications';

type Nav = StackNavigationProp<RootStackParamList, 'Signup'>;

export default function SignupScreen() {
  const navigation = useNavigation<Nav>();
  const { saveSession } = useAuthStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const canSubmit = !!email && !!password && !loading;

  async function handleLogin() {
    if (!canSubmit) return;
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
          <Text style={styles.title}>이메일로 로그인</Text>
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeText}>
              💡 이전에 이메일로 가입한 계정 전용입니다.{'\n'}
              신규 가입은 소셜 로그인을 이용해주세요.
            </Text>
          </View>
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
            placeholder="비밀번호 입력"
            placeholderTextColor="#9ca3af"
          />

          <TouchableOpacity
            testID="btn-login"
            style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>로그인</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotBtnText}>비밀번호를 잊으셨나요?</Text>
          </TouchableOpacity>
        </View>

        {/* 소셜 로그인 안내 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>소셜 계정이 있으신가요?</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>소셜 로그인으로 돌아가기</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  header: { marginBottom: 32 },
  title:  { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 14 },

  noticeBanner: {
    backgroundColor: '#eff6ff', borderRadius: 12,
    padding: 14, borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  noticeText: { fontSize: 13, color: '#1e40af', lineHeight: 20 },

  form:  {},
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#111827', backgroundColor: '#f9fafb',
  },

  primaryBtn: {
    marginTop: 24, backgroundColor: '#3b82f6',
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  btnDisabled:    { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  forgotBtn:     { marginTop: 16, alignItems: 'center' },
  forgotBtnText: { fontSize: 14, color: '#6b7280' },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 36, gap: 6, flexWrap: 'wrap' },
  footerText: { fontSize: 13, color: '#9ca3af' },
  linkText:   { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
});
