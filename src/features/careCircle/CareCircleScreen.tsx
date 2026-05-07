import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  ActivityIndicator, Alert, StyleSheet,
  ScrollView, TextInput, Share, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../store/authStore';
import QRCode from 'react-native-qrcode-svg';
import {
  listCircles, createCircle, deleteCircle, createInvite,
  deleteMember, updateMemberNickname,
  type ApiCareCircle, type ApiCareMember,
} from './careCircleApi';

type Nav = StackNavigationProp<RootStackParamList>;

const ROLE_LABEL: Record<string, string> = {
  admin:      '관리자',
  viewer:     '열람자',
  notifyOnly: '알림 전용',
};

// ── 멤버 표시 이름 헬퍼 ────────────────────────────────────────────────────────

function memberDisplayName(m: ApiCareMember): string {
  if (m.nickname) return m.nickname;
  if (m.memberUserName) return m.memberUserName;
  if (m.memberUserEmail) return m.memberUserEmail;
  return m.memberUserId.slice(0, 8);
}

// ── 별칭 편집 모달 ─────────────────────────────────────────────────────────────

interface NicknameModalProps {
  visible:         boolean;
  currentNickname: string;
  displayName:     string;
  onConfirm:       (nickname: string) => void;
  onClose:         () => void;
}

function NicknameModal({ visible, currentNickname, displayName, onConfirm, onClose }: NicknameModalProps) {
  const [value, setValue] = useState(currentNickname);

  useEffect(() => {
    if (visible) setValue(currentNickname);
  }, [visible, currentNickname]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={nmStyles.overlay}>
        <View style={nmStyles.sheet}>
          <Text style={nmStyles.title}>별칭 수정</Text>
          <Text style={nmStyles.sub}>{displayName}에게 부를 별칭을 입력하세요</Text>
          <TextInput
            style={nmStyles.input}
            value={value}
            onChangeText={setValue}
            placeholder="예: 엄마, 할머니"
            placeholderTextColor="#9ca3af"
            autoFocus
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={() => onConfirm(value)}
          />
          <View style={nmStyles.btns}>
            <TouchableOpacity style={nmStyles.cancelBtn} onPress={onClose}>
              <Text style={nmStyles.cancelTxt}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={nmStyles.confirmBtn} onPress={() => onConfirm(value)}>
              <Text style={nmStyles.confirmTxt}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const nmStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28 },
  title:      { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sub:        { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#111827',
    backgroundColor: '#f9fafb', marginBottom: 16,
  },
  btns:       { flexDirection: 'row', gap: 10 },
  cancelBtn:  { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelTxt:  { color: '#374151', fontWeight: '600' },
  confirmBtn: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontWeight: '700' },
});

// ── 초대 모달 ──────────────────────────────────────────────────────────────────

interface InviteModalProps {
  visible: boolean;
  code: string | null;
  onClose: () => void;
}

function InviteModal({ visible, code, onClose }: InviteModalProps) {
  function handleShare() {
    if (!code) return;
    const url = `pillarm://join/${code}`;
    Share.share({
      message: `필람 앱에서 보호 그룹 초대를 수락하세요 (24시간 유효)\n\n${url}`,
      url,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View testID="modal-invite" style={styles.modal}>
          <Text style={styles.modalTitle}>보호자 초대</Text>
          <Text style={styles.modalSub}>아래 코드를 보호자에게 전달하세요</Text>

          {/* 6자리 코드 */}
          <View style={styles.codeRow}>
            {(code ?? '------').split('').map((ch, i) => (
              <View key={i} style={styles.codeBox}>
                <Text style={styles.codeChar}>{ch}</Text>
              </View>
            ))}
          </View>

          {/* QR 코드 */}
          {code && (
            <View style={styles.qrWrap} testID="qr-code">
              <QRCode value={`pillarm://join/${code}`} size={160} backgroundColor="#fff" color="#111827" />
            </View>
          )}

          <Text style={styles.expireNote}>⏰ 24시간 후 만료</Text>

          <View style={styles.modalBtns}>
            <TouchableOpacity testID="btn-share-code" style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareBtnText}>공유하기</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="btn-close-invite" style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────────────────

export default function CareCircleScreen() {
  const navigation = useNavigation<Nav>();
  const { userId } = useAuthStore();

  const [circles,        setCircles]        = useState<ApiCareCircle[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [inviteCode,     setInviteCode]     = useState<string | null>(null);
  const [inviteVisible,  setInviteVisible]  = useState(false);
  const [inviteLoading,  setInviteLoading]  = useState(false);
  const [newName,        setNewName]        = useState('');
  const [creating,       setCreating]       = useState(false);

  // 별칭 편집 모달
  const [nicknameTarget, setNicknameTarget] = useState<{ circleId: string; member: ApiCareMember } | null>(null);

  const loadCircles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listCircles();
      setCircles(data);
    } catch {
      Alert.alert('오류', '보호 그룹 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const data = await listCircles();
      setCircles(data);
    } catch {
      Alert.alert('오류', '보호 그룹 목록을 불러오지 못했습니다');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { loadCircles(); }, [loadCircles]);

  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── 그룹 생성 ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      Alert.alert('그룹 이름 필요', '그룹 이름을 입력해주세요');
      return;
    }
    setCreating(true);
    try {
      await createCircle(name);
      setNewName('');
      setShowCreateForm(false);
      await loadCircles();
    } catch {
      Alert.alert('오류', '보호 그룹 생성에 실패했습니다');
    } finally {
      setCreating(false);
    }
  }

  // ── 초대 코드 생성 ─────────────────────────────────────────────────────────

  async function handleInvite(circleId: string) {
    setInviteLoading(true);
    try {
      const { code } = await createInvite(circleId);
      setInviteCode(code);
      setInviteVisible(true);
    } catch {
      Alert.alert('오류', '초대 코드 생성에 실패했습니다');
    } finally {
      setInviteLoading(false);
    }
  }

  // ── 멤버 삭제 ──────────────────────────────────────────────────────────────

  function handleDeleteMember(circleId: string, member: ApiCareMember) {
    const label = memberDisplayName(member);
    Alert.alert(
      '보호자 삭제',
      `"${label}"을(를) 보호 그룹에서 삭제하시겠어요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            try {
              await deleteMember(circleId, member.id);
              await loadCircles();
            } catch {
              Alert.alert('오류', '보호자 삭제에 실패했습니다');
            }
          },
        },
      ],
    );
  }

  // ── 별칭 저장 ──────────────────────────────────────────────────────────────

  async function handleSaveNickname(nickname: string) {
    if (!nicknameTarget) return;
    try {
      await updateMemberNickname(nicknameTarget.circleId, nicknameTarget.member.id, nickname);
      await loadCircles();
    } catch {
      Alert.alert('오류', '별칭 저장에 실패했습니다');
    } finally {
      setNicknameTarget(null);
    }
  }

  // ── 그룹 삭제 (AC3: 공유 즉시 해제) ───────────────────────────────────────

  function handleDelete(circle: ApiCareCircle) {
    Alert.alert(
      '보호 그룹 해제',
      `"${circle.name}"을 삭제하면 보호자의 접근이 즉시 차단됩니다. 계속하시겠어요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제', style: 'destructive',
          onPress: async () => {
            try {
              await deleteCircle(circle.id);
              await loadCircles();
            } catch {
              Alert.alert('오류', '보호 그룹 삭제에 실패했습니다');
            }
          },
        },
      ],
    );
  }

  // ── 렌더: 소유 그룹 카드 ──────────────────────────────────────────────────

  function renderOwnedCircle(circle: ApiCareCircle) {
    const guardians = circle.members.filter((m) => m.memberUserId !== userId);
    return (
      <View testID={`card-circle-${circle.id}`} style={styles.circleCard}>
        <View style={styles.circleHeader}>
          <Text style={styles.circleName}>{circle.name}</Text>
          <Text style={styles.memberCount}>보호자 {guardians.length}명</Text>
        </View>

        {/* 보호자 목록 */}
        {guardians.length > 0 ? (
          guardians.map((m) => renderMemberRow(m, circle.id))
        ) : (
          <Text style={styles.emptyMembers}>연결된 보호자가 없습니다</Text>
        )}

        <View style={styles.circleActions}>
          <TouchableOpacity
            testID={`btn-invite-${circle.id}`}
            style={styles.inviteBtn}
            onPress={() => handleInvite(circle.id)}
            disabled={inviteLoading}
            accessibilityLabel="보호자 초대하기"
            accessibilityRole="button"
          >
            {inviteLoading
              ? <ActivityIndicator size="small" color="#3b82f6" />
              : <Text style={styles.inviteBtnText}>+ 초대하기</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            testID={`btn-delete-${circle.id}`}
            style={styles.deleteBtn}
            onPress={() => handleDelete(circle)}
            accessibilityLabel="보호 그룹 해제"
            accessibilityRole="button"
          >
            <Text style={styles.deleteBtnText}>그룹 해제</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── 렌더: 멤버 행 ──────────────────────────────────────────────────────────

  function renderMemberRow(member: ApiCareMember, circleId: string) {
    const display = memberDisplayName(member);
    const hasNickname = !!member.nickname;
    const realName = member.memberUserName ?? member.memberUserEmail ?? '';
    return (
      <View key={member.id} testID={`member-${member.id}`} style={styles.memberRow}>
        <View style={styles.memberIcon}>
          <Text style={styles.memberIconText}>👤</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberId} numberOfLines={1}>{display}</Text>
          {hasNickname && realName ? (
            <Text style={styles.memberRealName} numberOfLines={1}>{realName}</Text>
          ) : null}
          <Text style={styles.memberRole}>{ROLE_LABEL[member.role] ?? member.role}</Text>
        </View>
        <View style={styles.memberActions}>
          <TouchableOpacity
            testID={`btn-nickname-${member.id}`}
            style={styles.memberActionBtn}
            onPress={() => setNicknameTarget({ circleId, member })}
            accessibilityLabel="별칭 수정"
          >
            <Text style={styles.memberActionTxt}>별칭</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`btn-remove-${member.id}`}
            style={[styles.memberActionBtn, styles.memberActionDanger]}
            onPress={() => handleDeleteMember(circleId, member)}
            accessibilityLabel="보호자 삭제"
          >
            <Text style={[styles.memberActionTxt, styles.memberActionDangerTxt]}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── 렌더: 참여 그룹 카드 (보호자 뷰) ─────────────────────────────────────

  function renderMemberCircle(circle: ApiCareCircle) {
    return (
      <View testID={`card-joined-${circle.id}`} style={styles.circleCard}>
        <View style={styles.circleHeader}>
          <Text style={styles.circleName}>{circle.name}</Text>
          <Text style={styles.memberCount}>내가 보호자</Text>
        </View>

        <TouchableOpacity
          testID={`btn-monitor-${circle.id}`}
          style={styles.monitorBtn}
          onPress={() =>
            navigation.navigate('CareMonitor', {
              circleId:    circle.id,
              patientId:   circle.ownerUserId,
              patientName: circle.ownerUserName ?? circle.ownerUserEmail ?? undefined,
            })
          }
          accessibilityLabel="오늘 복용 현황 보기"
          accessibilityRole="button"
        >
          <Text style={styles.monitorBtnText}>오늘 복용 현황 보기 →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 분류 ───────────────────────────────────────────────────────────────────

  const ownedCircles  = circles.filter((c) => c.ownerUserId === userId);
  const joinedCircles = circles.filter((c) => c.ownerUserId !== userId);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="screen-care-circle"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3b82f6" colors={['#3b82f6']} />
      }
    >
      {/* ── 나의 보호 그룹 (환자 뷰) ──── */}
      <Text style={styles.sectionTitle}>나의 보호 그룹</Text>

      {ownedCircles.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>아직 보호 그룹이 없어요</Text>
          <Text style={styles.emptySub}>그룹을 만들어 보호자를 초대하세요</Text>
        </View>
      )}

      {ownedCircles.map((c) => (
        <View key={c.id}>{renderOwnedCircle(c)}</View>
      ))}

      {/* ── 그룹 만들기 ── */}
      {showCreateForm ? (
        <View style={styles.createFormCard}>
          <Text style={styles.createFormTitle}>새 보호 그룹</Text>
          <TextInput
            testID="input-circle-name"
            style={styles.createInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="그룹 이름을 입력하세요 *"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            autoFocus
            onSubmitEditing={handleCreate}
          />
          <View style={styles.createFormBtns}>
            <TouchableOpacity
              style={[styles.createBtn, (creating || !newName.trim()) && styles.btnDisabled]}
              onPress={handleCreate}
              testID="btn-create-circle"
              disabled={creating || !newName.trim()}
              accessibilityLabel="보호 그룹 만들기"
              accessibilityRole="button"
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>만들기</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelCreateBtn}
              onPress={() => { setShowCreateForm(false); setNewName(''); }}
              disabled={creating}
            >
              <Text style={styles.cancelCreateBtnText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          testID="btn-show-create-form"
          style={styles.addGroupBtn}
          onPress={() => setShowCreateForm(true)}
          accessibilityRole="button"
        >
          <Text style={styles.addGroupBtnText}>+ 새 보호 그룹 만들기</Text>
        </TouchableOpacity>
      )}

      {/* ── 참여 중인 그룹 (보호자 뷰) ─ */}
      {joinedCircles.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>내가 보호 중인 그룹</Text>
          {joinedCircles.map((c) => (
            <View key={c.id}>{renderMemberCircle(c)}</View>
          ))}
        </>
      )}

      <InviteModal
        visible={inviteVisible}
        code={inviteCode}
        onClose={() => { setInviteVisible(false); setInviteCode(null); }}
      />

      <NicknameModal
        visible={!!nicknameTarget}
        currentNickname={nicknameTarget?.member.nickname ?? ''}
        displayName={nicknameTarget ? memberDisplayName(nicknameTarget.member) : ''}
        onConfirm={handleSaveNickname}
        onClose={() => setNicknameTarget(null)}
      />
    </ScrollView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content:   { padding: 16, paddingBottom: 40 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8,
  },

  circleCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  circleHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  circleName:  { fontSize: 17, fontWeight: '700', color: '#111827' },
  memberCount: { fontSize: 13, color: '#6b7280' },

  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  memberIcon:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  memberIconText: { fontSize: 18 },
  memberInfo:     { flex: 1 },
  memberId:       { fontSize: 14, color: '#374151', fontWeight: '500' },
  memberRealName: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  memberRole:     { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  memberActions:  { flexDirection: 'row', gap: 6, marginLeft: 8 },
  memberActionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  memberActionDanger: { backgroundColor: '#fef2f2' },
  memberActionTxt:    { fontSize: 12, fontWeight: '600', color: '#374151' },
  memberActionDangerTxt: { color: '#ef4444' },

  emptyMembers: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },

  circleActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  inviteBtn:     { flex: 1, backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  inviteBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  deleteBtn:     { paddingHorizontal: 16, borderRadius: 10, paddingVertical: 12, backgroundColor: '#fef2f2', alignItems: 'center' },
  deleteBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

  monitorBtn:     { backgroundColor: '#eff6ff', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  monitorBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 14 },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#f3f4f6', alignItems: 'center', marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  emptySub:   { fontSize: 13, color: '#9ca3af', marginTop: 4 },

  addGroupBtn: {
    borderWidth: 1.5, borderColor: '#3b82f6', borderStyle: 'dashed',
    borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12,
  },
  addGroupBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 15 },

  createFormCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#3b82f6', marginBottom: 12,
  },
  createFormTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  createInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827',
    backgroundColor: '#f9fafb',
  },
  createFormBtns:    { flexDirection: 'row', gap: 8, marginTop: 12 },
  createBtn:         { flex: 1, backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:       { opacity: 0.5 },
  createBtnText:     { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelCreateBtn:   { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelCreateBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },

  // Invite modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalSub:   { fontSize: 14, color: '#6b7280', marginTop: 6, marginBottom: 20 },

  codeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  codeBox: {
    width: 44, height: 52, borderRadius: 10,
    backgroundColor: '#eff6ff', borderWidth: 2, borderColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
  },
  codeChar: { fontSize: 22, fontWeight: '800', color: '#1d4ed8', letterSpacing: 1 },

  qrWrap:     { padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, elevation: 2 },
  qrFallback: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginBottom: 12 },
  expireNote: { fontSize: 13, color: '#9ca3af', marginBottom: 20 },

  modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  shareBtn:  { flex: 1, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtn:     { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { color: '#374151', fontWeight: '600', fontSize: 15 },
});
