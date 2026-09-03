import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, Animated, PanResponder, StyleSheet, Modal, Image, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from './AppText';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { DoseEvent, WithFood } from '../domain';
import { useThemeStore } from '../store/themeStore';
import { useFontScale } from '../utils/fontScale';
import {
  DOSE_EARLY_WINDOW_MS,
  DoseDisplayState,
  computeDisplayState,
} from '../utils/doseDisplay';
import AlertModal from './AlertModal';

// ── 상수 & 헬퍼 ──────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 72;
/** 로컬 alias — 공유 유틸에서 import */
type DisplayState = DoseDisplayState;

/**
 * 왼쪽 시간 컬럼의 기준 폭(배율 1.0).
 * "09:00"(14pt bold)과 "복용 예정"(10pt)이 들어가야 한다 — 예전 값 46 은 둘 다 잘렸다.
 */
const LEFT_TIME_WIDTH = 56;

const STATE_META: Record<DisplayState, { label: string; labelColor: string; timeColor: string; dotColor: string }> = {
  waiting: { label: '복용 예정', labelColor: '#8b95a1', timeColor: '#8b95a1', dotColor: '#8b95a1' },
  active:  { label: '복용 가능', labelColor: '#3182f6', timeColor: '#191f28', dotColor: '#3182f6' },
  late:    { label: '복용 지연', labelColor: '#ff7675', timeColor: '#191f28', dotColor: '#ff7675' },
  taken:   { label: '복용 완료', labelColor: '#00b894', timeColor: '#8b95a1', dotColor: '#00b894' },
  missed:  { label: '복용 누락', labelColor: '#ff7675', timeColor: '#8b95a1', dotColor: '#ff7675' },
  skipped: { label: '건너뜀',    labelColor: '#8b95a1', timeColor: '#8b95a1', dotColor: '#8b95a1' },
};

function fmtHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 복용 가능 창의 시작·종료 시각(HH:MM)을 반환한다. */
function windowHint(plannedAt: string, graceMinutes: number): { start: string; end: string } {
  const plannedMs = new Date(plannedAt).getTime();
  return {
    start: fmtHHMM(plannedMs - DOSE_EARLY_WINDOW_MS),
    end:   fmtHHMM(plannedMs + graceMinutes * 60_000),
  };
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export interface DoseCardProps {
  event: DoseEvent;
  medicationName: string;
  medicationColor?: string;
  /** 이 일정의 식전/식후 여부 — 'none'이거나 없으면 표시하지 않는다. */
  withFood?: WithFood;
  onTake: (id: string) => void;
  onSnooze?: (id: string) => void;
  onSkip?: (id: string) => void;
  onAfterTake?: (id: string, note: string, photoPath: string | undefined) => void;
  /** 현재 시각 — HomeScreen 에서 1분마다 갱신해 전달. 없으면 렌더 시점 기준. */
  now?: Date;
  /** 복용 허용 범위(분). 기본 120(2시간). */
  graceMinutes?: number;
}

function snoozeStyle(count: number): { color: string; borderColor: string } {
  if (count >= 2) return { color: '#ea580c', borderColor: '#fb923c' };
  if (count === 1) return { color: '#d97706', borderColor: '#fcd34d' };
  return { color: '#6b7280', borderColor: '#d1d5db' };
}

export default function DoseCard({
  event,
  medicationName,
  medicationColor,
  withFood,
  onTake,
  onSnooze,
  onSkip,
  onAfterTake,
  now,
  graceMinutes = 120,
}: DoseCardProps) {
  const theme = useThemeStore((s) => s.activeTheme);
  const insets = useSafeAreaInsets();
  const fontScale = useFontScale();
  const nowMs = (now ?? new Date()).getTime();
  const graceMs = graceMinutes * 60_000;
  const displayState = computeDisplayState(event, nowMs, graceMs);

  const isTakeable   = displayState === 'active' || displayState === 'late';
  const isSnoozeable = displayState === 'late' && onSnooze != null && event.snoozeCount < 3;
  const isSkippable  = isTakeable && onSkip != null;

  const time = event.plannedAt.slice(11, 16);
  const { start, end } = windowHint(event.plannedAt, graceMinutes ?? 120);

  // ── 메모 바텀시트 상태 ─────────────────────────────────────────────────────
  const [showMemoSheet, setShowMemoSheet] = useState(false);
  const [memo, setMemo] = useState('');
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [cameraPermAlert, setCameraPermAlert] = useState(false);
  const [photoErrorMsg, setPhotoErrorMsg] = useState<string | null>(null);

  // ── 스와이프 ─────────────────────────────────────────────────────────────
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dx > 8 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx >= SWIPE_THRESHOLD && isSnoozeable) {
          onSnooze!(event.id);
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  // ── 복용 버튼 핸들러 ──────────────────────────────────────────────────────
  function handleTakePress() {
    if (!isTakeable) return;
    onTake(event.id);
    if (onAfterTake) {
      setMemo('');
      setLocalPhoto(null);
      setShowMemoSheet(true);
    }
  }

  // ── 사진 선택 ─────────────────────────────────────────────────────────────
  async function pickImage(source: 'camera' | 'gallery') {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setCameraPermAlert(true);
          return;
        }
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            });

      if (!result.canceled && result.assets[0]) {
        const srcUri = result.assets[0].uri;
        try {
          const dir = `${FileSystem.documentDirectory}dose-photos/`;
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          const ext = srcUri.split('.').pop()?.split('?')[0] ?? 'jpg';
          const dest = `${dir}${Date.now()}.${ext}`;
          await FileSystem.copyAsync({ from: srcUri, to: dest });
          setLocalPhoto(dest);
        } catch {
          setLocalPhoto(srcUri);
        }
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      if (msg && !msg.includes('cancel') && !msg.includes('Cancel')) {
        setPhotoErrorMsg(`사진을 불러오지 못했습니다.\n(${msg})`);
      }
    }
  }

  const meta = STATE_META[displayState];
  const highlighted = isTakeable;

  return (
    <View style={[styles.row, displayState === 'waiting' && styles.dimmed]}>
      {/* 왼쪽 시간 컬럼 — 폭이 글씨 배율을 따라가야 "09:00"·"복용 예정" 이 잘리지 않는다 */}
      <View style={[styles.leftTime, { width: Math.round(LEFT_TIME_WIDTH * fontScale) }]}>
        <Text testID={`card-time-${event.id}`} style={[styles.time, { color: meta.timeColor }]} numberOfLines={1}>{time}</Text>
        <Text style={styles.stateLabel} numberOfLines={1}>
          <Text style={{ color: meta.labelColor }}>{meta.label}</Text>
        </Text>
      </View>

      <View style={styles.cardWrap}>
        {/* 스와이프 뒤에 보이는 미루기 힌트 */}
        {isSnoozeable && (
          <View style={[styles.swipeHint, { backgroundColor: theme.primary }]}>
            <Text style={{ color: '#fff', fontSize: 13 }}>미루기 →</Text>
          </View>
        )}

        <Animated.View
          style={[
            styles.card,
            highlighted ? styles.cardHighlighted : styles.cardPlain,
            { transform: [{ translateX }] },
          ]}
          {...panResponder.panHandlers}
          accessibilityLabel={`${medicationName} ${time}`}
          testID={`card-${event.id}`}
        >
        {/* 약 색상 바 */}
        {medicationColor && (
          <View style={[styles.colorBar, { backgroundColor: medicationColor }]} />
        )}

        <View style={styles.infoRow}>
          <View style={styles.info}>
            <View style={[styles.statusDot, { backgroundColor: meta.dotColor }]} />
            <View style={styles.nameCol}>
              <View style={styles.nameRow}>
                <Text testID={`card-name-${event.id}`} style={styles.name} numberOfLines={1}>
                  {medicationName}
                </Text>
                {withFood && withFood !== 'none' && (
                  <Text style={styles.foodTag}>({withFood === 'before' ? '식전' : '식후'})</Text>
                )}
              </View>
              {displayState === 'waiting' && (
                <Text style={styles.hintGray}>{start}부터 복용 가능</Text>
              )}
              {displayState === 'active' && (
                <Text style={styles.hintGray}>{end}까지 복용 가능</Text>
              )}
              {displayState === 'late' && (
                <Text style={[styles.hintGray, { color: '#ff7675' }]}>예정 시각이 지났어요 · {end}까지 복용 가능</Text>
              )}
              {displayState === 'missed' && (
                <Text style={styles.hintGray}>복용 시간이 지났어요</Text>
              )}
            </View>
          </View>

          {/* 완료 — 체크 아이콘 (탭해도 동작 없음) */}
          {(displayState === 'taken' || displayState === 'skipped') && (
            <View testID={`btn-take-${event.id}`}>
              <Ionicons
                name={displayState === 'taken' ? 'checkmark-circle' : 'arrow-redo-circle-outline'}
                size={20}
                color={meta.dotColor}
              />
            </View>
          )}
        </View>

        {/* 하단: 액션 버튼 (건너뜀 / 미루기 / 복용 완료) */}
        {isTakeable && (
          <View style={styles.actionRow}>
            {isSkippable && (
              <TouchableOpacity
                testID={`btn-skip-${event.id}`}
                onPress={() => onSkip!(event.id)}
                accessibilityLabel="건너뜀"
                style={styles.skipActionBtn}
              >
                <Text style={styles.skipActionTxt}>건너뜀</Text>
              </TouchableOpacity>
            )}
            {isSnoozeable && (
              <TouchableOpacity
                testID={`btn-snooze-${event.id}`}
                onPress={() => onSnooze!(event.id)}
                accessibilityLabel={`미루기 ${event.snoozeCount}/3`}
                style={[styles.snoozeBtn, { borderColor: snoozeStyle(event.snoozeCount).borderColor }]}
              >
                <Text style={[styles.snoozeTxt, { color: snoozeStyle(event.snoozeCount).color }]}>
                  미루기 ({event.snoozeCount}/3)
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID={`btn-take-${event.id}`}
              onPress={handleTakePress}
              accessibilityRole="button"
              accessibilityLabel={`${medicationName} 복용`}
              style={styles.actionBtn}
            >
              <Text style={styles.actionTxt}>복용 완료</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 누락 — 별도 버튼 없이 왼쪽 라벨로 상태 표시 */}
      </Animated.View>
      </View>

      {/* 메모/사진 바텀시트 */}
      {onAfterTake && (
        <Modal
          visible={showMemoSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMemoSheet(false)}
          testID="modal-memo-sheet"
        >
          <View style={styles.backdrop}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.sheetWrapper}
            >
              <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>메모 추가 (선택사항)</Text>
                  <TouchableOpacity
                    testID="btn-close-memo"
                    style={styles.sheetCloseBtn}
                    onPress={() => setShowMemoSheet(false)}
                    accessibilityLabel="닫기"
                    accessibilityRole="button"
                  >
                    <Text style={styles.sheetCloseTxt}>✕</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  testID="input-memo"
                  style={styles.memoInput}
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="복용 메모 입력..."
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <View style={styles.photoRow}>
                  <TouchableOpacity
                    testID="btn-camera"
                    style={styles.photoBtn}
                    onPress={() => pickImage('camera')}
                  >
                    <Text style={styles.photoBtnTxt}>📷 카메라</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="btn-gallery"
                    style={styles.photoBtn}
                    onPress={() => pickImage('gallery')}
                  >
                    <Text style={styles.photoBtnTxt}>🖼️ 갤러리</Text>
                  </TouchableOpacity>
                </View>

                {localPhoto != null && (
                  <Image
                    testID="photo-preview"
                    source={{ uri: localPhoto }}
                    style={styles.photoPreview}
                    resizeMode="cover"
                  />
                )}

                <View style={styles.sheetBtnRow}>
                  <TouchableOpacity
                    testID="btn-skip-memo"
                    style={styles.skipBtn}
                    onPress={() => setShowMemoSheet(false)}
                  >
                    <Text style={styles.skipTxt}>건너뛰기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="btn-save-memo"
                    style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                    onPress={() => {
                      onAfterTake(event.id, memo.trim(), localPhoto ?? undefined);
                      setShowMemoSheet(false);
                    }}
                  >
                    <Text style={styles.saveTxt}>저장</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}

      <AlertModal
        visible={cameraPermAlert}
        icon="camera"
        tone="warning"
        title="카메라 권한이 필요합니다"
        message="사진을 찍으려면 설정에서 카메라 접근을 허용해 주세요."
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setCameraPermAlert(false) },
          { text: '설정 열기', onPress: () => { setCameraPermAlert(false); void Linking.openSettings(); } },
        ]}
        onRequestClose={() => setCameraPermAlert(false)}
      />

      <AlertModal
        visible={photoErrorMsg !== null}
        icon="alert-circle"
        tone="danger"
        title="사진 오류"
        message={photoErrorMsg ?? undefined}
        buttons={[{ text: '확인', onPress: () => setPhotoErrorMsg(null) }]}
        onRequestClose={() => setPhotoErrorMsg(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  dimmed: { opacity: 0.7 },

  // width 는 글씨 배율에 따라 런타임에 계산한다(LEFT_TIME_WIDTH 참고)
  leftTime: { paddingTop: 12 },
  time:        { fontSize: 14, fontWeight: '700' },
  stateLabel:  { fontSize: 10, fontWeight: '600', marginTop: 2 },

  cardWrap: { flex: 1, position: 'relative' },

  card: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  cardPlain: {
    borderWidth: 1,
    borderColor: '#e5e8eb',
  },
  cardHighlighted: {
    borderWidth: 1.5,
    borderColor: '#d2e4fc',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  swipeHint: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#3182f6',
    borderRadius: 14,
  },
  colorBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  nameCol: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  name:    { fontSize: 14, fontWeight: '700', color: '#191f28', flexShrink: 1 },
  foodTag: { fontSize: 12, fontWeight: '600', color: '#8b95a1' },
  hintGray: { fontSize: 12, color: '#8b95a1', marginTop: 2 },
  skipActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f2f3f4',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipActionTxt: { fontSize: 12, fontWeight: '700', color: '#4e5968' },
  snoozeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    minHeight: 44,
    justifyContent: 'center',
  },
  snoozeTxt: { fontSize: 14, color: '#6b7280' },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3182f6',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // ── 바텀시트 ─────────────────────────────────────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetWrapper: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseTxt: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  memoInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 80,
    marginBottom: 14,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  photoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  photoBtnTxt: { fontSize: 14, color: '#374151' },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 14,
  },
  sheetBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  skipTxt: { fontSize: 15, color: '#6b7280' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  saveTxt: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
