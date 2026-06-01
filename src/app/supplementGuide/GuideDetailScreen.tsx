import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation';
import { useSupplementById, timingLabel } from '../../features/supplementGuide/useSupplementGuide';

type Route = RouteProp<RootStackParamList, 'GuideDetail'>;

function openUrl(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('오류', '링크를 열 수 없습니다.'));
}

export default function GuideDetailScreen() {
  const { params } = useRoute<Route>();
  const item = useSupplementById(params.id);

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>정보를 찾을 수 없습니다</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.emoji}>{item.emoji}</Text>
          <Text style={styles.name}>{item.name}</Text>
          {item.nameEn && <Text style={styles.nameEn}>{item.nameEn}</Text>}
        </View>

        {/* 요약 */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{item.summary}</Text>
        </View>

        {/* 권장 복용 시기 */}
        <SectionTitle title="⏰ 권장 복용 시기" />
        <View style={styles.timingBox}>
          <Text style={styles.timingMain}>{item.timing.detail}</Text>
          <Text style={styles.timingType}>{timingLabel(item.timing.type)}</Text>
        </View>

        {/* 함께 먹으면 좋아요 */}
        {item.goodWith.length > 0 && (
          <>
            <SectionTitle title="✅ 함께 복용하면 좋아요" />
            <View style={styles.listBox}>
              {item.goodWith.map((t, i) => (
                <View key={i} style={styles.listRow}>
                  <Text style={styles.bullet}>·</Text>
                  <Text style={styles.listText}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 함께 먹으면 안 돼요 */}
        {item.avoidWith.length > 0 && (
          <>
            <SectionTitle title="❌ 주의 — 함께 복용 시 흡수 방해 또는 부작용" />
            <View style={[styles.listBox, styles.avoidBox]}>
              {item.avoidWith.map((t, i) => (
                <View key={i} style={styles.listRow}>
                  <Text style={[styles.bullet, { color: '#ef4444' }]}>·</Text>
                  <Text style={[styles.listText, { color: '#7f1d1d' }]}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 상세 설명 */}
        <SectionTitle title="📝 상세 설명" />
        <View style={styles.detailsBox}>
          <Text style={styles.detailsText}>{item.details}</Text>
        </View>

        {/* 출처 */}
        <SectionTitle title="📚 출처" />
        <View style={styles.sourcesBox}>
          {item.sources.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={styles.sourceRow}
              onPress={() => openUrl(s.url)}
              accessibilityRole="link"
            >
              <View style={styles.sourceTextBlock}>
                <Text style={styles.sourceName}>{s.name}</Text>
                {s.note && <Text style={styles.sourceNote}>{s.note}</Text>}
              </View>
              <Text style={styles.sourceLink}>↗</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 면책 고지 */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ⚠️ 이 정보는 공신력 있는 기관의 자료를 바탕으로 한 일반적인 가이드입니다.
            개인의 건강 상태·복용 중인 약물에 따라 다를 수 있으며, 의료 행위를 대체하지 않습니다.
            특히 질환이 있거나 약을 복용 중이라면 반드시 의사·약사와 상담하세요.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:{ fontSize: 15, color: '#9ca3af' },
  content:  { padding: 20 },

  header: { alignItems: 'center', paddingVertical: 20 },
  emoji:  { fontSize: 52, marginBottom: 10 },
  name:   { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center' },
  nameEn: { fontSize: 14, color: '#9ca3af', marginTop: 4 },

  summaryBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  summaryText: { fontSize: 14, color: '#1e40af', lineHeight: 22, fontWeight: '500' },

  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: '#374151',
    marginTop: 20, marginBottom: 10,
  },

  timingBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  timingMain: { fontSize: 17, fontWeight: '700', color: '#111827', flex: 1 },
  timingType: {
    fontSize: 12, color: '#3b82f6', fontWeight: '600',
    backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },

  listBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    gap: 8,
  },
  avoidBox: { backgroundColor: '#fff5f5' },
  listRow:  { flexDirection: 'row', alignItems: 'flex-start' },
  bullet:   { fontSize: 16, color: '#16a34a', marginRight: 6, lineHeight: 22 },
  listText: { fontSize: 14, color: '#374151', lineHeight: 22, flex: 1 },

  detailsBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  detailsText: { fontSize: 14, color: '#374151', lineHeight: 24 },

  sourcesBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sourceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  sourceTextBlock: { flex: 1 },
  sourceName:      { fontSize: 14, fontWeight: '600', color: '#3b82f6' },
  sourceNote:      { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  sourceLink:      { fontSize: 18, color: '#9ca3af' },

  disclaimer: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  disclaimerText: { fontSize: 12, color: '#92400e', lineHeight: 20 },
});
