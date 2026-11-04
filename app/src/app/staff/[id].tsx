import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useIsAdmin } from '@/lib/auth';
import { Banner, Button, Card, GroupLabel, Loading, Muted, Page, Row, Toggle } from '@/components/ui';
import { maskMobile } from '@/lib/format';
import { DEFAULT_STAFF_PERMISSIONS, PERMISSIONS } from '@shared/permissions';
import { C } from '@/lib/theme';
import type { StaffUser } from '../(tabs)/staff';
import { t } from '@/lib/i18n';

/** Screen 10 · Staff permissions (owner only). Each switch saves instantly. */
export default function StaffPermissions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ users: StaffUser[] }>('GET', '/users'), enabled: admin });
  const u = users.data?.users.find((x) => String(x.id) === id);
  const [codes, setCodes] = useState<string[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (u) setCodes(u.permissions);
  }, [u?.id, users.dataUpdatedAt]);

  if (!admin) return <Redirect href="/" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/staff'));
  if (!u) {
    return (
      <Page title={t('Permissions')}>
        {users.isLoading ? <Loading /> : <Banner kind="danger" text={t('Staff not found')} />}
      </Page>
    );
  }

  async function save(next: string[]) {
    const prev = codes;
    setCodes(next);
    setErr('');
    try {
      const r = await api<{ permissions: string[] }>('PUT', `/users/${u!.id}/permissions`, { codes: next });
      setCodes(r.permissions);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      setCodes(prev);
      setErr((e as ApiError).message);
    }
  }

  const groups = ['Orders', 'Printing', 'Special'] as const;
  return (
    <Page title={t('Permissions')}>
      <Pressable onPress={back} style={{ marginBottom: 10 }}>
        <Text style={{ color: C.action, fontSize: 15, fontWeight: '600' }}>{t('‹ Staff')}</Text>
      </Pressable>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.action, fontWeight: '700', fontSize: 16 }}>{u.name[0]?.toUpperCase()}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{u.name}</Text>
          <Muted>
            {maskMobile(u.mobile)} · {u.is_active ? t('Active') : t('Removed')} · {t('{a} of {b} on', { a: codes.length, b: PERMISSIONS.length })}
          </Muted>
        </View>
      </Card>
      {err ? <Banner kind="danger" text={err} /> : null}
      {groups.map((g) => (
        <View key={g}>
          <GroupLabel>{t(g)}</GroupLabel>
          <Card style={{ padding: 0 }}>
            {PERMISSIONS.filter((p) => p.group === g).map((p, i, arr) => (
              <View
                key={p.code}
                style={[
                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 56 },
                  i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border },
                ]}
              >
                <Text style={{ fontSize: 16, color: C.text, flex: 1 }}>{t(p.label)}</Text>
                <Toggle
                  value={codes.includes(p.code)}
                  onChange={(v) => save(v ? [...codes, p.code] : codes.filter((c) => c !== p.code))}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}
      <Row style={{ alignItems: 'center', marginTop: 6 }} gap={14}>
        <Button kind="secondary" title={t('Reset to default')} onPress={() => save([...DEFAULT_STAFF_PERMISSIONS])} style={{ paddingHorizontal: 16 }} />
        <Muted style={{ flex: 1, fontSize: 13 }}>{t('Saved instantly. Applies on {name}’s next action.', { name: u.name })}</Muted>
      </Row>
    </Page>
  );
}
