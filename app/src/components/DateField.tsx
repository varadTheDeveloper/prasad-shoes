// Date box: tap -> the phone's calendar. Value is 'YYYY-MM-DD' ('' = any date).
import { Platform, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { C, R } from '@/lib/theme';
import { niceDate, toISO } from './dateText';

export function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const [ios, setIos] = useState(false);
  const d = value ? new Date(`${value}T12:00:00`) : new Date();
  const open = () => {
    const opts = { value: d, mode: 'date' as const, minimumDate: min ? new Date(`${min}T12:00:00`) : undefined, maximumDate: max ? new Date(`${max}T12:00:00`) : undefined };
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ ...opts, onChange: (e, date) => e.type === 'set' && date && onChange(toISO(date)) });
    else setIos(true);
  };
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{label}</Text>
      <Pressable onPress={open} style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.input, backgroundColor: C.card, paddingVertical: 11, paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 16, color: value ? C.text : C.muted }}>📅  {value ? niceDate(value) : 'Any date'}</Text>
      </Pressable>
      {ios ? (
        <DateTimePicker
          value={d}
          mode="date"
          onChange={(e, date) => {
            setIos(false);
            if (e.type === 'set' && date) onChange(toISO(date));
          }}
        />
      ) : null}
    </View>
  );
}
