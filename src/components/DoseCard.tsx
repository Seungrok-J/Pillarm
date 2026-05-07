import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { DoseEvent } from '../domain';
import {
  DOSE_EARLY_WINDOW_MS,
  DoseDisplayState,
  computeDisplayState,
} from '../utils/doseDisplay';

// ── 상수 & 헬퍼 ──────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 72;
/** 로컬 alias — 공유 유틸에서 import */
type DisplayState = DoseDisplayState;

const CARD_BG: Record<DisplayState, string> = {
  waiting:  '#ffffff',
  active:   '#ffffff',
  late:     '#fff7ed',
  missed:   '#fef2f2',
  taken:    '#f0fdf4',
  skipped:  '#f3f4f6',
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
  onTake: (id: string) => void;
  onSnooze?: (id: string) => void;
  onSkip?: (id: string) => void;
  onAfterTake?: (id: string, note: string, photoPath: string | undefined) => void;
  /** 현재 시각 — HomeScreen 에서 1분마다 갱신해 전달. 없으면 렌더 시점 기준. */
  now?: Date;
  /** 늦은 복용 허용 범위(분). 기본 120(2시간). */
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
  onTake,
  onSnooze,
  onSkip,
  onAfterTake,
  now,
  graceMinutes = 120,
}: DoseCardProps) {
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
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          '카메라 권한이 필요합니다',
          '사진을 찍으려면 설정에서 카메라 접근을 허용해 주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정 열기', onPress: () => void Linking.openSettings() },
          ],
        );
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
  }

  return (
    <View style={{ position: 'relative', marginBottom: 8 }}>
      {/* 스와이프 뒤에 보이는 미루기 힌트 */}
      {isSnoozeable && (
        <View style={styles.swipeHint}>
          <Text style={{ color: '#fff', fontSize: 13 }}>미루기 →</Text>
        </View>
      )}

      <Animated.View
        style={[
          styles.card,
          { backgroundColor: CARD_BG[displayState], transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
        accessibilityLabel={`${medicationName} ${time}`}
        testID={`card-${event.id}`}
      >
        {/* 약 색상 바 */}
        {medicationColor && (
          <View style={[styles.colorBar, { backgroundColor: medicationColor }]} />
        )}

        {/* 상단: 시간 + 약 이름 + 힌트 */}
        <View style={styles.topRow}>
          <Text testID={`card-time-${event.id}`} style={styles.time}>{time}</Text>
          <View style={styles.nameCol}>
            <Text testID={`card-name-${event.id}`} style={styles.name} numberOfLines={1}>
              {medicationName}
            </Text>
            {displayState === 'waiting' && (
              <Text style={styles.hintGray}>{start}부터 복용 가능</Text>
            )}
            {displayState === 'active' && (
              <Text style={styles.hintGray}>{end}까지 늦은 복용 가능</Text>
            )}
            {displayState === 'late' && (
              <Text style={styles.hintOrange}>{end}까지 복용 가능</Text>
            )}
          </View>
        </View>

        {/* 하단: 액션 버튼 */}
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

          {/* 복용 / 늦은복용 버튼 — active·late 상태에서만 표시 */}
          {isTakeable && (
            <TouchableOpacity
              testID={`btn-take-${event.id}`}
              onPress={handleTakePress}
              accessibilityRole="button"
              accessibilityLabel={displayState === 'late' ? `${medicationName} 늦은 복용` : `${medicationName} 복용`}
              style={[
                styles.actionBtn,
                { backgroundColor: displayState === 'late' ? '#f97316' : '#3b82f6' },
              ]}
            >
              <Text style={[styles.actionTxt, { color: '#ffffff' }]}>
                {displayState === 'late' ? '늦은 복용' : '복용'}
              </Text>
            </TouchableOpacity>
          )}

          {/* 완료 / 건너뜀 — 처리된 상태 표시 (비활성) */}
          {(displayState === 'taken' || displayState === 'skipped') && (
            <View
              testID={`btn-take-${event.id}`}
              style={[styles.actionBtn, { backgroundColor: '#e5e7eb' }]}
            >
              <Text style={[styles.actionTxt, { color: '#6b7280' }]}>
                {displayState === 'taken' ? '완료 ✓' : '건너뜀'}
              </Text>
            </View>
          )}

          {/* 누락 — 창 지남 (버튼 없음, 텍스트만) */}
          {displayState === 'missed' && (
            <Text testID={`btn-take-${event.id}`} style={styles.missedText}>누락</Text>
          )}

          {/* 예정 — 아직 창 열리기 전 (버튼 없음, 텍스트만) */}
          {displayState === 'waiting' && (
            <Text style={styles.waitingText}>예정</Text>
          )}
        </View>
      </Animated.View>

      {/* 메모/사진 바텀시트 */}
      {onAfterTake && (
        <Modal
          visible={showMemoSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMemoSheet(false)}
          testID="modal-memo-sheet"
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setShowMemoSheet(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.sheetWrapper}
            >
              <TouchableOpacity activeOpacity={1} style={styles.sheet}>
                <Text style={styles.sheetTitle}>메모 추가 (선택사항)</Text>

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
                    style={styles.saveBtn}
                    onPress={() => {
                      onAfterTake(event.id, memo.trim(), localPhoto ?? undefined);
                      setShowMemoSheet(false);
                    }}
                  >
                    <Text style={styles.saveTxt}>저장</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  swipeHint: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
  },
  colorBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  time:    { fontSize: 16, fontWeight: '600', color: '#374151', width: 44 },
  nameCol: { flex: 1, marginLeft: 10, justifyContent: 'center' },
  name:    { fontSize: 16, color: '#111827' },
  hintGray:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  hintOrange: { fontSize: 11, color: '#f97316', marginTop: 2, fontWeight: '500' },
  skipActionBtn: {
    marginRight: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 44,
    justifyContent: 'center',
  },
  skipActionTxt: { fontSize: 14, color: '#9ca3af' },
  snoozeBtn: {
    marginRight: 8,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt:   { fontSize: 14, fontWeight: '600' },
  missedText:  { fontSize: 14, fontWeight: '500', color: '#ef4444', paddingHorizontal: 4, paddingVertical: 10 },
  waitingText: { fontSize: 14, fontWeight: '500', color: '#9ca3af', paddingHorizontal: 4, paddingVertical: 10 },

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
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
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
