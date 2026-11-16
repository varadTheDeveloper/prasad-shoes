// PREPAID / COD everywhere in one look (client, 16 Nov 2026):
//   - TypeChooser: Home and Orders open with only these two big buttons, one above the other (Orders: 17 Nov 2026).
//   - DiscardSheet: "Discard this order?" when Back would lose an unsaved paste (Orders: "Clear the selection?").
// Colours: TYPE_COLOR in lib/theme.ts.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PaymentType } from '@shared/types';
import { C, R, TYPE_COLOR } from '@/lib/theme';
import { t } from '@/lib/i18n';

export const TYPES: PaymentType[] = ['PREPAID', 'COD'];
export const typeName = (x: PaymentType) => (x === 'COD' ? 'COD' : 'PREPAID');

/** Two big buttons, stacked: PREPAID, then COD. `notes` replaces the small line under a button (Orders: "12 not printed"). */
export function TypeChooser({ onPick, notes }: { onPick: (x: PaymentType) => void; notes?: Partial<Record<PaymentType, string>> }) {
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
              {notes?.[x] ?? (x === 'COD' ? t('Cash on delivery – paste the COD booking message') : t('Paid orders – paste the customer’s WhatsApp address'))}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Back with something not finished: Discard / Keep editing (Home), or other words (Orders: Clear / Keep). */
export function DiscardSheet({
  visible,
  onDiscard,
  onKeep,
  title,
  text,
  discardLabel,
  keepLabel,
}: {
  visible: boolean;
  onDiscard: () => void;
  onKeep: () => void;
  title?: string;
  text?: string;
  discardLabel?: string;
  keepLabel?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <Pressable style={st.backdrop} onPress={onKeep} />
      <View style={st.sheet}>
        <Text style={st.sheetTitle}>{title ?? t('Discard this order?')}</Text>
        <Text style={st.sheetText}>{text ?? t('The pasted message and the details you typed are not saved yet.')}</Text>
        <Pressable onPress={onDiscard} style={({ pressed }) => [st.sheetBtn, { backgroundColor: pressed ? '#B91C1C' : C.danger }]}>
          <Text style={[st.sheetBtnText, { color: '#fff' }]}>{discardLabel ?? t('Discard')}</Text>
        </Pressable>
        <Pressable onPress={onKeep} style={({ pressed }) => [st.sheetBtn, st.sheetBtnLine, pressed && { backgroundColor: C.pressed }]}>
          <Text style={[st.sheetBtnText, { color: C.action }]}>{keepLabel ?? t('Keep editing')}</Text>
        </Pressable>
      </View>
    </Modal>
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
  backdrop: { flex: 1, backgroundColor: C.backdrop },
  sheet: { position: 'absolute', left: 16, right: 16, top: '30%', maxWidth: 420, alignSelf: 'center', marginHorizontal: 'auto', backgroundColor: C.card, borderRadius: R.card, padding: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 6 },
  sheetText: { fontSize: 15, color: C.muted, marginBottom: 18 },
  sheetBtn: { borderRadius: R.button, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  sheetBtnLine: { borderWidth: 1, borderColor: C.inputBorder },
  sheetBtnText: { fontSize: 16, fontWeight: '700' },
  badge: { borderWidth: 1, borderRadius: R.pill, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});
