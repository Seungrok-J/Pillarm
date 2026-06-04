import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import type { RootStackParamList } from '../../navigation';
import { prepareImageBase64 } from '../../features/medicationScan/scanUtils';
import { scanMedicationImage } from '../../features/medicationScan/scanApi';
import { useSettingsStore } from '../../store';

type Nav = StackNavigationProp<RootStackParamList>;

export default function ScanScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(false);

  async function pickAndScan(useCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('권한 필요', '카메라 접근 권한이 필요합니다. 설정에서 허용해주세요.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: false,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: false,
        });
      }

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setLoading(true);
      const base64 = await prepareImageBase64(result.assets[0].uri);
      const settings = useSettingsStore.getState().settings;
      const scanResults = await scanMedicationImage(base64, settings);
      navigation.replace('ScanResult', { results: scanResults });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '오류가 발생했습니다';
      Alert.alert('인식 실패', msg, [
        { text: '다시 시도', style: 'cancel' },
        {
          text: '직접 입력',
          onPress: () => navigation.replace('ScheduleNew'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <Text style={styles.loadingEmoji}>💊</Text>
        <Text style={styles.loadingTitle}>분석 중...</Text>
        <Text style={styles.loadingSubtitle}>약봉투 정보를 읽고 있어요</Text>
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.container}>
        <Text style={styles.title}>약봉투를 촬영해주세요</Text>
        <Text style={styles.subtitle}>
          봉투의 약 이름, 복용법이 잘 보이도록{'\n'}전체가 프레임 안에 들어오게 촬영하면{'\n'}인식 정확도가 높아집니다.
        </Text>

        <View style={styles.previewBox}>
          <Text style={styles.previewEmoji}>📷</Text>
          <Text style={styles.previewHint}>약봉투·포장 전체를 선명하게</Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => pickAndScan(true)}
        >
          <Text style={styles.primaryBtnText}>📷  카메라로 촬영하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => pickAndScan(false)}
        >
          <Text style={styles.secondaryBtnText}>🖼  갤러리에서 선택하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.textBtn}
          onPress={() => navigation.replace('ScheduleNew')}
        >
          <Text style={styles.textBtnText}>직접 입력하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1, paddingHorizontal: 24, paddingTop: 32,
    alignItems: 'center',
  },
  title:    { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: {
    fontSize: 14, color: '#6b7280', textAlign: 'center',
    marginTop: 10, lineHeight: 22,
  },

  previewBox: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 28,
  },
  previewEmoji: { fontSize: 48, marginBottom: 8 },
  previewHint:  { fontSize: 13, color: '#9ca3af' },

  primaryBtn: {
    width: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  secondaryBtn: {
    width: '100%',
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: { color: '#374151', fontSize: 16, fontWeight: '600' },

  textBtn:     { marginTop: 8 },
  textBtnText: { fontSize: 14, color: '#9ca3af' },

  loadingContainer: {
    flex: 1, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  loadingEmoji:    { fontSize: 56, marginBottom: 16 },
  loadingTitle:    { fontSize: 22, fontWeight: '800', color: '#111827' },
  loadingSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 6 },
});
