import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Muted, Pill } from './ui';
import { C, R } from '@/lib/theme';
import { payText, time } from '@/lib/format';
import type { DuplicateMatch } from '@shared/types';

/** Screen 5 · Duplicate warning (bottom sheet). */
export function DuplicateSheet({
  visible,
  message,
  matches,
  canOverride,
  saving,
  onCancel,
  onView,
  onSaveAnyway,
}: {
  visible: boolean;
  message: string;
  matches: DuplicateMatch[];
  canOverride: boolean;
  saving: boolean;
  onCancel: () => void;
  onView: (id: number) => void;
  onSaveAnyway: () => void;
}) {
  const sameMessage = matches[0]?.same_message;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={st.backdrop} onPress={onCancel} />
      <View style={st.sheet}>
        <View style={st.inner}>
          <Pill kind="warn" text={sameMessage ? 'Possible duplicate' : 'Same customer recently'} />
          <Text style={st.title}>{message}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            {matches.map((m) => (
              <View key={m.id} style={st.match}>
                <Text style={st.matchTitle}>
                  {[m.ship_name, payText(m)].filter(Boolean).join(' · ')}
                </Text>
                <Muted>
                  {m.address} · {m.pincode}
                </Muted>
                <Muted>
                  {m.mobile1} · {m.same_message ? 'Same WhatsApp message' : 'Same mobile + pincode'} · #{m.id} by {m.saved_by}, {time(m.created_at)}
                </Muted>
              </View>
            ))}
          </ScrollView>
          <Button title="Cancel, don't save" onPress={onCancel} style={{ marginTop: 14 }} />
          {matches[0] ? <Button kind="secondary" title="View saved order" onPress={() => onView(matches[0].id)} style={{ marginTop: 10 }} /> : null}
          {canOverride ? (
            <Button kind="dangerLink" title="Save anyway (new order)" onPress={onSaveAnyway} loading={saving} style={{ marginTop: 6 }} />
          ) : (
            <Text style={st.ask}>A real second order? Ask the owner to save it.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.backdrop },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24 },
  inner: { padding: 22, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 12 },
  match: { backgroundColor: C.rowAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.card, padding: 14, marginBottom: 8, gap: 3 },
  matchTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  ask: { textAlign: 'center', color: C.muted, marginTop: 14, fontSize: 14 },
});
