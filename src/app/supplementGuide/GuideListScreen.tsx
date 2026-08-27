import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../../navigation';
import {
  useSupplementGuide,
  CATEGORY_LABELS,
} from '../../features/supplementGuide/useSupplementGuide';
import type { SupplementGuide, SupplementCategory } from '../../features/supplementGuide/types';
import AlertModal from '../../components/AlertModal';

type Nav = StackNavigationProp<RootStackParamList>;

const CATEGORIES: Array<SupplementCategory | 'all'> = [
  'all', 'vitamin_fat', 'vitamin_water', 'mineral', 'omega', 'probiotic', 'other',
];

export default function GuideListScreen() {
  const navigation = useNavigation<Nav>();
  const [category, setCategory] = useState<SupplementCategory | 'all'>('all');
  const [query, setQuery]       = useState('');
  const [disclaimerVisible, setDisclaimerVisible] = useState(false);

  const items = useSupplementGuide(category, query);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          testID="btn-guide-disclaimer"
          onPress={() => setDisclaimerVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 16 }}
          accessibilityLabel="안내"
          accessibilityRole="button"
        >
          <Ionicons name="alert-circle-outline" size={22} color="#191f28" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  function renderItem({ item }: { item: SupplementGuide }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('GuideDetail', { id: item.id })}
        accessibilityRole="button"
      >
        <View style={styles.cardHeader}>
          <View style={styles.leftGroup}>
            <View style={styles.cardLeft}>
              <Text style={styles.cardEmoji}>{item.emoji}</Text>
            </View>
            <View style={styles.titleGroup}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.nameEn && (
                <Text style={styles.cardNameEn}>{item.nameEn}</Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8b95a1" />
        </View>
        <Text style={styles.cardSummary} numberOfLines={2}>
          {item.summary}
        </Text>
        <View style={styles.timingTag}>
          <Ionicons name="time-outline" size={14} color="#3182f6" />
          <Text style={styles.timingTagText}>{item.timing.detail}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.scrollContentTop}>
        {/* 검색 */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#8b95a1" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="궁금한 영양제를 검색해보세요"
            placeholderTextColor="#8b95a1"
            clearButtonMode="while-editing"
          />
        </View>

        {/* 카테고리 탭 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabContent}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                {CATEGORY_LABELS[cat]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 목록 */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <AlertModal
        visible={disclaimerVisible}
        icon="alert-circle-outline"
        tone="warning"
        title="안내"
        message="이 정보는 일반적인 참고용이며 의료 전문가의 진단이나 처방을 대체하지 않습니다. 복용 전 담당 의사·약사와 상담해 주세요."
        buttons={[{ text: '확인', onPress: () => setDisclaimerVisible(false) }]}
        onRequestClose={() => setDisclaimerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f2f4f7' },

  scrollContentTop: { padding: 20, paddingBottom: 4, gap: 16 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e8eb',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#191f28' },

  tabScroll: { flexGrow: 0 },
  tabContent: { gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e8eb',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  chipActive:     { backgroundColor: '#3182f6', borderColor: '#3182f6' },
  chipText:       { fontSize: 14, fontWeight: '700', color: '#4e5968' },
  chipTextActive: { color: '#fff' },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  separator:   { height: 12 },
  emptyText:   { textAlign: 'center', color: '#8b95a1', marginTop: 60, fontSize: 15 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leftGroup:  { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  cardLeft:   { alignItems: 'center', justifyContent: 'center' },
  cardEmoji:  { fontSize: 28 },
  titleGroup: { gap: 2 },
  cardName:   { fontSize: 14, fontWeight: '700', color: '#191f28' },
  cardNameEn: { fontSize: 12, color: '#8b95a1' },
  cardSummary:{ fontSize: 12, color: '#4e5968', lineHeight: 18 },
  timingTag: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4,
    backgroundColor: '#e8f3ff', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  timingTagText: { fontSize: 12, color: '#3182f6', fontWeight: '700' },
});
