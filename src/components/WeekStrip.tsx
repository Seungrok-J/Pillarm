import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText as Text } from './AppText';
import { useFontScale, scaledFont } from '../utils/fontScale';
import { todayString, parseDateString, formatDateString } from '../utils';

/**
 * 선택된 날짜가 속한 한 주를 가로 한 줄로 보여준다.
 *
 * 월간 달력은 세로를 6줄까지 먹어서, 글씨를 키우면 아래 복용 목록이 보이지 않는다.
 * 기본은 이 스트립으로 두고 필요할 때만 월간을 펼치게 한다.
 */

export interface WeekStripProps {
  /** YYYY-MM-DD */
  selectedDate: string;
  /** 날짜별 점 색. 값이 없으면 점을 그리지 않는다 */
  dotColors: Record<string, string | undefined>;
  onSelectDate: (date: string) => void;
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** 셀 지름(배율 1.0). 접근성 원칙상 44 미만으로 내리지 않는다 */
const CELL_SIZE = 44;

/** selectedDate 가 속한 주의 일요일부터 7일 */
export function weekDatesOf(selectedDate: string): string[] {
  const base = parseDateString(selectedDate);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return formatDateString(d);
  });
}

export default function WeekStrip({ selectedDate, dotColors, onSelectDate }: WeekStripProps) {
  const fontScale = useFontScale();
  const today = todayString();
  const dates = useMemo(() => weekDatesOf(selectedDate), [selectedDate]);

  const cell = scaledFont(CELL_SIZE, fontScale);

  return (
    <View style={styles.strip} testID="week-strip">
      {dates.map((date) => {
        const dayNum = Number(date.slice(8, 10));
        const dow = parseDateString(date).getDay();
        const isSelected = date === selectedDate;
        const isToday = date === today;
        const dotColor = dotColors[date];

        return (
          <TouchableOpacity
            key={date}
            testID={`week-day-${date}`}
            style={styles.dayCol}
            onPress={() => onSelectDate(date)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${date.slice(5, 7)}월 ${dayNum}일 ${DOW_LABELS[dow]}요일`}
          >
            <Text style={styles.dowLabel}>{DOW_LABELS[dow]}</Text>
            <View
              style={[
                styles.dayPill,
                { width: cell, height: cell, borderRadius: Math.round(cell / 3) },
                isSelected && styles.dayPillSelected,
              ]}
            >
              <Text
                style={[
                  styles.dayNum,
                  isToday && !isSelected && styles.dayNumToday,
                  isSelected && styles.dayNumSelected,
                ]}
              >
                {dayNum}
              </Text>
            </View>
            {/* 점은 자리를 늘 차지해야 선택 시 날짜가 위아래로 흔들리지 않는다 */}
            <View
              style={[
                styles.dot,
                dotColor ? { backgroundColor: dotColor } : styles.dotEmpty,
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  dayCol: { flex: 1, alignItems: 'center', gap: 4 },
  dowLabel: { fontSize: 12, fontWeight: '600', color: '#8b95a1' },
  dayPill: { alignItems: 'center', justifyContent: 'center' },
  dayPillSelected: { backgroundColor: '#3b82f6' },
  dayNum: { fontSize: 15, fontWeight: '700', color: '#191f28' },
  dayNumToday: { color: '#3b82f6' },
  dayNumSelected: { color: '#fff' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotEmpty: { backgroundColor: 'transparent' },
});
