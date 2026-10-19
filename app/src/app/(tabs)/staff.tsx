import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useIsAdmin } from '@/lib/auth';
import { Banner, Button, Card, Field, Input, Loading, Muted, Page, Row, SectionTitle, Toggle } from '@/components/ui';
import { maskMobile } from '@/lib/format';
import { C } from '@/lib/theme';
import { PERMISSIONS } from '@shared/permissions';

export interface StaffUser {
  id: number;
  name: string;
  mobile: string;
  role: 'ADMIN' | 'STAFF';
  is_active: boolean;
  must_change_password: boolean;
  permissions: string[];
  orders_today: number;
}

/** Screen 9 · Manage staff (owner only). */
export default function Staff() {
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ users: StaffUser[] }>('GET', '/users'), enabled: admin });
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [pwd, setPwd] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [resetPwd, setResetPwd] = useState('');

  if (!admin) return <Redirect href="/" />;

  const reload = () => qc.invalidateQueries({ queryKey: ['users'] });

  async function add() {
    setErrors({});
    setMsg(null);
    setAdding(true);
    try {
      const u = await api<StaffUser>('POST', '/users', { name, mobile, tempPassword: pwd });
      setMsg({ kind: 'ok', text: `${u.name} added. Tell them: mobile ${u.mobile}, password ${pwd}. They set their own password at first login.` });
      setName('');
      setMobile('');
      setPwd('');
      reload();
    } catch (e) {
      const ae = e as ApiError;
      setErrors({ name: ae.fields.name, mobile: ae.fields.mobile, tempPassword: ae.fields.tempPassword });
      if (!Object.keys(ae.fields).length) setMsg({ kind: 'danger', text: ae.message });
    } finally {
      setAdding(false);
    }
  }

  async function setActive(u: StaffUser, v: boolean) {
    try {
      await api('PATCH', `/users/${u.id}`, { isActive: v });
      reload();
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as ApiError).message });
    }
  }

  async function doReset(u: StaffUser) {
    try {
      await api('PATCH', `/users/${u.id}`, { resetPassword: resetPwd });
      setMsg({ kind: 'ok', text: `Password for ${u.name} reset to “${resetPwd}”. They must change it at next login.` });
      setResetFor(null);
      setResetPwd('');
      reload();
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as ApiError).fields.resetPassword ?? (e as ApiError).message });
    }
  }

  const staff = (users.data?.users ?? []).filter((u) => u.role === 'STAFF');
  const active = staff.filter((u) => u.is_active).length;

  return (
    <Page title="Staff">
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 12 }}>Add staff</Text>
        <Field label="Name" error={errors.name}>
          <Input value={name} onChangeText={setName} placeholder="Staff name" autoCapitalize="words" />
        </Field>
        <Field label="Mobile number" error={errors.mobile}>
          <Input value={mobile} onChangeText={setMobile} placeholder="10-digit mobile" keyboardType="phone-pad" maxLength={14} />
        </Field>
        <Field label="Temporary password" error={errors.tempPassword}>
          <Input value={pwd} onChangeText={setPwd} placeholder="At least 6 characters" autoCapitalize="none" />
        </Field>
        <Button title="Add staff" onPress={add} loading={adding} />
      </Card>
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}

      <SectionTitle>Staff ({active} active)</SectionTitle>
      {users.isLoading ? <Loading /> : null}
      <Card style={{ padding: 0 }}>
        {staff.length === 0 && !users.isLoading ? (
          <View style={{ padding: 16 }}>
            <Muted>No staff yet. Add the first one above.</Muted>
          </View>
        ) : null}
        {staff.map((u, i) => (
          <View key={u.id} style={[{ padding: 14 }, i < staff.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
            <Row style={{ alignItems: 'center' }} gap={12}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.action, fontWeight: '700', fontSize: 16 }}>{u.name[0]?.toUpperCase()}</Text>
              </View>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/staff/${u.id}`)}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: u.is_active ? C.text : C.muted }}>{u.name}</Text>
                <Muted style={{ fontSize: 13 }}>
                  {maskMobile(u.mobile)} · {u.permissions.length} of {PERMISSIONS.length} on · {u.orders_today} today
                  {u.must_change_password ? ' · new password pending' : ''}
                </Muted>
                <Row gap={16} style={{ marginTop: 4 }}>
                  <Text style={{ color: C.action, fontSize: 14, fontWeight: '600' }}>Permissions ›</Text>
                  <Text
                    style={{ color: C.action, fontSize: 14, fontWeight: '600' }}
                    onPress={() => {
                      setResetFor(resetFor === u.id ? null : u.id);
                      setResetPwd('');
                    }}
                  >
                    Reset password
                  </Text>
                </Row>
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <Toggle value={u.is_active} onChange={(v) => setActive(u, v)} />
                <Muted style={{ fontSize: 12 }}>{u.is_active ? 'Active' : 'Removed'}</Muted>
              </View>
            </Row>
            {resetFor === u.id ? (
              <Row style={{ marginTop: 12, alignItems: 'flex-start' }}>
                <Input value={resetPwd} onChangeText={setResetPwd} placeholder="New temporary password" autoCapitalize="none" style={{ flex: 1 }} />
                <Button title="Reset" onPress={() => doReset(u)} style={{ paddingHorizontal: 18 }} />
              </Row>
            ) : null}
          </View>
        ))}
      </Card>
      <Muted style={{ textAlign: 'center' }}>Turning a staff member off logs them out on their next action. Their orders stay.</Muted>
    </Page>
  );
}
