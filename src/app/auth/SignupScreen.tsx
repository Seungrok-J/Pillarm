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

type Nav = StackNavigationProp<RootStackParamList, 'Signup'>;

export default function SignupScreen() {
  const navigation = useNavigation<Nav>();
  const { saveSession } = useAuthStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);

  const passwordMismatch = password.length > 0 && confirm.length > 0 && password !== confirm;
  const canSubmit = !!email && password.length >= 8 && password === confirm && !loading;

  async function handleSignup() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const data = await authSignup(email.trim().toLowerCase(), password);
      await saveSession({
        accessToken:  data.accessToken,
        refreshToken: data.refreshToken,
        userId:       data.userId,
        userEmail:    email.trim().toLowerCase(),
      });
      navigation.goBack();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? '회원가입에 실패했습니다';
      Alert.alert('회원가입 실패', msg);
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
          <Text style={styles.title}>계정 만들기</Text>
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
            accessibilityLabel="회원가입"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>가입하기</Text>
            )}
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

  header:  { alignItems: 'center', marginBottom: 40 },
  logo:    { fontSize: 48, marginBottom: 12 },
  title:   { fontSize: 22, fontWeight: '700', color: '#111827' },

  form:       {},
  label:      { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  errorHint:  { fontSize: 12, color: '#ef4444', marginTop: 4 },
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
  inputError: { borderColor: '#ef4444' },

  primaryBtn: {
    marginTop: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled:    { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 32, gap: 6 },
  footerText: { fontSize: 14, color: '#6b7280' },
  linkText:   { fontSize: 14, color: '#3b82f6', fontWeight: '600' },
});
