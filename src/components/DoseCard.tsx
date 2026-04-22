import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { DoseEvent, DoseStatus } from '../domain';

interface DoseCardProps {
  event: DoseEvent;
  medicationName: string;
  onTake: (id: string) => void;
}

const STATUS_LABEL: Record<DoseStatus, string> = {
  scheduled: '복용',
  taken: '완료 ✓',
  late: '늦은 복용',
  missed: '누락',
  skipped: '건너뜀',
};

export default function DoseCard({ event, medicationName, onTake }: DoseCardProps) {
  const isActionable = event.status === 'scheduled' || event.status === 'late';
  const time = new Date(event.plannedAt).toTimeString().slice(0, 5);

  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 mb-2 rounded-xl ${
        event.status === 'taken' ? 'bg-green-50' :
        event.status === 'late' ? 'bg-orange-50' :
        event.status === 'missed' ? 'bg-red-50' :
        event.status === 'skipped' ? 'bg-gray-100' : 'bg-white'
      }`}
      accessibilityLabel={`${medicationName} ${time} ${STATUS_LABEL[event.status]}`}
    >
      <Text className="text-base font-medium text-gray-800">{time}</Text>
      <Text className="flex-1 mx-3 text-base text-gray-700">{medicationName}</Text>
      <TouchableOpacity
        onPress={() => isActionable && onTake(event.id)}
        disabled={!isActionable}
        accessibilityRole="button"
        className={`px-4 py-2 rounded-lg min-w-[72px] items-center ${
          isActionable ? 'bg-blue-500' : 'bg-gray-200'
        }`}
      >
        <Text className={`text-sm font-semibold ${isActionable ? 'text-white' : 'text-gray-500'}`}>
          {STATUS_LABEL[event.status]}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
