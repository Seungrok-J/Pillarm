import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';

interface Props {
  times: string[];
  onAdd: (time: string) => void;
  onRemove: (time: string) => void;
}

const RE_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function TimePickerList({ times, onAdd, onRemove }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');

  function handleConfirm() {
    if (!RE_HHMM.test(inputValue)) {
      setInputError('HH:MM 형식으로 입력해주세요 (예: 08:00)');
      return;
    }
    if (times.includes(inputValue)) {
      setInputError('이미 추가된 시간입니다');
      return;
    }
    onAdd(inputValue);
    setInputValue('');
    setInputError('');
    setIsAdding(false);
  }

  function handleCancel() {
    setInputValue('');
    setInputError('');
    setIsAdding(false);
  }

  return (
    <View>
      {times.map((time) => (
        <View
          key={time}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
        >
          <Text testID={`time-chip-${time}`} style={{ fontSize: 16 }}>{time}</Text>
          <TouchableOpacity
            testID={`btn-remove-time-${time}`}
            onPress={() => onRemove(time)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: '#f87171', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      {isAdding ? (
        <View style={{ marginTop: 8 }}>
          <TextInput
            testID="input-time-value"
            style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16 }}
            value={inputValue}
            onChangeText={(v) => { setInputValue(v); setInputError(''); }}
            placeholder="HH:MM (예: 08:00)"
            maxLength={5}
            autoFocus
          />
          {!!inputError && (
            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{inputError}</Text>
          )}
          <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
            <TouchableOpacity
              testID="btn-confirm-time"
              onPress={handleConfirm}
              style={{ flex: 1, backgroundColor: '#3b82f6', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff' }}>확인</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="btn-cancel-time"
              onPress={handleCancel}
              style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
            >
              <Text style={{ color: '#4b5563' }}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          testID="btn-add-time"
          onPress={() => setIsAdding(true)}
          style={{ paddingVertical: 8, marginTop: 4 }}
        >
          <Text style={{ color: '#3b82f6', fontSize: 16 }}>+ 시간 추가</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
