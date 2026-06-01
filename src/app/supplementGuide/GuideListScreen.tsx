import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation';
import {
  useSupplementGuide,
  CATEGORY_LABELS,
  timingLabel,
} from '../../features/supplementGuide/useSupplementGuide';
import type { SupplementGuide, SupplementCategory } from '../../features/supplementGuide/types';

type Nav = StackNavigationProp<RootStackParamList>;

const CATEGORIES: Array<SupplementCategory | 'all'> = [
  'all', 'vitamin_fat', 'vitamin_water', 'mineral', 'omega', 'probiotic', 'other',
];

export default function GuideListScreen() {
  const navigation = useNavigation<Nav>();
  const [category, setCategory] = useState<SupplementCategory | 'all'>('all');
  const [query, setQuery]       = useState('');

  const items = useSupplementGuide(category, query);

  function renderItem({ item }: { item: SupplementGuide }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('GuideDetail', { id: item.id })}
        accessibilityRole="button"
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardEmoji}>{item.emoji}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.nameEn && (
            <Text style={styles.cardNameEn}>{item.nameEn}</Text>
          )}
          <Text style={styles.cardSummary} numberOfLines={2}>
            {item.summary}
          </Text>
          <View style={styles.cardMeta}>
            <View style={styles.timingBadge}>
              <Text style={styles.timingBadgeText}>
                ⏰ {item.timing.detail}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {/* 검색 */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="영양제 이름으로 검색..."
          placeholderTextColor="#9ca3af"
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
            style={[styles.tab, category === cat && styles.tabActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.tabText, category === cat && styles.tabTextActive]}>
              {CATEGORY_LABELS[cat]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f9fafb' },

  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    color: '#111827',
  },

  tabScroll: { backgroundColor: '#fff', maxHeight: 52 },
  tabContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  tabActive:     { backgroundColor: '#3b82f6' },
  tabText:       { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#fff', fontWeight: '600' },

  listContent: { padding: 16, paddingBottom: 40 },
  separator:   { height: 10 },
  emptyText:   { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 15 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLeft:   { marginRight: 12, paddingTop: 2 },
  cardEmoji:  { fontSize: 28 },
  cardBody:   { flex: 1 },
  cardName:   { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardNameEn: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  cardSummary:{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 19 },
  cardMeta:   { marginTop: 8 },
  timingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timingBadgeText: { fontSize: 12, color: '#3b82f6', fontWeight: '500' },
  chevron: { fontSize: 20, color: '#d1d5db', alignSelf: 'center', marginLeft: 6 },
});
