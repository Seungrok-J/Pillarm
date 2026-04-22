import React from 'react';
import { View, TouchableOpacity } from 'react-native';

export const PALETTE_COLORS = [
  '#FF6B6B',
  '#FFA94D',
  '#FFD43B',
  '#69DB7C',
  '#74C0FC',
  '#DA77F2',
] as const;

interface Props {
  selected?: string;
  onSelect: (color: string) => void;
}

export default function ColorPalette({ selected, onSelect }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {PALETTE_COLORS.map((color) => (
        <TouchableOpacity
          key={color}
          testID={`color-swatch-${color}`}
          accessibilityRole="radio"
          accessibilityLabel={`색상 ${color}`}
          accessibilityState={{ selected: selected === color }}
          onPress={() => onSelect(color)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: color,
            borderWidth: selected === color ? 3 : 1,
            borderColor: selected === color ? '#1A1A2E' : 'transparent',
          }}
        />
      ))}
    </View>
  );
}
