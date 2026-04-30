import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { getMyProfile, updateMyName, type UserProfile } from '../../features/careCircle/careCircleApi';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function AccountScreen() {
  const { userEmail, userName, saveSession, accessToken, refreshToken, userId } = useAuthStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState('');
  const [savingName,  setSavingName]  = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile();
        setProfile(p);
        setNameInput(p.name ?? '');
      } catch {
        // 오프라인이면 로컬 캐시 사용
        setNameInput(userName ?? '');
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('오류', '이름을 입력해주세요');
      return;
    }
    setSavingName(true);
    try {
      const updated = await updateMyName(trimmed);
      setProfile(updated);
      // authStore userName도 갱신
      await saveSession({
        accessToken:  accessToken!,
        refreshToken: refreshToken!,
        userId:       userId!,
        userEmail:    userEmail!,
        userName:     updated.name ?? trimmed,
      });
      setEditingName(false);
      Alert.alert('완료', '이름이 변경되었습니다');
    } catch {
      Alert.alert('오류', '이름 변경에 실패했습니다');
    } finally {
      setSavingName(false);
    }
  }

  const displayName = profile?.name ?? userName ?? '';
  const displayEmail = profile?.email ?? userEmail ?? '';
  const joinedAt = profile?.createdAt ? formatDate(profile.createdAt) : '-';
  const provider = profile?.provider;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {loadingProfile ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#3b82f6" />
          ) : (
            <>
              {/* ── 프로필 아이콘 ── */}
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
                {provider && (
                  <View style={styles.providerBadge}>
                    <Text style={styles.providerBadgeTxt}>
                      {provider === 'kakao' ? '카카오' : provider === 'google' ? '구글' : provider}
                    </Text>
                  </View>
                )}
              </View>

              {/* ── 이름 ── */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>기본 정보</Text>

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>이름</Text>
                  {editingName ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editInput}
                        value={nameInput}
                        onChangeText={setNameInput}
                        autoFocus
                        maxLength={50}
                        returnKeyType="done"
                        onSubmitEditing={handleSaveName}
                        placeholder="이름 입력"
                        placeholderTextColor="#9ca3af"
                      />
                      <TouchableOpacity
                        style={[styles.editActionBtn, styles.saveBtn]}
                        onPress={handleSaveName}
                        disabled={savingName}
                      >
                        {savingName
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.saveBtnTxt}>저장</Text>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.editActionBtn, styles.cancelBtn]}
                        onPress={() => { setEditingName(false); setNameInput(profile?.name ?? ''); }}
                        disabled={savingName}
                      >
                        <Text style={styles.cancelBtnTxt}>취소</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.fieldValueRow}>
                      <Text style={styles.fieldValue}>{displayName || '(미설정)'}</Text>
                      {!provider && (
                        <TouchableOpacity onPress={() => setEditingName(true)} style={styles.editBtn}>
                          <Text style={styles.editBtnTxt}>수정</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>이메일</Text>
                  <Text style={styles.fieldValue}>{displayEmail}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>가입일</Text>
                  <Text style={styles.fieldValue}>{joinedAt}</Text>
                </View>

                {provider && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>로그인 방식</Text>
                      <Text style={styles.fieldValue}>
                        {provider === 'kakao' ? '카카오 소셜 로그인' : provider === 'google' ? '구글 소셜 로그인' : provider}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* ── 비밀번호 (이메일 가입자만) ── */}
              {!provider && (
                <View style={[styles.section, { marginTop: 16 }]}>
                  <Text style={styles.sectionTitle}>보안</Text>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoTxt}>
                      비밀번호를 변경하려면 로그인 화면의 "비밀번호 찾기"를 이용해주세요.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingHorizontal: 20, paddingVertical: 24 },

  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center',
  },
  avatarText:    { fontSize: 32, fontWeight: '700', color: '#fff' },
  providerBadge: {
    marginTop: 8, backgroundColor: '#fef9c3',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
  },
  providerBadgeTxt: { fontSize: 12, color: '#92400e', fontWeight: '600' },

  section: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 16 },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
  },
  fieldLabel: { fontSize: 14, color: '#6b7280', width: 60 },
  fieldValueRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  fieldValue:    { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },

  editBtn:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#eff6ff', borderRadius: 8 },
  editBtnTxt: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },

  editRow:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editInput: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: '#111827',
    backgroundColor: '#f9fafb',
  },
  editActionBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  saveBtn:       { backgroundColor: '#3b82f6' },
  saveBtnTxt:    { color: '#fff', fontWeight: '600', fontSize: 13 },
  cancelBtn:     { backgroundColor: '#f3f4f6' },
  cancelBtnTxt:  { color: '#374151', fontWeight: '600', fontSize: 13 },

  infoBox: { paddingHorizontal: 16, paddingVertical: 14 },
  infoTxt: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
});
