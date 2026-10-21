// Website: the browser's own date box. Value is 'YYYY-MM-DD' ('' = any date).
import { createElement } from 'react';
import { Text, View } from 'react-native';
import { C, R } from '@/lib/theme';

export function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{label}</Text>
      {createElement('input', {
        type: 'date',
        value,
        min,
        max,
        'aria-label': label,
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        style: { font: 'inherit', fontSize: 16, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: R.input, background: C.card, color: C.text },
      })}
    </View>
  );
}
