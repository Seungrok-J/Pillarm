import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, Animated,
} from 'react-native';
import debounce from 'lodash.debounce';
import NetInfo from '@react-native-community/netinfo';
import { searchMedications, type MedicationSearchResult } from './medicationSearchApi';

export type { MedicationSearchResult };

interface Props {
  value:        string;
  onChange:     (text: string) => void;
  onSelect:     (result: MedicationSearchResult) => void;
  placeholder?: string;
  testID?:      string;
}

export default function MedicationSearchInput({
  value, onChange, onSelect, placeholder, testID,
}: Props) {
  // 로컬 text state: TextInput을 직접 제어 — onChange(외부)와 handleSelect(선택) 모두 즉시 반영
  const [text,     setText]    = useState(value);
  const [results,  setResults] = useState<MedicationSearchResult[]>([]);
  const [loading,  setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const justSelectedRef     = useRef(false);
  const pressingDropdownRef = useRef(false);
  const prevValueRef        = useRef(value);  // 외부 value 변경 감지용
  const hasInteractedRef    = useRef(false);  // 사용자가 직접 타이핑한 경우만 true
  const toastOpacity    = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(8)).current;

  // ── 외부 value 변경 시 로컬 text 동기화 (폼 초기화·수정 모드 진입 등) ─────────

  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      hasInteractedRef.current = false; // 외부 변경은 사용자 타이핑이 아님
      setText(value);
    }
  }, [value]);

  // ── 온라인 상태 감시 ───────────────────────────────────────────────────────────

  useEffect(() => {
    let prevOnline = true;
    NetInfo.fetch().then((s) => { prevOnline = !!s.isConnected; setIsOnline(prevOnline); });
    const unsub = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected;
      if (prevOnline && !connected) fireOfflineToast();
      prevOnline = connected;
      setIsOnline(connected);
    });
    return () => unsub();
  }, []);

  function fireOfflineToast() {
    toastOpacity.setValue(0);
    toastTranslateY.setValue(8);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(toastOpacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }

  // ── 디바운스 검색 ─────────────────────────────────────────────────────────────

  const debouncedSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        try {
          const r = await searchMedications(q);
          setResults(r);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300),
    [],
  );

  // ── 로컬 text 변경 시 검색 트리거 ─────────────────────────────────────────────

  useEffect(() => {
    // mount 또는 외부 value 주입 시에는 검색하지 않음
    if (!hasInteractedRef.current) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (text.length < 2 || !isOnline) {
      debouncedSearch.cancel();
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debouncedSearch(text);
    return () => { debouncedSearch.cancel(); };
  }, [text, isOnline, debouncedSearch]);

  // ── 항목 선택 ────────────────────────────────────────────────────────────────

  function handleSelect(item: MedicationSearchResult) {
    const selectedName = item.itemName ?? '';
    justSelectedRef.current = true;
    pressingDropdownRef.current = false;
    debouncedSearch.cancel();
    setResults([]);
    setLoading(false);
    // 로컬 text 즉시 업데이트 → TextInput 즉시 반영 (외부 state 전파 지연 무관)
    setText(selectedName);
    prevValueRef.current = selectedName;
    onChange(selectedName);
    onSelect(item);
  }

  // ── TextInput 변경 ────────────────────────────────────────────────────────────

  function handleChangeText(t: string) {
    hasInteractedRef.current = true;
    setText(t);
    prevValueRef.current = t;
    onChange(t);
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* 입력 + 스피너 */}
      <View style={styles.inputRow}>
        <TextInput
          testID={testID ?? 'input-med-name'}
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          onBlur={() => {
            // 500ms 대기 — onPressIn이 늦게 도착하는 디바이스에서도 안전하게 처리
            setTimeout(() => {
              if (!pressingDropdownRef.current) setResults([]);
              pressingDropdownRef.current = false;
            }, 500);
          }}
          placeholder={placeholder ?? '예: 이부프로펜'}
          placeholderTextColor="#9ca3af"
          maxLength={50}
        />
        {loading && (
          <ActivityIndicator
            testID="search-spinner"
            size="small"
            color="#3b82f6"
            style={styles.spinner}
          />
        )}
      </View>

      {/* 오프라인 힌트 */}
      {!isOnline && (
        <Text testID="offline-hint" style={styles.offlineHint}>
          오프라인 상태 — 약 이름을 직접 입력해주세요
        </Text>
      )}

      {/* 드롭다운 */}
      {isOnline && results.length > 0 && (
        <View testID="dropdown" style={styles.dropdown}>
          <FlatList
            data={results}
            keyExtractor={(item) => item.itemSeq}
            scrollEnabled={false}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <TouchableOpacity
                testID={`dropdown-item-${item.itemSeq}`}
                style={styles.dropdownItem}
                onPressIn={() => { pressingDropdownRef.current = true; }}
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
              >
                <Text style={styles.itemName} numberOfLines={1}>{item.itemName}</Text>
                <Text style={styles.itemEntp} numberOfLines={1}>{item.entpName}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      )}

      {/* 오프라인 토스트 */}
      <Animated.View
        testID="offline-toast"
        style={[
          styles.toast,
          { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.toastText}>오프라인 상태입니다. 직접 입력해주세요.</Text>
      </Animated.View>
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { position: 'relative', zIndex: 10 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  spinner: { marginLeft: 8 },

  offlineHint: { fontSize: 12, color: '#f59e0b', marginTop: 4, marginLeft: 2 },

  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginTop: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 999,
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  itemName:     { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemEntp:     { fontSize: 12, color: '#6b7280', marginTop: 2 },
  separator:    { height: 1, backgroundColor: '#f3f4f6' },

  toast: {
    position: 'absolute',
    bottom: -52,
    left: 0,
    right: 0,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    zIndex: 1000,
  },
  toastText: { color: '#fff', fontSize: 13 },
});
