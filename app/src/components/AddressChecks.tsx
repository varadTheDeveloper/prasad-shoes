// Address checks shown before Save: the India Post pincode check (server) and the
// "Not used" lines of the pasted message (shared/parser.ts findUnused).
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';
import type { FormState } from './OrderForm';

export interface PinWarning {
  level: 'danger' | 'warn';
  field: 'pincode' | 'address' | 'district' | 'state';
  text: string;
}
export interface PinCheck {
  pincode: string;
  found: boolean;
  districts: string[];
  state: string;
  warnings: PinWarning[];
  /** The customer wrote another district (no note shown): don't add the pincode's district. */
  addressNamesOtherDistrict?: boolean;
  /** District / State fields that do not match the pincode (asked before changing). */
  mismatch?: Mismatch;
}
export interface Mismatch {
  district?: { typed: string; pincode: string; inAddress?: boolean };
  state?: { typed: string; pincode: string };
}
export const mismatchKey = (pincode: string, m?: Mismatch) =>
  m && (m.district || m.state) ? `${pincode}|${m.district?.typed ?? ''}|${m.state?.typed ?? ''}` : '';
export function mismatchText(pincode: string, m: Mismatch): string {
  return [
    m.district ? `${m.district.inAddress ? 'Address says' : 'District'} "${m.district.typed}" does not match pincode ${pincode} (${m.district.pincode}).` : '',
    m.state ? `State "${m.state.typed}" does not match pincode ${pincode} (${m.state.pincode}).` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Checks the pincode against the India Post list whenever the pincode / address changes. */
export function usePinCheck(f: FormState) {
  const input = useMemo(
    () => ({
      pincode: f.pincode.replace(/\s/g, ''),
      address: f.address,
      landmark: f.landmark,
      district: f.district,
      state: f.state,
    }),
    [f.pincode, f.address, f.landmark, f.district, f.state],
  );
  const q = useDebounced(input, 350);
  const valid = /^[1-9]\d{5}$/.test(q.pincode);
  const res = useQuery({
    queryKey: ['pincode-check', q],
    queryFn: () => api<PinCheck>('POST', '/pincode/check', q),
    enabled: valid,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const current = valid && q.pincode === input.pincode ? res.data : undefined;
  return { check: current, checking: valid && (res.isFetching || q !== input), failed: valid && res.isError };
}

/** "✓ 413255 · Solapur, Maharashtra" or the warnings, plus the "Not used" lines. */
export function AddressNotes({
  check,
  failed,
  unused,
  onAddToAddress,
  onIgnore,
  mismatch,
  onUsePincode,
  onKeepTyped,
}: {
  check?: PinCheck;
  failed?: boolean;
  unused: string[];
  onAddToAddress: (line: string) => void;
  onIgnore: (line: string) => void;
  /** Shown until the person chooses; undefined = nothing to ask. */
  mismatch?: Mismatch;
  onUsePincode?: () => void;
  onKeepTyped?: () => void;
}) {
  const use = [mismatch?.district?.pincode, mismatch?.state?.pincode].filter(Boolean).join(', ');
  return (
    <View>
      {check?.found ? (
        <View style={[st.note, st.ok]}>
          <Text style={st.okText}>
            ✓ Pincode {check.pincode} · {check.districts.join(' / ')}, {check.state}
          </Text>
        </View>
      ) : null}
      {failed ? (
        <View style={[st.note, st.info]}>
          <Text style={st.infoText}>Pincode check is not available right now. Check the pincode yourself.</Text>
        </View>
      ) : null}
      {check?.warnings.map((w, i) => (
        <View key={i} style={[st.note, w.level === 'danger' ? st.danger : st.warn]}>
          <Text style={w.level === 'danger' ? st.dangerText : st.warnText}>
            {w.level === 'danger' ? '✕ ' : '! '}
            {w.text}
          </Text>
        </View>
      ))}
      {check && mismatch && (mismatch.district || mismatch.state) ? (
        <View style={[st.note, st.danger]}>
          <Text style={st.dangerText}>District / State do not match pincode {check.pincode}</Text>
          {mismatch.district ? (
            <Text style={st.mmLine}>
              {mismatch.district.inAddress ? 'Address says' : 'District:'} <Text style={{ fontWeight: '700' }}>{mismatch.district.typed}</Text> → pincode says{' '}
              <Text style={{ fontWeight: '700' }}>{mismatch.district.pincode}</Text>
            </Text>
          ) : null}
          {mismatch.state ? (
            <Text style={st.mmLine}>
              State: <Text style={{ fontWeight: '700' }}>{mismatch.state.typed}</Text> → pincode says{' '}
              <Text style={{ fontWeight: '700' }}>{mismatch.state.pincode}</Text>
            </Text>
          ) : null}
          <View style={st.actions}>
            <Pressable onPress={onUsePincode} hitSlop={8}>
              <Text style={st.action}>Use {use}</Text>
            </Pressable>
            <Pressable onPress={onKeepTyped} hitSlop={8}>
              <Text style={st.action}>Keep as written</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {unused.map((l) => (
        <View key={l} style={[st.note, st.warn]}>
          <Text style={st.warnText}>
            <Text style={{ fontWeight: '700' }}>Not used: </Text>
            {l}
          </Text>
          <View style={st.actions}>
            <Pressable onPress={() => onAddToAddress(l)} hitSlop={8}>
              <Text style={st.action}>Add to address</Text>
            </Pressable>
            <Pressable onPress={() => onIgnore(l)} hitSlop={8}>
              <Text style={st.action}>Not needed</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  note: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1 },
  ok: { backgroundColor: C.okTint, borderColor: C.okTint },
  okText: { color: C.ok, fontSize: 14, fontWeight: '600' },
  info: { backgroundColor: C.tint, borderColor: C.tint },
  infoText: { color: C.action, fontSize: 14 },
  warn: { backgroundColor: C.warnTint, borderColor: '#F5C27A' },
  warnText: { color: C.warn, fontSize: 14, lineHeight: 20 },
  danger: { backgroundColor: C.dangerTint, borderColor: '#F3A3A3' },
  dangerText: { color: C.danger, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 22, marginTop: 8 },
  mmLine: { color: C.danger, fontSize: 14, lineHeight: 20, marginTop: 4 },
  action: { color: C.action, fontWeight: '700', fontSize: 14 },
});
