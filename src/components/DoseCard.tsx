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
import type { DoseEvent, DoseStatus } from '../domain';

// ── 상수 ─────────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 72;

const STATUS_LABEL: Record<DoseStatus, string> = {
  scheduled: '복용',
  taken: '완료 ✓',
  late: '늦은 복용',
  missed: '누락',
  skipped: '건너뜀',
};

const CARD_BG: Record<DoseStatus, string> = {
  scheduled: '#ffffff',
  taken: '#f0fdf4',
  late: '#fff7ed',
  missed: '#fef2f2',
  skipped: '#f3f4f6',
};

const BTN_BG: Record<DoseStatus, string> = {
  scheduled: '#3b82f6',
  taken: '#e5e7eb',
  late: '#f97316',
  missed: 'transparent',
  skipped: '#e5e7eb',
};

const BTN_TXT: Record<DoseStatus, string> = {
  scheduled: '#ffffff',
  taken: '#6b7280',
  late: '#ffffff',
  missed: '#ef4444',
  skipped: '#6b7280',
};

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export interface DoseCardProps {
  event: DoseEvent;
  medicationName: string;
  medicationColor?: string;
  onTake: (id: string) => void;
  onSnooze?: (id: string) => void;
  onSkip?: (id: string) => void;
  onAfterTake?: (id: string, note: string, photoPath: string | undefined) => void;
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
}: DoseCardProps) {
  const isTakeable = event.status === 'scheduled' || event.status === 'late';
  const isSnoozeable = event.status === 'late' && onSnooze != null && event.snoozeCount < 3;
  const isSkippable = isTakeable && onSkip != null;

  const time = event.plannedAt.slice(11, 16);

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
          { backgroundColor: CARD_BG[event.status], transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
        accessibilityLabel={`${medicationName} ${time} ${STATUS_LABEL[event.status]}`}
        testID={`card-${event.id}`}
      >
        {/* 약 색상 바 */}
        {medicationColor && (
          <View style={[styles.colorBar, { backgroundColor: medicationColor }]} />
        )}

        {/* 시간 */}
        <Text testID={`card-time-${event.id}`} style={styles.time}>{time}</Text>

        {/* 약 이름 */}
        <Text testID={`card-name-${event.id}`} style={styles.name} numberOfLines={1}>
          {medicationName}
        </Text>

        {/* 건너뜀 버튼 */}
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

        {/* 미루기 버튼 */}
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

        {/* 복용/상태 버튼 */}
        <TouchableOpacity
          testID={`btn-take-${event.id}`}
          onPress={handleTakePress}
          disabled={!isTakeable}
          accessibilityRole="button"
          accessibilityLabel={`${medicationName} ${STATUS_LABEL[event.status]}`}
          style={[
            styles.actionBtn,
            { backgroundColor: BTN_BG[event.status] },
            event.status === 'missed' && styles.missedBtn,
          ]}
        >
          <Text style={[styles.actionTxt, { color: BTN_TXT[event.status] }]}>
            {STATUS_LABEL[event.status]}
          </Text>
        </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
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
  time: { fontSize: 16, fontWeight: '600', color: '#374151', width: 44 },
  name: { flex: 1, marginHorizontal: 10, fontSize: 16, color: '#111827' },
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
  missedBtn: { backgroundColor: 'transparent' },
  actionTxt: { fontSize: 14, fontWeight: '600' },

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
