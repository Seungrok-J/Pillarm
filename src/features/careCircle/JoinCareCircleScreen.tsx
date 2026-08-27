import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation';
import { joinCircle } from './careCircleApi';
import AlertModal from '../../components/AlertModal';

// expo-camera 미설치 시 graceful fallback
let CameraView: React.ComponentType<{
  style: object;
  onBarcodeScanned: (r: { data: string }) => void;
  barcodeScannerSettings: { barcodeTypes: string[] };
}> | null = null;
let useCameraPermissions: (() => [{ granted: boolean } | null, () => Promise<void>]) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch { /* not installed */ }

type Nav = StackNavigationProp<RootStackParamList>;

const CODE_LEN = 6;

/**
 * QR 코드 원문에서 초대 코드 6자리를 추출한다.
 * 초대 QR은 쿼리 파라미터 형식(`.../join?code=XXXXXX`, CareCircleScreen의
 * InviteModal이 생성하는 실제 형식)으로 인코딩되므로 이를 최우선으로 매칭하고,
 * 딥링크 경로 형식(`.../join/XXXXXX`)과 코드 원문만 있는 경우도 함께 지원한다.
 */
export function extractInviteCode(data: string): string | null {
  const queryMatch = data.match(/[?&]code=([A-Z0-9]{6})\b/i);
  if (queryMatch) return queryMatch[1].toUpperCase();

  const pathMatch = data.match(/\/join\/([A-Z0-9]{6})\b/i);
  if (pathMatch) return pathMatch[1].toUpperCase();

  const trimmed = data.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(trimmed) ? trimmed : null;
}

// ── 코드 입력 탭 ───────────────────────────────────────────────────────────────

interface CodeInputProps {
  onSubmit: (code: string) => void;
  loading:  boolean;
}

function CodeInputTab({ onSubmit, loading }: CodeInputProps) {
  const [chars, setChars] = useState<string[]>(Array(CODE_LEN).fill(''));
  const refs = useRef<Array<TextInput | null>>([]);

  function handleChange(text: string, idx: number) {
    const char = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const next = [...chars];
    next[idx] = char;
    setChars(next);
    if (char && idx < CODE_LEN - 1) refs.current[idx + 1]?.focus();
  }

  function handleKeyPress(key: string, idx: number) {
    if (key === 'Backspace' && !chars[idx] && idx > 0) {
      const next = [...chars];
      next[idx - 1] = '';
      setChars(next);
      refs.current[idx - 1]?.focus();
    }
  }

  const code    = chars.join('');
  const canJoin = code.length === CODE_LEN && !loading;

  return (
    <View style={styles.tabContent}>
      <Text style={styles.inputLabel}>초대 코드 6자리를 입력하세요</Text>

      <View style={styles.codeRow}>
        {chars.map((ch, i) => (
          <TextInput
            key={i}
            ref={(r) => { refs.current[i] = r; }}
            testID={`code-box-${i}`}
            style={[styles.codeBox, ch ? styles.codeBoxFilled : null]}
            value={ch}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
            maxLength={1}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            keyboardType={Platform.OS === 'ios' ? 'default' : 'visible-password'}
            textAlign="center"
            selectTextOnFocus
            accessibilityLabel={`코드 ${i + 1}번째 자리`}
          />
        ))}
      </View>

      <TouchableOpacity
        testID="btn-join-code"
        style={[styles.joinBtn, !canJoin && styles.joinBtnDisabled]}
        onPress={() => onSubmit(code)}
        disabled={!canJoin}
        accessibilityLabel="보호 그룹 참여"
        accessibilityRole="button"
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.joinBtnText}>참여하기</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ── QR 스캔 탭 ─────────────────────────────────────────────────────────────────

interface QrScanProps {
  onScan: (code: string) => void;
}

function QrScanTab({ onScan }: QrScanProps) {
  const [scanned, setScanned] = useState(false);
  const [invalidQr, setInvalidQr] = useState(false);

  // expo-camera 미설치 fallback
  if (!CameraView || !useCameraPermissions) {
    return (
      <View style={styles.qrFallbackContainer}>
        <Text style={styles.qrFallbackText}>
          QR 스캔을 사용하려면{'\n'}expo-camera를 설치하세요{'\n\n'}
          npx expo install expo-camera
        </Text>
      </View>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission?.granted) {
    return (
      <View style={styles.qrFallbackContainer}>
        <Text style={styles.qrFallbackText}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity
          testID="btn-camera-permission"
          style={styles.permissionBtn}
          onPress={requestPermission}
          accessibilityRole="button"
        >
          <Text style={styles.permissionBtnText}>카메라 권한 허용</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function handleScan({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    const code = extractInviteCode(data);
    if (code) {
      onScan(code);
    } else {
      setInvalidQr(true);
    }
  }

  const CV = CameraView as React.ComponentType<{
    style: object;
    onBarcodeScanned: (r: { data: string }) => void;
    barcodeScannerSettings: { barcodeTypes: string[] };
  }>;

  return (
    <View style={styles.cameraWrap}>
      <CV
        style={styles.camera}
        onBarcodeScanned={scanned ? () => {} : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />
      <View style={styles.scanOverlay}>
        <View style={styles.scanFrame} />
      </View>
      <Text style={styles.scanHint}>QR코드를 프레임 안에 맞춰주세요</Text>

      <AlertModal
        visible={invalidQr}
        icon="alert-circle"
        tone="danger"
        title="인식 실패"
        message="유효한 초대 QR코드가 아닙니다"
        buttons={[{ text: '다시 시도', onPress: () => { setInvalidQr(false); setScanned(false); } }]}
        onRequestClose={() => { setInvalidQr(false); setScanned(false); }}
      />
    </View>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────────────────

type Tab = 'code' | 'qr';

export default function JoinCareCircleScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'JoinCareCircle'>>();
  const [tab,     setTab]     = useState<Tab>('code');
  const [loading, setLoading] = useState(false);
  const [joinSuccessVisible, setJoinSuccessVisible] = useState(false);
  const [joinErrorMsg, setJoinErrorMsg] = useState<string | null>(null);

  const deepLinkCode = route.params?.code?.toUpperCase();

  useEffect(() => {
    if (deepLinkCode && /^[A-Z0-9]{6}$/.test(deepLinkCode)) {
      handleJoin(deepLinkCode);
    }
  }, [deepLinkCode]);

  async function handleJoin(code: string) {
    if (loading) return;
    setLoading(true);
    try {
      await joinCircle(code);
      setJoinSuccessVisible(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? '참여에 실패했습니다';
      setJoinErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container} testID="screen-join-care-circle">
      {/* 탭 전환 */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          testID="tab-code"
          style={[styles.tabItem, tab === 'code' && styles.tabItemActive]}
          onPress={() => setTab('code')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'code' }}
        >
          <Text style={[styles.tabText, tab === 'code' && styles.tabTextActive]}>
            코드 입력
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-qr"
          style={[styles.tabItem, tab === 'qr' && styles.tabItemActive]}
          onPress={() => setTab('qr')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'qr' }}
        >
          <Text style={[styles.tabText, tab === 'qr' && styles.tabTextActive]}>
            QR 스캔
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'code'
        ? <CodeInputTab onSubmit={handleJoin} loading={loading} />
        : <QrScanTab onScan={handleJoin} />
      }

      <AlertModal
        visible={joinSuccessVisible}
        icon="checkmark-circle"
        tone="success"
        title="참여 완료!"
        message={'보호 그룹에 피보호자로 참여했습니다.\n보호자가 내 복용 현황을 확인할 수 있습니다.'}
        buttons={[{ text: '확인', onPress: () => { setJoinSuccessVisible(false); navigation.goBack(); } }]}
        onRequestClose={() => { setJoinSuccessVisible(false); navigation.goBack(); }}
      />

      <AlertModal
        visible={joinErrorMsg !== null}
        icon="alert-circle"
        tone="danger"
        title="참여 실패"
        message={joinErrorMsg ?? undefined}
        buttons={[{ text: '확인', onPress: () => setJoinErrorMsg(null) }]}
        onRequestClose={() => setJoinErrorMsg(null)}
      />
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  tabBar:       { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tabItem:      { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: '#3b82f6' },
  tabText:       { fontSize: 15, color: '#9ca3af', fontWeight: '500' },
  tabTextActive: { color: '#3b82f6', fontWeight: '700' },

  tabContent: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  inputLabel: { fontSize: 16, color: '#374151', marginBottom: 24, textAlign: 'center' },

  codeRow:      { flexDirection: 'row', gap: 8, marginBottom: 32 },
  codeBox:      {
    width: 44, height: 56, borderRadius: 10,
    borderWidth: 2, borderColor: '#d1d5db', backgroundColor: '#fff',
    fontSize: 24, fontWeight: '700', color: '#111827',
    textAlign: 'center',
  },
  codeBoxFilled: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },

  joinBtn:         { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center' },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },

  cameraWrap:  { flex: 1, position: 'relative' },
  camera:      { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: 220, height: 220,
    borderWidth: 3, borderColor: '#3b82f6', borderRadius: 16,
  },
  scanHint: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    color: '#fff', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },

  qrFallbackContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  qrFallbackText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  permissionBtn:     { marginTop: 16, backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  permissionBtnText: { color: '#fff', fontWeight: '600' },
});
