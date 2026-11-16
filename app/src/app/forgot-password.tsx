// "Forgot password?" (owner only, 16 Nov 2026): the owner types their mobile; the server emails a one-time link
// (15 minutes) to the owner's email from server/.env. The answer is the same for every number. Staff ask the owner.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, ApiError } from '@/lib/api';
import { Banner, Button, Field, Input } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { C } from '@/lib/theme';

export default function ForgotPassword() {
  const { t } = useLang();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setError('');
    if (!mobile.trim()) return setError(t('Enter mobile number'));
    setBusy(true);
    try {
      const r = await api<{ message: string }>('POST', '/auth/forgot', { mobile });
      setSent(t(r.message));
    } catch (e) {
      const ae = e as ApiError;
      setError(ae.fields?.mobile || ae.message);
    } finally {
      setBusy(false);
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <View style={st.box}>
          <Text style={st.title}>{t('Forgot password')}</Text>
          {sent ? (
            <>
              <Banner kind="ok" text={sent} />
              <Text style={st.hint}>{t('Open the email on any phone or computer and tap the link to set a new password.')}</Text>
            </>
          ) : (
            <>
              <Text style={st.sub}>{t('Owner: enter your mobile number. A link to set a new password will be emailed to the owner’s email.')}</Text>
              <Field label={t('Mobile number')} error={error}>
                <Input value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder={t('10-digit mobile')} maxLength={14} autoComplete="tel" onSubmitEditing={send} />
              </Field>
              <Button title={t('Email me a reset link')} onPress={send} loading={busy} style={{ marginTop: 8 }} />
              <Text style={st.hint}>{t('Staff: ask the owner to reset your password in Staff.')}</Text>
            </>
          )}
          <Button kind="link" title={t('‹ Back to login')} onPress={back} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 8 },
  sub: { fontSize: 15, color: C.muted, marginBottom: 20 },
  hint: { color: C.muted, marginTop: 16, fontSize: 14, textAlign: 'center' },
});
