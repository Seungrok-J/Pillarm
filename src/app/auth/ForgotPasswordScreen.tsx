import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { resetPassword } from '../../features/careCircle/careCircleApi';

type Nav = StackNavigationProp<RootStackParamList, 'ForgotPassword'>;

type Step = 'verify' | 'reset';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();

  const [step, setStep] = useState<Step>('verify');

  // step 1
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');

  // step 2
  const [newPw,   setNewPw]   = useState('');
  const [confirm, setConfirm] = useState('');

  const [loading, setLoading] = useState(false);

  const pwMismatch = newPw.length > 0 && confirm.length > 0 && newPw !== confirm;
  const canVerify  = !!name.trim() && !!email.trim();
  const canReset   = newPw.length >= 8 && newPw === confirm;

  async function handleReset() {
    if (!canReset) return;
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase(), name.trim(), newPw);
      Alert.alert(
        '변경 완료',
        '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.',
        [{ text: '로그인 하기', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? '비밀번호 변경에 실패했습니다';
      Alert.alert('오류', msg);
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

        {/* ── 헤더 ── */}
        <View style={styles.header}>
          <Text style={styles.logo}>🔑</Text>
          <Text style={styles.title}>비밀번호 찾기</Text>
          <Text style={styles.sub}>
            {step === 'verify'
              ? '가입 시 등록한 이름과 이메일을 입력하세요'
              : '새 비밀번호를 설정해주세요'}
          </Text>
        </View>

        {/* ── 스텝 인디케이터 ── */}
        <View style={styles.steps}>
          <View style={[styles.stepDot, step === 'verify' ? styles.stepDotActive : styles.stepDotDone]}>
            <Text style={styles.stepDotTxt}>1</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === 'reset' ? styles.stepDotActive : styles.stepDotInactive]}>
            <Text style={[styles.stepDotTxt, step !== 'reset' && styles.stepDotTxtInactive]}>2</Text>
          </View>
        </View>

        {step === 'verify' ? (
          /* ── STEP 1: 이름 + 이메일 확인 ── */
          <View style={styles.form}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              testID="input-name"
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="가입 시 입력한 이름"
              placeholderTextColor="#9ca3af"
            />

            <Text style={[styles.label, { marginTop: 16 }]}>이메일</Text>
            <TextInput
              testID="input-email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="가입한 이메일 주소"
              placeholderTextColor="#9ca3af"
            />

            <TouchableOpacity
              testID="btn-verify"
              style={[styles.primaryBtn, !canVerify && styles.btnDisabled]}
              onPress={() => setStep('reset')}
              disabled={!canVerify}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnTxt}>다음</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── STEP 2: 새 비밀번호 입력 ── */
          <View style={styles.form}>
            <Text style={styles.label}>새 비밀번호</Text>
            <TextInput
              testID="input-new-pw"
              style={styles.input}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              placeholder="8자 이상"
              placeholderTextColor="#9ca3af"
            />
            {newPw.length > 0 && newPw.length < 8 && (
              <Text style={styles.errorHint}>비밀번호는 8자 이상이어야 합니다</Text>
            )}

            <Text style={[styles.label, { marginTop: 16 }]}>비밀번호 확인</Text>
            <TextInput
              testID="input-confirm-pw"
              style={[styles.input, pwMismatch && styles.inputError]}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="동일하게 입력하세요"
              placeholderTextColor="#9ca3af"
            />
            {pwMismatch && (
              <Text style={styles.errorHint}>비밀번호가 일치하지 않습니다</Text>
            )}

            <TouchableOpacity
              testID="btn-reset"
              style={[styles.primaryBtn, (!canReset || loading) && styles.btnDisabled]}
              onPress={handleReset}
              disabled={!canReset || loading}
              accessibilityRole="button"
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnTxt}>비밀번호 변경</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={() => setStep('verify')}>
              <Text style={styles.backBtnTxt}>← 이전 단계로</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  header:  { alignItems: 'center', marginBottom: 32 },
  logo:    { fontSize: 48, marginBottom: 12 },
  title:   { fontSize: 22, fontWeight: '700', color: '#111827' },
  sub:     { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  steps:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  stepDot:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: '#3b82f6' },
  stepDotDone:   { backgroundColor: '#16a34a' },
  stepDotInactive: { backgroundColor: '#e5e7eb' },
  stepDotTxt:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepDotTxtInactive: { color: '#9ca3af' },
  stepLine:      { width: 40, height: 2, backgroundColor: '#e5e7eb', marginHorizontal: 8 },

  form:  {},
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#111827', backgroundColor: '#f9fafb',
  },
  inputError: { borderColor: '#ef4444' },
  errorHint:  { fontSize: 12, color: '#ef4444', marginTop: 4 },

  primaryBtn: {
    marginTop: 24, backgroundColor: '#3b82f6',
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  btnDisabled:    { opacity: 0.5 },
  primaryBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '700' },

  backBtn:    { marginTop: 16, alignItems: 'center' },
  backBtnTxt: { fontSize: 14, color: '#6b7280' },
});
