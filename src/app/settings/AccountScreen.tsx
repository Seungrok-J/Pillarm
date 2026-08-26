import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../store/authStore';
import { getMyProfile, updateMyName, deleteMyAccount, type UserProfile } from '../../features/careCircle/careCircleApi';
import AlertModal, { type AlertModalTone } from '../../components/AlertModal';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function AccountScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { userEmail, userName, saveSession, clearSession, accessToken, refreshToken, userId } = useAuthStore();

  const [profile,         setProfile]         = useState<UserProfile | null>(null);
  const [loadingProfile,  setLoadingProfile]   = useState(true);
  const [editingName,     setEditingName]      = useState(false);
  const [nameInput,       setNameInput]        = useState('');
  const [savingName,      setSavingName]       = useState(false);
  const [deletingAccount, setDeletingAccount]  = useState(false);
  const [simpleAlert, setSimpleAlert] = useState<{ title: string; message?: string; tone?: AlertModalTone } | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteSuccessVisible, setDeleteSuccessVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile();
        setProfile(p);
        setNameInput(p.name ?? '');
      } catch {
        setNameInput(userName ?? '');
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) { setSimpleAlert({ title: '오류', message: '이름을 입력해주세요', tone: 'danger' }); return; }
    setSavingName(true);
    try {
      const updated = await updateMyName(trimmed);
      setProfile(updated);
      await saveSession({
        accessToken:  accessToken!,
        refreshToken: refreshToken!,
        userId:       userId!,
        userEmail:    userEmail!,
        userName:     updated.name ?? trimmed,
      });
      setEditingName(false);
      setSimpleAlert({ title: '완료', message: '이름이 변경되었습니다', tone: 'success' });
    } catch {
      setSimpleAlert({ title: '오류', message: '이름 변경에 실패했습니다', tone: 'danger' });
    } finally {
      setSavingName(false);
    }
  }

  function handleDeleteAccount() {
    setDeleteConfirmVisible(true);
  }

  async function performDeleteAccount() {
    setDeleteConfirmVisible(false);
    setDeletingAccount(true);
    try {
      await deleteMyAccount();
      await clearSession();
      setDeleteSuccessVisible(true);
    } catch {
      setSimpleAlert({ title: '오류', message: '탈퇴 처리 중 문제가 발생했습니다.', tone: 'danger' });
      setDeletingAccount(false);
    }
  }

  const displayName  = profile?.name  ?? userName ?? '';
  const displayEmail = profile?.email ?? userEmail ?? '';
  const joinedAt     = profile?.createdAt ? formatDate(profile.createdAt) : '-';
  const provider     = profile?.provider;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {loadingProfile ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#3b82f6" />
          ) : (
            <>
              {/* 프로필 아이콘 */}
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
              </View>

              {/* 기본 정보 */}
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
                      <TouchableOpacity style={[styles.editActionBtn, styles.saveBtn]} onPress={handleSaveName} disabled={savingName}>
                        {savingName ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnTxt}>저장</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.editActionBtn, styles.cancelBtn]} onPress={() => { setEditingName(false); setNameInput(profile?.name ?? ''); }} disabled={savingName}>
                        <Text style={styles.cancelBtnTxt}>취소</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.fieldValueRow}>
                      <Text style={styles.fieldValue}>{displayName || '(미설정)'}</Text>
                      <TouchableOpacity onPress={() => setEditingName(true)} style={styles.editBtn}>
                        <Text style={styles.editBtnTxt}>수정</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>이메일</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldValue}>{displayEmail || '(미제공)'}</Text>
                    {displayEmail.includes('privaterelay.appleid.com') && (
                      <Text style={styles.relayNote}>Apple 개인 정보 보호 이메일</Text>
                    )}
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>가입일</Text>
                  <Text style={styles.fieldValue}>{joinedAt}</Text>
                </View>
              </View>

              {/* 비밀번호 (이메일 가입자만) */}
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

              {/* 회원 탈퇴 */}
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} disabled={deletingAccount}>
                {deletingAccount
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <Text style={styles.deleteBtnTxt}>회원 탈퇴</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal
        visible={simpleAlert !== null}
        icon="alert-circle"
        tone={simpleAlert?.tone ?? 'danger'}
        title={simpleAlert?.title ?? ''}
        message={simpleAlert?.message}
        buttons={[{ text: '확인', onPress: () => setSimpleAlert(null) }]}
        onRequestClose={() => setSimpleAlert(null)}
      />

      <AlertModal
        visible={deleteConfirmVisible}
        icon="warning"
        tone="danger"
        title="회원 탈퇴"
        message="탈퇴하면 모든 데이터가 영구적으로 삭제됩니다. 정말 탈퇴하시겠어요?"
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeleteConfirmVisible(false) },
          { text: '탈퇴하기', style: 'destructive', onPress: performDeleteAccount },
        ]}
        onRequestClose={() => setDeleteConfirmVisible(false)}
      />

      <AlertModal
        visible={deleteSuccessVisible}
        icon="checkmark-circle"
        tone="success"
        title="탈퇴 완료"
        message="그동안 필람을 이용해주셔서 감사합니다."
        buttons={[{ text: '확인', onPress: () => { setDeleteSuccessVisible(false); navigation.popToTop(); } }]}
        onRequestClose={() => { setDeleteSuccessVisible(false); navigation.popToTop(); }}
      />
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
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },

  section: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 16 },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
  },
  fieldLabel:    { fontSize: 14, color: '#6b7280', width: 60 },
  fieldValueRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  fieldValue:    { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },

  editBtn:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#eff6ff', borderRadius: 8 },
  editBtnTxt: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },

  editRow:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  relayNote: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  deleteBtn: {
    marginTop: 32, marginBottom: 16,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#fca5a5', borderRadius: 12,
  },
  deleteBtnTxt: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
});
