import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../store/authStore';
import { getMyProfile, updateMyName, deleteMyAccount, type UserProfile } from '../../features/careCircle/careCircleApi';
import {
  getSocialConnections,
  linkSocialAccount,
  unlinkSocialAccount,
  type SocialConnection,
} from '../../features/socialAuth/socialAuthApi';
import {
  isAppleAuthAvailable,
  getAppleCredentials,
  getGoogleIdToken,
  getKakaoAccessToken,
} from '../../features/socialAuth';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const PROVIDER_META: Record<string, { label: string }> = {
  apple:  { label: 'Apple'  },
  google: { label: 'Google' },
  kakao:  { label: '카카오' },
};

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'apple')  return <Ionicons name="logo-apple" size={20} color="#fff" />;
  if (provider === 'google') return <AntDesign name="google"    size={18} color="#4285F4" />;
  if (provider === 'kakao')  return <Text style={{ fontSize: 16, color: '#191919', fontWeight: '700' }}>K</Text>;
  return null;
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

  const [connections,     setConnections]      = useState<SocialConnection[]>([]);
  const [hasPassword,     setHasPassword]      = useState(false);
  const [loadingConn,     setLoadingConn]      = useState(true);
  const [linkingProvider, setLinkingProvider]  = useState<string | null>(null);

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

  const loadConnections = useCallback(async () => {
    try {
      const { connections: c, hasPassword: hp } = await getSocialConnections();
      setConnections(c);
      setHasPassword(hp);
    } catch {
      // 오프라인이면 무시
    } finally {
      setLoadingConn(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) { Alert.alert('오류', '이름을 입력해주세요'); return; }
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
      Alert.alert('완료', '이름이 변경되었습니다');
    } catch {
      Alert.alert('오류', '이름 변경에 실패했습니다');
    } finally {
      setSavingName(false);
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      '회원 탈퇴',
      '탈퇴하면 모든 데이터가 영구적으로 삭제됩니다. 정말 탈퇴하시겠어요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteMyAccount();
              await clearSession();
              Alert.alert('탈퇴 완료', '그동안 필람을 이용해주셔서 감사합니다.', [
                { text: '확인', onPress: () => navigation.popToTop() },
              ]);
            } catch {
              Alert.alert('오류', '탈퇴 처리 중 문제가 발생했습니다.');
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  }

  async function handleLink(provider: string) {
    setLinkingProvider(provider);
    try {
      let payload: { idToken?: string; accessToken?: string; name?: string } | null = null;

      if (provider === 'apple') {
        payload = await getAppleCredentials();
      } else if (provider === 'google') {
        payload = await getGoogleIdToken();
      } else if (provider === 'kakao') {
        payload = await getKakaoAccessToken();
      }

      if (!payload) return;
      await linkSocialAccount({ provider: provider as any, ...payload });
      Alert.alert('연결 완료', `${PROVIDER_META[provider]?.label ?? provider} 계정이 연결되었습니다.`);
      await loadConnections();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED' || code === 'SIGN_IN_CANCELLED') return;
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err as Error)?.message ?? '연결에 실패했습니다.';
      Alert.alert('연결 실패', msg);
    } finally {
      setLinkingProvider(null);
    }
  }

  async function handleUnlink(provider: string) {
    const label = PROVIDER_META[provider]?.label ?? provider;
    Alert.alert(
      `${label} 연결 해제`,
      `${label} 계정 연결을 해제할까요?\n다른 로그인 방법이 있어야 해제할 수 있습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제하기',
          style: 'destructive',
          onPress: async () => {
            setLinkingProvider(provider);
            try {
              await unlinkSocialAccount(provider);
              Alert.alert('해제 완료', `${label} 계정 연결이 해제되었습니다.`);
              await loadConnections();
            } catch (err: unknown) {
              const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
                ?? '해제에 실패했습니다.';
              Alert.alert('오류', msg);
            } finally {
              setLinkingProvider(null);
            }
          },
        },
      ],
    );
  }

  const displayName  = profile?.name  ?? userName ?? '';
  const displayEmail = profile?.email ?? userEmail ?? '';
  const joinedAt     = profile?.createdAt ? formatDate(profile.createdAt) : '-';
  const provider     = profile?.provider;

  // 보여줄 소셜 제공자 목록 (iOS면 Apple 포함, Android는 미포함)
  const availableProviders = [
    ...(isAppleAuthAvailable() ? ['apple'] : []),
    'google',
    'kakao',
  ];

  const isConnected = (p: string) => connections.some((c) => c.provider === p) || provider === p;

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

              {/* SNS 계정 연결 */}
              <View style={[styles.section, { marginTop: 16 }]}>
                <Text style={styles.sectionTitle}>SNS 계정 연결</Text>
                <Text style={styles.sectionDesc}>
                  여러 소셜 계정을 연결하면 어떤 방법으로도 로그인할 수 있어요.
                </Text>

                {loadingConn ? (
                  <ActivityIndicator style={{ marginVertical: 16 }} color="#3b82f6" />
                ) : (
                  availableProviders.map((p, index) => {
                    const meta      = PROVIDER_META[p] ?? { label: p, emoji: '?' };
                    const connected = isConnected(p);
                    const isLinking = linkingProvider === p;
                    const isFirst   = index === 0;

                    return (
                      <View key={p}>
                        {!isFirst && <View style={styles.divider} />}
                        <View style={styles.providerRow}>
                          <View style={styles.providerLeft}>
                            <View style={[styles.providerIconBox, p === 'apple' && styles.appleBox, p === 'google' && styles.googleBox, p === 'kakao' && styles.kakaoBox]}>
                              <ProviderIcon provider={p} />
                            </View>
                            <View>
                              <Text style={styles.providerName}>{meta.label}</Text>
                              {connected && (
                                <Text style={styles.connectedLabel}>연결됨</Text>
                              )}
                            </View>
                          </View>

                          {isLinking ? (
                            <ActivityIndicator size="small" color="#3b82f6" />
                          ) : connected ? (
                            <TouchableOpacity
                              style={styles.unlinkBtn}
                              onPress={() => handleUnlink(p)}
                            >
                              <Text style={styles.unlinkBtnText}>해제</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={styles.linkBtn}
                              onPress={() => handleLink(p)}
                            >
                              <Text style={styles.linkBtnText}>연결하기</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}

                {!hasPassword && connections.length + (provider ? 1 : 0) <= 1 && (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      ⚠️ 로그인 방법이 1개뿐입니다. 해제하려면 먼저 다른 계정을 연결하세요.
                    </Text>
                  </View>
                )}
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
  sectionDesc: {
    fontSize: 12, color: '#9ca3af', paddingHorizontal: 16, paddingBottom: 10,
    lineHeight: 18,
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

  // SNS 연결
  providerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  providerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  appleBox:  { backgroundColor: '#000' },
  googleBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  kakaoBox:  { backgroundColor: '#FEE500' },
  providerName:   { fontSize: 15, fontWeight: '600', color: '#111827' },
  connectedLabel: { fontSize: 12, color: '#16a34a', marginTop: 1 },

  linkBtn:      { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#eff6ff', borderRadius: 10 },
  linkBtnText:  { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
  unlinkBtn:    { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fef2f2', borderRadius: 10 },
  unlinkBtnText:{ fontSize: 13, color: '#ef4444', fontWeight: '600' },

  warningBox: { marginHorizontal: 16, marginBottom: 14, padding: 12, backgroundColor: '#fffbeb', borderRadius: 8 },
  warningText:{ fontSize: 12, color: '#92400e', lineHeight: 18 },

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
