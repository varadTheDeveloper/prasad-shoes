// Opened from the "Forgot password?" email: /reset-password?key=… (website). Sets the owner's new password;
// the server then logs out every device, so everyone logs in again with the new password.
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Card, Field, Input, Loading } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { C } from '@/lib/theme';

export default function ResetPassword() {
  const { t } = useLang();
  const { me, clearLocal } = useAuth();
  const { key: queryKey } = useLocalSearchParams<{ key?: string }>();
  // The email link carries the key after '#' (/reset-password#key=…): browsers never send that part to the
  // server, so the key is not in any server log. Read once, then removed from the address bar and history.
  const [key] = useState(() => {
    const loc = Platform.OS === 'web' ? globalThis.location : undefined;
    const fromHash = new URLSearchParams((loc?.hash ?? '').replace(/^#/, '')).get('key');
    if (fromHash && loc) globalThis.history?.replaceState(globalThis.history.state, '', loc.pathname);
    return fromHash || String(queryKey ?? '');
  });
  const [state, setState] = useState<'checking' | 'ready' | 'bad' | 'done'>('checking');
  const [newP, setNewP] = useState('');
  const [conf, setConf] = useState('');
  const [top, setTop] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!key) return setState('bad');
    api('POST', '/auth/reset-password/check', { key })
      .then(() => setState('ready'))
      .catch((e: ApiError) => {
        setTop(e.message);
        setState('bad');
      });
  }, [key]);

  const checks = [
    { ok: newP.length >= 6, text: t('At least 6 characters') },
    { ok: newP.length > 0 && newP === conf, text: t('New and confirm match') },
  ];

  async function save() {
    setTop('');
    if (!checks.every((c) => c.ok)) return setTop(t('Please meet both rules below.'));
    setBusy(true);
    try {
      await api('POST', '/auth/reset-password', { key, newPassword: newP });
      if (me) await clearLocal(); // this browser's old login has ended too
      setState('done');
    } catch (e) {
      setTop((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const toLogin = () => router.replace(me ? '/' : '/login');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <View style={st.box}>
          <Text style={st.title}>{t('Set a new owner password')}</Text>
          {state === 'checking' ? <Loading /> : null}
          {state === 'bad' ? (
            <>
              <Banner kind="danger" text={top || t('This link has expired or was already used. Ask for a new one.')} />
              <Button title={t('Ask for a new link')} onPress={() => router.replace('/forgot-password')} style={{ marginTop: 8 }} />
            </>
          ) : null}
          {state === 'done' ? (
            <>
              <Banner kind="ok" text={t('Password changed. Every phone and computer was logged out – log in with the new password.')} />
              <Button title={t('Go to login')} onPress={toLogin} style={{ marginTop: 8 }} />
            </>
          ) : null}
          {state === 'ready' ? (
            <>
              {top ? <Banner kind="danger" text={top} /> : null}
              <Field label={t('New password')}>
                <Input value={newP} onChangeText={setNewP} secureTextEntry autoComplete="new-password" />
              </Field>
              <Field label={t('Confirm new password')}>
                <Input value={conf} onChangeText={setConf} secureTextEntry autoComplete="new-password" onSubmitEditing={save} />
              </Field>
              <Card>
                {checks.map((c) => (
                  <View key={c.text} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
                    <Text style={{ color: c.ok ? C.ok : C.muted, width: 16 }}>{c.ok ? '✓' : '·'}</Text>
                    <Text style={{ color: c.ok ? C.ok : C.muted, fontSize: 15 }}>{c.text}</Text>
                  </View>
                ))}
              </Card>
              <Button title={t('Save new password')} onPress={save} loading={busy} style={{ marginTop: 8 }} />
            </>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 16 },
});
