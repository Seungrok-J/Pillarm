import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Modal,
  ActivityIndicator, Alert, StyleSheet, Switch,
  ScrollView, TextInput, Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../store/authStore';
import {
  listCircles, createCircle, deleteCircle, createInvite,
  type ApiCareCircle, type ApiCareMember,
} from './careCircleApi';

// react-native-qrcode-svg 미설치 시 graceful fallback
let QRCode: React.ComponentType<{ value: string; size: number; backgroundColor: string; color: string }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  QRCode = require('react-native-qrcode-svg').default;
} catch { /* not installed */ }

type Nav = StackNavigationProp<RootStackParamList>;

const ROLE_LABEL: Record<string, string> = {
  admin:      '관리자',
  viewer:     '열람자',
  notifyOnly: '알림 전용',
};

// ── 초대 모달 ──────────────────────────────────────────────────────────────────

interface InviteModalProps {
  visible: boolean;
  code: string | null;
  onClose: () => void;
}

function InviteModal({ visible, code, onClose }: InviteModalProps) {
  function handleShare() {
    if (!code) return;
    Share.share({ message: `필람 보호 그룹 초대 코드: ${code} (24시간 유효)` });
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
          {code && QRCode ? (
            <View style={styles.qrWrap} testID="qr-code">
              <QRCode value={code} size={160} backgroundColor="#fff" color="#111827" />
            </View>
          ) : code ? (
            <Text style={styles.qrFallback}>QR 표시를 위해 react-native-qrcode-svg를 설치하세요</Text>
          ) : null}

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

  const [circles,      setCircles]      = useState<ApiCareCircle[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [inviteCode,   setInviteCode]   = useState<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [newName,      setNewName]      = useState('');
  const [creating,     setCreating]     = useState(false);

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

  useEffect(() => { loadCircles(); }, [loadCircles]);

  // ── 그룹 생성 ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    const name = newName.trim() || '나의 보호 그룹';
    setCreating(true);
    try {
      await createCircle(name);
      setNewName('');
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
          guardians.map((m) => renderMemberRow(m))
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

  function renderMemberRow(member: ApiCareMember) {
    return (
      <View key={member.id} testID={`member-${member.id}`} style={styles.memberRow}>
        <View style={styles.memberIcon}>
          <Text style={styles.memberIconText}>👤</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberId} numberOfLines={1}>{member.memberUserId}</Text>
          <Text style={styles.memberRole}>{ROLE_LABEL[member.role] ?? member.role}</Text>
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
              circleId:  circle.id,
              patientId: circle.ownerUserId,
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="screen-care-circle">
      {/* ── 나의 보호 그룹 (환자 뷰) ──── */}
      <Text style={styles.sectionTitle}>나의 보호 그룹</Text>

      {ownedCircles.length > 0 ? (
        ownedCircles.map((c) => (
          <View key={c.id}>{renderOwnedCircle(c)}</View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>아직 보호 그룹이 없어요</Text>
          <Text style={styles.emptySub}>그룹을 만들어 보호자를 초대하세요</Text>

          <View style={styles.createRow}>
            <TextInput
              testID="input-circle-name"
              style={styles.createInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="그룹 이름 (예: 우리 가족)"
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <TouchableOpacity
              testID="btn-create-circle"
              style={[styles.createBtn, creating && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={creating}
              accessibilityLabel="보호 그룹 만들기"
              accessibilityRole="button"
            >
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.createBtnText}>만들기</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
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
  memberRole:     { fontSize: 12, color: '#9ca3af', marginTop: 1 },

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
  emptySub:   { fontSize: 13, color: '#9ca3af', marginTop: 4, marginBottom: 16 },

  createRow:   { flexDirection: 'row', gap: 8, width: '100%' },
  createInput: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827',
  },
  createBtn:     { backgroundColor: '#3b82f6', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:   { opacity: 0.5 },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

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
