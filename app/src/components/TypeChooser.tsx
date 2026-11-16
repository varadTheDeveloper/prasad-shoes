// PREPAID / COD everywhere in one look (client, 16 Nov 2026):
//   - TypeChooser: Home opens with only these two big buttons, one above the other.
//   - TypeHeader: the chosen type in its colour + "Change" (back to the two buttons).
//   - TypeSwitch: PREPAID | COD switch with counts (Orders).
// Colours: TYPE_COLOR in lib/theme.ts.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PaymentType } from '@shared/types';
import { C, R, TYPE_COLOR } from '@/lib/theme';
import { t } from '@/lib/i18n';

export const TYPES: PaymentType[] = ['PREPAID', 'COD'];
export const typeName = (x: PaymentType) => (x === 'COD' ? 'COD' : 'PREPAID');

/** Two big buttons, stacked: PREPAID, then COD. */
export function TypeChooser({ onPick }: { onPick: (x: PaymentType) => void }) {
  return (
    <View style={{ gap: 16 }}>
      {TYPES.map((x) => {
        const c = TYPE_COLOR[x];
        return (
          <Pressable
            key={x}
            accessibilityRole="button"
            onPress={() => onPick(x)}
            style={({ pressed }) => [st.big, { backgroundColor: pressed ? c.pressed : c.main }]}
          >
            <Text style={[st.bigTitle, { color: c.on }]}>{typeName(x)}</Text>
            <Text style={[st.bigSub, { color: c.onSub }]}>
              {x === 'COD' ? t('Cash on delivery – paste the COD booking message') : t('Paid orders – paste the customer’s WhatsApp address')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "PREPAID orders" / "COD orders" bar in the type's colour, with a Change button. */
export function TypeHeader({ type, onChange }: { type: PaymentType; onChange: () => void }) {
  const c = TYPE_COLOR[type];
  return (
    <View style={[st.header, { backgroundColor: c.tint, borderColor: c.border }]}>
      <View style={[st.dot, { backgroundColor: c.main }]} />
      <Text style={[st.headerText, { color: c.main }]}>{type === 'COD' ? t('COD orders') : t('PREPAID orders')}</Text>
      <Pressable onPress={onChange} hitSlop={8} style={({ pressed }) => [st.change, { borderColor: c.main }, pressed && { backgroundColor: c.border }]}>
        <Text style={[st.changeText, { color: c.main }]}>{t('Change')}</Text>
      </Pressable>
    </View>
  );
}

/** PREPAID | COD switch with the number of orders of each (Orders screen). */
export function TypeSwitch({ value, onChange, counts }: { value: PaymentType; onChange: (x: PaymentType) => void; counts?: Partial<Record<PaymentType, number>> }) {
  return (
    <View style={st.switch}>
      {TYPES.map((x) => {
        const c = TYPE_COLOR[x];
        const on = x === value;
        const n = counts?.[x];
        return (
          <Pressable
            key={x}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(x)}
            style={[st.switchItem, on ? { backgroundColor: c.main, borderColor: c.main } : { backgroundColor: C.card, borderColor: c.border }]}
          >
            <Text style={[st.switchText, { color: on ? c.on : c.main }]}>
              {typeName(x)}
              {n === undefined ? '' : ` (${n})`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small coloured label "PREPAID" / "COD" for list rows. */
export function TypeBadge({ type }: { type: PaymentType }) {
  const c = TYPE_COLOR[type];
  return (
    <View style={[st.badge, { backgroundColor: c.tint, borderColor: c.border }]}>
      <Text style={[st.badgeText, { color: c.main }]}>{typeName(type)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  big: { borderRadius: R.card, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', minHeight: 120, justifyContent: 'center' },
  bigTitle: { fontSize: 28, fontWeight: '800', letterSpacing: 1 },
  bigSub: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: R.button, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  headerText: { flex: 1, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  change: { borderWidth: 1, borderRadius: R.pill, paddingVertical: 6, paddingHorizontal: 14 },
  changeText: { fontSize: 14, fontWeight: '700' },
  switch: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  switchItem: { flex: 1, borderWidth: 1.5, borderRadius: R.button, paddingVertical: 12, alignItems: 'center' },
  switchText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  badge: { borderWidth: 1, borderRadius: R.pill, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});
