import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Card, Field, Input, Page } from '@/components/ui';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Screen 12 · Change password (forced at first login, and from Home). */
export default function ChangePassword() {
  const { me, refresh, logout } = useAuth();
  const first = !!me?.mustChangePassword;
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [conf, setConf] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [top, setTop] = useState('');

  const checks = [
    { ok: newP.length >= 6, text: t('At least 6 characters') },
    { ok: newP.length > 0 && newP === conf, text: t('New and confirm match') },
    { ok: newP.length > 0 && newP !== oldP, text: first ? t('Different from temporary password') : t('Different from current password') },
  ];

  async function save() {
    setErrors({});
    setTop('');
    if (!checks.every((c) => c.ok)) return setTop(t('Please meet all three rules below.'));
    setBusy(true);
    try {
      await api('POST', '/auth/change-password', { oldPassword: oldP, newPassword: newP });
      await refresh();
      router.replace('/');
    } catch (e) {
      setErrors((e as ApiError).fields);
      setTop((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t('Change password')} footer={<Button title={t('Save new password')} onPress={save} loading={busy} />}>
      {!first ? (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ marginBottom: 10 }}>
          <Text style={{ color: C.action, fontSize: 15, fontWeight: '600' }}>{t('‹ Back')}</Text>
        </Pressable>
      ) : null}
      {first ? <Banner title={t('First login')} text={t('Set your own password before you start. The owner cannot see it.')} /> : null}
      {top ? <Banner kind="danger" text={top} /> : null}
      <Field label={first ? t('Temporary password') : t('Current password')} error={errors.oldPassword}>
        <Input value={oldP} onChangeText={setOldP} secureTextEntry />
      </Field>
      <Field label={t('New password')} error={errors.newPassword}>
        <Input value={newP} onChangeText={setNewP} secureTextEntry />
      </Field>
      <Field label={t('Confirm new password')}>
        <Input value={conf} onChangeText={setConf} secureTextEntry onSubmitEditing={save} />
      </Field>
      <Card>
        {checks.map((c) => (
          <View key={c.text} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
            <Text style={{ color: c.ok ? C.ok : C.muted, width: 16 }}>{c.ok ? '✓' : '·'}</Text>
            <Text style={{ color: c.ok ? C.ok : C.muted, fontSize: 15 }}>{c.text}</Text>
          </View>
        ))}
      </Card>
      {first ? <Button kind="link" title={t('Log out')} onPress={logout} /> : null}
    </Page>
  );
}
