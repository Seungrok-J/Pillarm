import React, { useCallback, useEffect, useRef, useState, Fragment } from 'react';
import { View, TouchableOpacity, Modal, ActivityIndicator, StyleSheet, ScrollView, Share, RefreshControl } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../store/authStore';
import { useNetworkStore } from '../../store/networkStore';
import QRCode from 'react-native-qrcode-svg';
import {
  listCircles, createCircle, deleteCircle, createInvite,
  deleteMember, updateMemberNickname, leaveCircle,
  type ApiCareCircle, type ApiCareMember,
} from './careCircleApi';
import AlertModal, { type AlertModalTone } from '../../components/AlertModal';
import OfflineBanner from '../../components/OfflineBanner';

const JOIN_WEB_URL = 'https://pillarm.app/join';

type Nav = StackNavigationProp<RootStackParamList>;

const ROLE_LABEL: Record<string, string> = {
  admin:      '피보호자',
  viewer:     '피보호자',
  notifyOnly: '피보호자',
};

// ── 멤버 표시 이름 헬퍼 ────────────────────────────────────────────────────────

function memberDisplayName(m: ApiCareMember): string {
  if (m.nickname) return m.nickname;
  if (m.memberUserName) return m.memberUserName;
  if (m.memberUserEmail) return m.memberUserEmail;
  return m.memberUserId.slice(0, 8);
}

// ── 초대 모달 ──────────────────────────────────────────────────────────────────

interface InviteModalProps {
  visible: boolean;
  code: string | null;
  onClose: () => void;
}

function InviteModal({ visible, code, onClose }: InviteModalProps) {
  function handleShare() {
    if (!code) return;
    const url = `${JOIN_WEB_URL}?code=${code}`;
    Share.share({
      message: `필람 보호 그룹 초대입니다. 아래 링크를 눌러 참여해주세요 (24시간 유효)\n\n${url}`,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View testID="modal-invite" style={styles.modal}>
          <Text style={styles.modalTitle}>피보호자 초대</Text>
          <Text style={styles.modalSub}>아래 코드를 피보호자에게 전달하세요</Text>

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
              <QRCode value={`${JOIN_WEB_URL}?code=${code}`} size={160} backgroundColor="#fff" color="#111827" />
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
  const isOnline = useNetworkStore((s) => s.isOnline);

  const [circles,        setCircles]        = useState<ApiCareCircle[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [inviteCode,     setInviteCode]     = useState<string | null>(null);
  const [inviteVisible,  setInviteVisible]  = useState(false);
  // 초대 코드 생성 중인 그룹 id — 해당 그룹의 버튼만 로딩 상태로 표시한다
  const [invitingCircleId, setInvitingCircleId] = useState<string | null>(null);
  const [newName,        setNewName]        = useState('');
  const [creating,       setCreating]       = useState(false);

  // 인라인 별칭 편집
  const [editingNickname, setEditingNickname] = useState<{ circleId: string; memberId: string; value: string } | null>(null);

  const [simpleAlert, setSimpleAlert] = useState<{ title: string; message?: string; tone?: AlertModalTone } | null>(null);
  const [deleteMemberConfirm, setDeleteMemberConfirm] = useState<{ circleId: string; member: ApiCareMember } | null>(null);
  const [deleteCircleConfirm, setDeleteCircleConfirm] = useState<ApiCareCircle | null>(null);
  const [leaveCircleConfirm, setLeaveCircleConfirm] = useState<ApiCareCircle | null>(null);

  // 오프라인이면 오류 모달 대신 배너로 알린다 — 연결이 없다는 건 이미 배너가 말하고
  // 있고, 사용자가 지금 할 수 있는 일도 없다. 모달은 닫아야만 화면을 볼 수 있어 더 나쁘다.
  const reportLoadFailure = useCallback(() => {
    if (!useNetworkStore.getState().isOnline) return;
    setSimpleAlert({ title: '오류', message: '보호 그룹 목록을 불러오지 못했습니다', tone: 'danger' });
  }, []);

  const loadCircles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listCircles();
      setCircles(data);
    } catch {
      reportLoadFailure();
    } finally {
      setLoading(false);
    }
  }, [reportLoadFailure]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const data = await listCircles();
      setCircles(data);
    } catch {
      reportLoadFailure();
    } finally {
      setRefreshing(false);
    }
  }

  // 탭을 다시 선택할 때마다 재조회 — 화면은 언마운트되지 않으므로 useEffect(마운트 1회)로는 갱신 안 됨
  useFocusEffect(
    useCallback(() => {
      loadCircles();
    }, [loadCircles]),
  );

  // 재연결되면 자동으로 다시 불러온다 — 사용자가 탭을 나갔다 들어올 필요가 없다
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) loadCircles();
    wasOnlineRef.current = isOnline;
  }, [isOnline, loadCircles]);

  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── 그룹 생성 ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setSimpleAlert({ title: '그룹 이름 필요', message: '그룹 이름을 입력해주세요', tone: 'warning' });
      return;
    }
    setCreating(true);
    try {
      await createCircle(name);
      setNewName('');
      setShowCreateForm(false);
      await loadCircles();
    } catch {
      setSimpleAlert({ title: '오류', message: '보호 그룹 생성에 실패했습니다', tone: 'danger' });
    } finally {
      setCreating(false);
    }
  }

  // ── 초대 코드 생성 ─────────────────────────────────────────────────────────

  async function handleInvite(circleId: string) {
    setInvitingCircleId(circleId);
    try {
      const { code } = await createInvite(circleId);
      setInviteCode(code);
      setInviteVisible(true);
    } catch {
      setSimpleAlert({ title: '오류', message: '초대 코드 생성에 실패했습니다', tone: 'danger' });
    } finally {
      setInvitingCircleId(null);
    }
  }

  // ── 멤버 삭제 ──────────────────────────────────────────────────────────────

  function handleDeleteMember(circleId: string, member: ApiCareMember) {
    setDeleteMemberConfirm({ circleId, member });
  }

  async function performDeleteMember() {
    if (!deleteMemberConfirm) return;
    const { circleId, member } = deleteMemberConfirm;
    setDeleteMemberConfirm(null);
    try {
      await deleteMember(circleId, member.id);
      await loadCircles();
    } catch {
      setSimpleAlert({ title: '오류', message: '피보호자 삭제에 실패했습니다', tone: 'danger' });
    }
  }

  // ── 별칭 저장 ──────────────────────────────────────────────────────────────

  async function handleSaveNickname() {
    if (!editingNickname) return;
    try {
      await updateMemberNickname(editingNickname.circleId, editingNickname.memberId, editingNickname.value);
      await loadCircles();
    } catch {
      setSimpleAlert({ title: '오류', message: '별칭 저장에 실패했습니다', tone: 'danger' });
    } finally {
      setEditingNickname(null);
    }
  }

  // ── 그룹 삭제 (AC3: 공유 즉시 해제) ───────────────────────────────────────

  function handleDelete(circle: ApiCareCircle) {
    setDeleteCircleConfirm(circle);
  }

  async function performDeleteCircle() {
    if (!deleteCircleConfirm) return;
    const circle = deleteCircleConfirm;
    setDeleteCircleConfirm(null);
    try {
      await deleteCircle(circle.id);
      await loadCircles();
    } catch {
      setSimpleAlert({ title: '오류', message: '보호 그룹 삭제에 실패했습니다', tone: 'danger' });
    }
  }

  // ── 렌더: 소유 그룹 카드 ──────────────────────────────────────────────────

  function renderOwnedCircle(circle: ApiCareCircle) {
    const members = circle.members.filter((m) => m.memberUserId !== userId);
    return (
      <View testID={`card-circle-${circle.id}`} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titlePill}>
            <Text style={styles.cardTitle}>{circle.name}</Text>
            <View style={styles.badgeTeal}>
              <Text style={styles.badgeTealText}>진행중</Text>
            </View>
          </View>
          <Text style={styles.metaText}>피보호자 {members.length}명</Text>
        </View>

        <View style={styles.divider} />

        {/* 피보호자 목록 */}
        {members.length > 0 ? (
          members.map((m, i) => (
            <Fragment key={m.id}>
              {i > 0 && <View style={styles.divider} />}
              {renderMemberRow(m, circle.id)}
            </Fragment>
          ))
        ) : (
          <Text style={styles.emptyMembers}>연결된 피보호자가 없습니다</Text>
        )}

        <View style={styles.footerRow}>
          <TouchableOpacity
            testID={`btn-invite-${circle.id}`}
            style={styles.inviteBtn}
            onPress={() => handleInvite(circle.id)}
            disabled={invitingCircleId === circle.id}
            accessibilityLabel="피보호자 초대하기"
            accessibilityRole="button"
          >
            {invitingCircleId === circle.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.inviteBtnText}>피보호자 초대</Text>
              </>
            )}
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

  // ── 렌더: 멤버 행 (프로필 + 복용 현황 보기 버튼) ────────────────────────────

  function renderMemberRow(member: ApiCareMember, circleId: string) {
    const isEditing = editingNickname?.memberId === member.id;
    const display   = memberDisplayName(member);
    const hasNickname = !!member.nickname;
    const realName  = member.memberUserName ?? member.memberUserEmail ?? '';

    if (isEditing) {
      return (
        <View testID={`member-${member.id}`} style={styles.memberBlock}>
          <View style={styles.memberRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={20} color="#6b7280" />
            </View>
            <View style={styles.memberEditArea}>
              <TextInput
                testID={`input-nickname-${member.id}`}
                style={styles.nicknameInput}
                value={editingNickname!.value}
                onChangeText={(t) => setEditingNickname((prev) => prev && { ...prev, value: t })}
                placeholder="예: 엄마, 할머니"
                placeholderTextColor="#9ca3af"
                autoFocus
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={handleSaveNickname}
              />
              <View style={styles.nicknameEditBtns}>
                <TouchableOpacity
                  testID={`btn-nickname-save-${member.id}`}
                  style={styles.nicknameSaveBtn}
                  onPress={handleSaveNickname}
                >
                  <Text style={styles.nicknameSaveTxt}>저장</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nicknameCancelBtn}
                  onPress={() => setEditingNickname(null)}
                >
                  <Text style={styles.nicknameCancelTxt}>취소</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View testID={`member-${member.id}`} style={styles.memberBlock}>
        <View style={styles.memberRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color="#6b7280" />
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName} numberOfLines={1}>{display}</Text>
            {hasNickname && realName ? (
              <Text style={styles.memberRealName} numberOfLines={1}>{realName}</Text>
            ) : null}
            <Text style={styles.memberRole}>{ROLE_LABEL[member.role] ?? member.role}</Text>
          </View>
          <View style={styles.smallActions}>
            <TouchableOpacity
              testID={`btn-nickname-${member.id}`}
              style={styles.pillNeutral}
              onPress={() => setEditingNickname({ circleId, memberId: member.id, value: member.nickname ?? '' })}
              accessibilityLabel="별칭 수정"
            >
              <Text style={styles.pillNeutralText}>별칭</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`btn-remove-${member.id}`}
              style={styles.pillDanger}
              onPress={() => handleDeleteMember(circleId, member)}
              accessibilityLabel="피보호자 삭제"
            >
              <Text style={styles.pillDangerText}>삭제</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          testID={`btn-monitor-${member.id}`}
          style={styles.viewBtn}
          onPress={() => navigation.navigate('CareMonitor', {
            circleId,
            patientId: member.memberUserId,
            patientName: display,
          })}
          accessibilityLabel={`${display}님의 복용 현황 보기`}
          accessibilityRole="button"
        >
          <Ionicons name="stats-chart-outline" size={16} color="#2d8a81" />
          <Text style={styles.viewBtnText}>복용 현황 보기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 렌더: 참여 그룹 카드 (보호자 뷰) ─────────────────────────────────────

  function handleLeaveCircle(circle: ApiCareCircle) {
    setLeaveCircleConfirm(circle);
  }

  async function performLeaveCircle() {
    if (!leaveCircleConfirm) return;
    const circle = leaveCircleConfirm;
    setLeaveCircleConfirm(null);
    try {
      await leaveCircle(circle.id);
      await loadCircles();
    } catch (err: unknown) {
      console.error('[CareCircle] 그룹 나가기 실패:', err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        // 이미 그룹에서 제거된 상태 — 목록만 갱신
        await loadCircles();
      } else {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setSimpleAlert({ title: '오류', message: msg ?? '그룹 나가기에 실패했습니다', tone: 'danger' });
      }
    }
  }

  function renderMemberCircle(circle: ApiCareCircle) {
    const ownerName = circle.ownerUserName ?? circle.ownerUserEmail ?? '관리자';
    return (
      <View testID={`card-joined-${circle.id}`} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titlePill}>
            <Text style={styles.cardTitle}>{circle.name}</Text>
            <View style={styles.badgeGreen}>
              <Text style={styles.badgeGreenText}>보호중</Text>
            </View>
          </View>
          <Text style={styles.metaText}>보호자 1명</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.guardiansList}>
          <Text style={styles.guardiansLabel}>담당 보호자</Text>
          <View style={styles.guardianRow}>
            <View style={styles.guardianAvatar}>
              <Ionicons name="person" size={18} color="#4b5f5a" />
            </View>
            <View>
              <Text style={styles.guardianName} numberOfLines={1}>{ownerName}</Text>
              <Text style={styles.guardianRole}>주 보호자</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          testID={`btn-leave-${circle.id}`}
          style={styles.leaveBtn}
          onPress={() => handleLeaveCircle(circle)}
          accessibilityLabel="그룹 나가기"
          accessibilityRole="button"
        >
          <Text style={styles.leaveBtnText}>그룹 나가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 분류 ───────────────────────────────────────────────────────────────────

  const ownedCircles  = circles.filter((c) => c.ownerUserId === userId);
  const joinedCircles = circles.filter((c) => c.ownerUserId !== userId);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>보호자 관리 👥</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2d8a81" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>보호자 관리 👥</Text>
        <TouchableOpacity
          testID="btn-quick-create"
          style={styles.headerAddBtn}
          onPress={() => setShowCreateForm(true)}
          accessibilityLabel="새 보호 그룹 만들기"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color="#2d8a81" />
        </TouchableOpacity>
      </View>

    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="screen-care-circle"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2d8a81" colors={['#2d8a81']} />
      }
    >
      {/* ── 오프라인 배너 ── */}
      <OfflineBanner inline message="오프라인 상태입니다 — 보호 그룹 기능은 인터넷 연결이 필요합니다. 연결되면 자동으로 다시 불러옵니다." />

      {/* ── 내가 관리하는 그룹 (보호자 뷰) ──── */}
      <Text style={styles.sectionTitle}>내가 관리하는 그룹</Text>

      {ownedCircles.length === 0 && (
        <View style={styles.plainEmptyCard}>
          <Text style={styles.plainEmptyTitle}>아직 보호 그룹이 없어요</Text>
          <Text style={styles.plainEmptySub}>그룹을 만들고 피보호자를 초대하세요</Text>
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
          <Ionicons name="add-circle-outline" size={18} color="#2d8a81" />
          <Text style={styles.addGroupBtnText}>새 보호 그룹 만들기</Text>
        </TouchableOpacity>
      )}

      {/* ── 참여 중인 그룹 (피보호자 뷰) ─ */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>내가 속한 그룹 (피보호자)</Text>

      {joinedCircles.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="people-outline" size={28} color="#8b95a1" />
          </View>
          <View style={styles.emptyTextWrap}>
            <Text style={styles.emptyStateTitle}>아직 참여한 그룹이 없어요</Text>
            <Text style={styles.emptyStateSub}>보호자에게 받은 코드나 QR로 그룹에 참여해보세요</Text>
          </View>
          <TouchableOpacity
            testID="btn-join-circle"
            style={styles.joinCtaBtn}
            onPress={() => navigation.navigate('JoinCareCircle')}
            accessibilityLabel="코드로 보호 그룹 참여하기"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.joinCtaBtnText}>코드로 그룹 참여하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {joinedCircles.map((c) => (
            <View key={c.id}>{renderMemberCircle(c)}</View>
          ))}
          <TouchableOpacity
            testID="btn-join-circle"
            style={styles.addGroupBtn}
            onPress={() => navigation.navigate('JoinCareCircle')}
            accessibilityLabel="코드로 보호 그룹 참여하기"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={18} color="#2d8a81" />
            <Text style={styles.addGroupBtnText}>코드로 그룹 참여하기</Text>
          </TouchableOpacity>
        </>
      )}

      <InviteModal
        visible={inviteVisible}
        code={inviteCode}
        onClose={() => { setInviteVisible(false); setInviteCode(null); }}
      />

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
        visible={deleteMemberConfirm !== null}
        icon="person-remove"
        tone="danger"
        title="피보호자 삭제"
        message={deleteMemberConfirm ? `"${memberDisplayName(deleteMemberConfirm.member)}"을(를) 보호 그룹에서 삭제하시겠어요?` : undefined}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeleteMemberConfirm(null) },
          { text: '삭제', style: 'destructive', onPress: performDeleteMember },
        ]}
        onRequestClose={() => setDeleteMemberConfirm(null)}
      />

      <AlertModal
        visible={deleteCircleConfirm !== null}
        icon="trash"
        tone="danger"
        title="보호 그룹 해제"
        message={deleteCircleConfirm ? `"${deleteCircleConfirm.name}"을 삭제하면 보호자의 접근이 즉시 차단됩니다. 계속하시겠어요?` : undefined}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeleteCircleConfirm(null) },
          { text: '해제', style: 'destructive', onPress: performDeleteCircle },
        ]}
        onRequestClose={() => setDeleteCircleConfirm(null)}
      />

      <AlertModal
        visible={leaveCircleConfirm !== null}
        icon="exit"
        tone="warning"
        title="그룹 나가기"
        message={leaveCircleConfirm ? `"${leaveCircleConfirm.name}"에서 나가시겠어요? 이후 복용 현황을 볼 수 없게 됩니다.` : undefined}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setLeaveCircleConfirm(null) },
          { text: '나가기', style: 'destructive', onPress: performLeaveCircle },
        ]}
        onRequestClose={() => setLeaveCircleConfirm(null)}
      />
    </ScrollView>
    </SafeAreaView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const CARD_SHADOW = {
  shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1,
};

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: '#f5f7f6' },
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  content:   { padding: 20, paddingBottom: 40 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 56, paddingHorizontal: 20,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8eceb',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#191f28' },
  headerAddBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#ebf5f3', alignItems: 'center', justifyContent: 'center',
  },

  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: '#4e5968',
    marginBottom: 12,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e8eceb',
    gap: 16,
    ...CARD_SHADOW,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  titlePill: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#191f28' },
  metaText:  { fontSize: 13, fontWeight: '600', color: '#8b95a1' },

  badgeTeal:     { backgroundColor: '#ebf5f3', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTealText: { fontSize: 11, fontWeight: '700', color: '#2d8a81' },
  badgeGreen:     { backgroundColor: '#ebf7f1', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  badgeGreenText: { fontSize: 11, fontWeight: '700', color: '#42a873' },

  divider: { height: 1, backgroundColor: '#e8eceb' },

  memberBlock: { gap: 16 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#e1e6e8',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  memberInfo:     { flex: 1, gap: 2 },
  memberName:     { fontSize: 15, fontWeight: '700', color: '#191f28' },
  memberRealName: { fontSize: 12, fontWeight: '600', color: '#8b95a1' },
  memberRole:     { fontSize: 12, fontWeight: '600', color: '#8b95a1' },
  smallActions:   { flexDirection: 'row', gap: 6, marginLeft: 8 },

  pillNeutral:     { backgroundColor: '#ebf5f3', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6 },
  pillNeutralText: { fontSize: 12, fontWeight: '700', color: '#2d8a81' },
  pillDanger:      { backgroundColor: '#fdebec', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6 },
  pillDangerText:  { fontSize: 12, fontWeight: '700', color: '#e84a5f' },

  memberEditArea:   { flex: 1 },
  nicknameInput: {
    borderWidth: 1, borderColor: '#2d8a81', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#191f28',
    backgroundColor: '#f5f7f6',
  },
  nicknameEditBtns:  { flexDirection: 'row', gap: 6, marginTop: 6 },
  nicknameSaveBtn:   { flex: 1, backgroundColor: '#2d8a81', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  nicknameSaveTxt:   { fontSize: 12, fontWeight: '700', color: '#fff' },
  nicknameCancelBtn: { flex: 1, backgroundColor: '#ebeef0', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  nicknameCancelTxt: { fontSize: 12, fontWeight: '600', color: '#4e5968' },

  emptyMembers: { fontSize: 14, color: '#8b95a1', textAlign: 'center', paddingVertical: 8 },

  viewBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ebf5f3', borderRadius: 12, paddingVertical: 12,
  },
  viewBtnText: { color: '#2d8a81', fontWeight: '700', fontSize: 14 },

  footerRow: { flexDirection: 'row', gap: 8 },
  inviteBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2d8a81', borderRadius: 12, paddingVertical: 12,
  },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  deleteBtn: {
    paddingHorizontal: 16, borderRadius: 12, paddingVertical: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e84a5f', alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { color: '#e84a5f', fontWeight: '700', fontSize: 14 },

  guardiansList:  { gap: 12 },
  guardiansLabel: { fontSize: 12, fontWeight: '600', color: '#8b95a1' },
  guardianRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guardianAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#d2e3e1',
    alignItems: 'center', justifyContent: 'center',
  },
  guardianName: { fontSize: 14, fontWeight: '700', color: '#191f28' },
  guardianRole: { fontSize: 11, fontWeight: '600', color: '#8b95a1', marginTop: 1 },

  leaveBtn: {
    borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e84a5f',
  },
  leaveBtnText: { color: '#e84a5f', fontWeight: '700', fontSize: 14 },

  plainEmptyCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: '#e8eceb', alignItems: 'center', marginBottom: 12,
  },
  plainEmptyTitle: { fontSize: 15, fontWeight: '700', color: '#191f28' },
  plainEmptySub:   { fontSize: 13, color: '#8b95a1', marginTop: 4 },

  emptyStateCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#e8eceb', alignItems: 'center', gap: 16, marginBottom: 12,
    ...CARD_SHADOW,
  },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#f2f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTextWrap:   { alignItems: 'center', gap: 6 },
  emptyStateTitle: { fontSize: 15, fontWeight: '700', color: '#191f28', textAlign: 'center' },
  emptyStateSub:   { fontSize: 13, fontWeight: '500', color: '#8b95a1', textAlign: 'center' },

  joinCtaBtn: {
    width: '100%', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2d8a81', borderRadius: 12, paddingVertical: 13,
  },
  joinCtaBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  addGroupBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#2d8a81', borderStyle: 'dashed',
    borderRadius: 16, paddingVertical: 16, marginBottom: 12, backgroundColor: '#fff',
  },
  addGroupBtnText: { color: '#2d8a81', fontWeight: '700', fontSize: 14 },

  createFormCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: '#2d8a81', marginBottom: 12,
  },
  createFormTitle: { fontSize: 15, fontWeight: '700', color: '#191f28', marginBottom: 12 },
  createInput: {
    borderWidth: 1, borderColor: '#e8eceb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#191f28',
    backgroundColor: '#f5f7f6',
  },
  createFormBtns:    { flexDirection: 'row', gap: 8, marginTop: 12 },
  createBtn:         { flex: 1, backgroundColor: '#2d8a81', borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:       { opacity: 0.5 },
  createBtnText:     { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelCreateBtn:   { flex: 1, backgroundColor: '#ebeef0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelCreateBtnText: { color: '#4e5968', fontWeight: '600', fontSize: 14 },

  // Invite modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#191f28' },
  modalSub:   { fontSize: 14, color: '#8b95a1', marginTop: 6, marginBottom: 20 },

  codeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  codeBox: {
    width: 44, height: 52, borderRadius: 10,
    backgroundColor: '#ebf5f3', borderWidth: 2, borderColor: '#2d8a81',
    alignItems: 'center', justifyContent: 'center',
  },
  codeChar: { fontSize: 22, fontWeight: '800', color: '#2d8a81', letterSpacing: 1 },

  qrWrap:     { padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, elevation: 2 },
  qrFallback: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginBottom: 12 },
  expireNote: { fontSize: 13, color: '#8b95a1', marginBottom: 20 },

  modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  shareBtn:  { flex: 1, backgroundColor: '#2d8a81', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtn:     { flex: 1, backgroundColor: '#ebeef0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { color: '#4e5968', fontWeight: '600', fontSize: 15 },
});
