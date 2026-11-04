// Owner: "⬇ Excel" opens this box – Download, with a tick to also email the same file to the owner
// (OWNER_EMAIL on the server; the app never chooses who receives it).
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Checkbox, Muted } from '@/components/ui';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

export function ExcelSheet({
  visible,
  count,
  range,
  alsoEmail,
  onToggleEmail,
  onCancel,
  onDownload,
}: {
  visible: boolean;
  count: number;
  range: string;
  alsoEmail: boolean;
  onToggleEmail: () => void;
  onCancel: () => void;
  onDownload: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={st.backdrop} onPress={onCancel} />
      <View style={st.sheet}>
        <View style={st.inner}>
          <Text style={st.title}>{t('Excel – {n} orders', { n: count })}</Text>
          {range ? <Muted>{range}</Muted> : null}
          <Pressable onPress={onToggleEmail} style={st.tick} hitSlop={6}>
            <Checkbox checked={alsoEmail} onPress={onToggleEmail} />
            <View style={{ flex: 1 }}>
              <Text style={st.tickText}>{t('Also send to email')}</Text>
              <Muted>{t("The same Excel file goes to the owner's email.")}</Muted>
            </View>
          </Pressable>
          <Button title={t('⬇ Download')} onPress={onDownload} style={{ marginTop: 16 }} />
          <Button kind="secondary" title={t('Cancel')} onPress={onCancel} style={{ marginTop: 10 }} />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.backdrop },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24 },
  inner: { padding: 22, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, paddingVertical: 6 },
  tickText: { fontSize: 17, fontWeight: '600', color: C.text },
});
