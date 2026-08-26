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
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {PALETTE_COLORS.map((color) => {
        const isSelected = selected === color;
        return (
          <TouchableOpacity
            key={color}
            testID={`color-swatch-${color}`}
            accessibilityRole="radio"
            accessibilityLabel={`색상 ${color}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(color)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: isSelected ? 2 : 0,
              borderColor: isSelected ? color : 'transparent',
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: color,
              }}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
