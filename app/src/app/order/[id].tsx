import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth, useIsAdmin, usePermission } from '@/lib/auth';
import { Banner, Button, Card, Loading, Muted, Page, Pill, Row } from '@/components/ui';
import { OrderForm, emptyForm, formFromOrder, formToLabel, toInput, validate, type FormKey, type FormState } from '@/components/OrderForm';
import { ToPreview } from '@/components/LabelPreview';
import { AddressNotes, mismatchKey, usePinCheck } from '@/components/AddressChecks';
import { findUnused } from '@shared/parser';
import { dayTime } from '@/lib/format';
import { C } from '@/lib/theme';
import type { Order } from '@shared/types';

/** Screen 7 · Order detail / edit. */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const admin = useIsAdmin();
  const qc = useQueryClient();
  const showAmount = usePermission('ORDER_VIEW_AMOUNT');
  const editAll = usePermission('ORDER_EDIT_ALL');
  const editOwn = usePermission('ORDER_EDIT_OWN');
  const canDelete = usePermission('ORDER_DELETE');

  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<Order>('GET', `/orders/${id}`) });
  const o = q.data;
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [keptMismatch, setKeptMismatch] = useState<Set<string>>(new Set());
  const pin = usePinCheck(form ?? emptyForm());
  const unused = useMemo(
    () => (form && o?.raw_message ? findUnused(o.raw_message, form as unknown as Record<string, string>).filter((l) => !ignored.has(l)) : []),
    [form, o, ignored],
  );

  useEffect(() => {
    if (o) setForm(formFromOrder(o));
  }, [o?.id, o?.updated_at]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders'));
  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    qc.invalidateQueries({ queryKey: ['order', id] });
  };

  if (q.isError) {
    return (
      <Page title="Order">
        <Banner kind="danger" text={(q.error as ApiError).message} />
        <Button kind="secondary" title="Back" onPress={back} />
      </Page>
    );
  }
  if (!o || !form) {
    return (
      <Page title={`Order #${id}`}>
        <Loading />
      </Page>
    );
  }

  const canEdit = !o.deleted_at && (editAll || (editOwn && o.created_by === me?.id));
  const change = (k: FormKey, v: string) => {
    setForm((f) => ({ ...f!, [k]: v }));
    setConfirmDelete(false);
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };
  // District / State that do not match the pincode: asked, never changed without a tap.
  const mm = pin.check?.mismatch;
  const mmKey = mismatchKey(pin.check?.pincode ?? '', mm);
  const mismatch = canEdit && mmKey && !keptMismatch.has(mmKey) ? mm : undefined;

  async function save() {
    const e = validate(form!, showAmount);
    if (Object.keys(e).length) return setErrors(e);
    setBusy(true);
    setMsg(null);
    try {
      await api('PUT', `/orders/${id}`, toInput(form!, showAmount));
      setMsg({ kind: 'ok', text: o!.is_printed ? 'Saved. This order was already printed – download its label again.' : 'Changes saved.' });
      refreshLists();
    } catch (err) {
      const ae = err as ApiError;
      setErrors(ae.fields);
      setMsg({ kind: 'danger', text: ae.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await api('DELETE', `/orders/${id}`);
      refreshLists();
      back();
    } catch (err) {
      setMsg({ kind: 'danger', text: (err as ApiError).message });
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await api('POST', `/orders/${id}/restore`);
      refreshLists();
      setMsg({ kind: 'ok', text: 'Order restored.' });
    } catch (err) {
      setMsg({ kind: 'danger', text: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title={`Order #${o.id}`}
      footer={
        o.deleted_at ? (
          admin ? <Button title="Restore order" onPress={restore} loading={busy} /> : null
        ) : canEdit ? (
          <View>
            <Row>
              <Button title="Save changes" onPress={save} loading={busy && !confirmDelete} style={{ flex: 1.6 }} />
              {canDelete ? (
                <Button kind="danger" title={confirmDelete ? 'Tap again to delete' : 'Delete'} onPress={remove} style={{ flex: 1 }} />
              ) : null}
            </Row>
          </View>
        ) : null
      }
    >
      <Pressable onPress={back} style={{ marginBottom: 10 }}>
        <Text style={{ color: C.action, fontSize: 15, fontWeight: '600' }}>‹ Back</Text>
      </Pressable>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Pill kind={o.deleted_at ? 'danger' : o.is_printed ? 'ok' : 'warn'} text={o.deleted_at ? 'Deleted' : o.is_printed ? 'Printed' : 'Not printed'} />
        <Muted>
          Saved by {o.created_by_name} · {dayTime(o.created_at)}
        </Muted>
      </Row>
      {o.is_printed && canEdit ? <Banner text="Already printed – reprint after editing." /> : null}
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
      {!canEdit && !o.deleted_at ? <Banner kind="info" text="You can view this order but not edit it." /> : null}

      <ToPreview order={formToLabel(form)} />
      <AddressNotes
        check={pin.check}
        failed={pin.failed}
        unused={canEdit ? unused : []}
        onAddToAddress={(l) => change('address', [form.address.trim(), l].filter(Boolean).join(', '))}
        onIgnore={(l) => setIgnored((s) => new Set(s).add(l))}
        mismatch={mismatch}
        onUsePincode={() => {
          if (mm?.district) change('district', mm.district.pincode);
          if (mm?.state) change('state', mm.state.pincode);
        }}
        onKeepTyped={() => setKeptMismatch((k) => new Set(k).add(mmKey))}
      />

      <View pointerEvents={canEdit ? 'auto' : 'none'} style={{ opacity: canEdit ? 1 : 0.85 }}>
        <OrderForm
          value={form}
          onChange={change}
          errors={errors}
          highlight={pin.check?.warnings.map((w) => w.field) ?? []}
          showAmount={showAmount}
        />
      </View>

      <Card style={{ marginTop: 6 }}>
        <Pressable onPress={() => setShowRaw((v) => !v)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, color: C.text }}>Original WhatsApp message</Text>
          <Text style={{ color: C.muted }}>{showRaw ? 'Hide' : 'Show'}</Text>
        </Pressable>
        {showRaw ? (
          <Text selectable style={{ marginTop: 12, color: C.text, fontSize: 14, lineHeight: 20 }}>
            {o.raw_message || '(typed by hand, nothing pasted)'}
          </Text>
        ) : null}
      </Card>
      {canEdit && !canDelete ? <Muted style={{ textAlign: 'center' }}>Only the owner can delete orders.</Muted> : null}
    </Page>
  );
}
