import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useIsAdmin } from '@/lib/auth';
import { Banner, Button, Card, Field, Input, Loading, Muted, Page, SectionTitle } from '@/components/ui';
import { FromBlock } from '@/components/LabelPreview';
import type { ShopSettings } from '@shared/types';
import { C } from '@/lib/theme';

/** Screen 11 · Shop details – the "From" block printed on every label (owner only). */
export default function Shop() {
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['shop'], queryFn: () => api<ShopSettings>('GET', '/shop') });
  const [f, setF] = useState<ShopSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data) setF({ ...q.data, address2: q.data.address2 ?? '' });
  }, [q.data]);

  if (!admin) return <Redirect href="/" />;
  if (!f) {
    return (
      <Page title="Shop details">
        <Loading />
      </Page>
    );
  }

  const set = (k: keyof ShopSettings) => (v: string) => setF({ ...f, [k]: v });

  async function save() {
    setBusy(true);
    setErrors({});
    setMsg(null);
    try {
      await api('PUT', '/shop', f);
      setMsg({ kind: 'ok', text: 'Saved. The next Word file uses these details.' });
      qc.invalidateQueries({ queryKey: ['shop'] });
    } catch (e) {
      setErrors((e as ApiError).fields);
      setMsg({ kind: 'danger', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Shop details" footer={<Button title="Save shop details" onPress={save} loading={busy} />}>
      <Muted style={{ marginBottom: 12 }}>Printed in the “From” block of every label.</Muted>
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
      <Field label="Shop name" error={errors.shop_name}>
        <Input value={f.shop_name} onChangeText={set('shop_name')} />
      </Field>
      <Field label="Address line 1" error={errors.address1}>
        <Input value={f.address1} onChangeText={set('address1')} />
      </Field>
      <Field label="Address line 2" error={errors.address2}>
        <Input value={f.address2 ?? ''} onChangeText={set('address2')} />
      </Field>
      <Field label="City and pincode" error={errors.city_pin}>
        <Input value={f.city_pin} onChangeText={set('city_pin')} />
      </Field>
      <Field label="Phone numbers" error={errors.phones}>
        <Input value={f.phones} onChangeText={set('phones')} keyboardType="default" />
      </Field>
      <SectionTitle>Label preview</SectionTitle>
      <Card style={{ borderStyle: 'dashed', borderColor: C.checkBorder }}>
        <FromBlock shop={f} size={16} />
      </Card>
    </Page>
  );
}
