import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { usePermission } from '@/lib/auth';
import { Banner, Button, Card, Field, Input, Page, Pill, Row, useWide } from '@/components/ui';
import { OrderForm, emptyForm, toInput, validate, type FormKey, type FormState } from '@/components/OrderForm';
import { DuplicateSheet } from '@/components/DuplicateSheet';
import { parseWhatsApp, type ParseResult } from '@shared/parser';
import { C, R } from '@/lib/theme';
import type { DuplicateMatch, Order } from '@shared/types';

/** Screen 4 · New order: paste & save. */
export default function NewOrder() {
  const qc = useQueryClient();
  const wide = useWide();
  const showAmount = usePermission('ORDER_VIEW_AMOUNT');

  const [raw, setRaw] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [touched, setTouched] = useState<Set<FormKey>>(new Set());
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<{ message: string; matches: DuplicateMatch[]; canOverride: boolean } | null>(null);
  const [saved, setSaved] = useState<Order | null>(null);
  const [topError, setTopError] = useState('');
  // One id per filled form: a double tap or network retry can never save twice.
  const requestId = useRef(Crypto.randomUUID());

  function applyPaste(text: string) {
    setRaw(text);
    setSaved(null);
    const p = parseWhatsApp(text);
    setParsed(text.trim() ? p : null);
    setForm((f) => {
      const next = { ...f };
      (['ship_name', 'address', 'landmark', 'district', 'state', 'pincode', 'mobile1', 'mobile2', 'size'] as const).forEach((k) => {
        if (!touched.has(k) || !f[k]) next[k] = p[k];
      });
      if (p.amount !== null && (!touched.has('amount') || !f.amount)) next.amount = String(p.amount);
      return next;
    });
    setErrors({});
  }

  function change(k: FormKey, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched((t) => new Set(t).add(k));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  }

  function clear() {
    setRaw('');
    setForm(emptyForm());
    setTouched(new Set());
    setParsed(null);
    setErrors({});
    setTopError('');
    requestId.current = Crypto.randomUUID();
  }

  async function pasteFromClipboard() {
    const t = await Clipboard.getStringAsync();
    if (t) applyPaste(t);
  }

  async function save(force = false) {
    setTopError('');
    const e = validate(form, showAmount);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setSaving(true);
    try {
      const order = await api<Order>('POST', '/orders', {
        ...toInput(form, showAmount),
        raw_message: raw,
        client_request_id: requestId.current,
        force: force || undefined,
      });
      setDup(null);
      clear();
      setSaved(order);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    } catch (err) {
      const ae = err as ApiError;
      if (ae.code === 'DUPLICATE') {
        setDup({ message: ae.message, matches: ae.extra.matches ?? [], canOverride: !!ae.extra.canOverride });
      } else if (ae.code === 'VALIDATION') {
        setErrors(ae.fields);
        setTopError(ae.message);
        setDup(null);
      } else {
        setTopError(ae.message);
        setDup(null);
      }
    } finally {
      setSaving(false);
    }
  }

  const highlight = parsed ? [...parsed.missing, ...parsed.guessed].filter((k) => !touched.has(k as FormKey)) : [];
  const filledCount = parsed?.filled.length ?? 0;

  const pasteBox = (
    <View>
      <Field label="Paste WhatsApp message">
        <Input
          value={raw}
          onChangeText={applyPaste}
          multiline
          placeholder={'Copy the customer’s whole reply in WhatsApp\n(Naam, Address, Pincode, Mobile…) and paste it here'}
          style={[st.paste, wide && { minHeight: 420 }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </Field>
      <Row style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: -4, marginBottom: 12 }}>
        {parsed ? (
          <Pill kind={parsed.missing.length ? 'warn' : 'ok'} text={parsed.missing.length ? `${filledCount} filled · check highlighted` : `${filledCount} fields auto-filled`} />
        ) : Platform.OS !== 'web' ? (
          <Pressable onPress={pasteFromClipboard} style={st.pasteBtn}>
            <Text style={st.pasteBtnText}>Paste from clipboard</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {raw || form.ship_name ? (
          <Pressable onPress={clear} hitSlop={10}>
            <Text style={{ color: C.muted, fontSize: 15 }}>Clear</Text>
          </Pressable>
        ) : null}
      </Row>
    </View>
  );

  const formBox = <OrderForm value={form} onChange={change} errors={errors} highlight={highlight} showAmount={showAmount} twoCol={wide} />;

  return (
    <Page
      title="New order"
      wide={wide}
      footer={
        <View>
          {saved ? (
            <Pressable onPress={() => router.push(`/order/${saved.id}`)}>
              <Banner kind="ok" title={`Saved #${saved.id} · ${saved.ship_name}`} text="Form cleared for the next order. Tap to view." />
            </Pressable>
          ) : null}
          <Button title="Save order" onPress={() => save(false)} loading={saving && !dup} disabled={saving} />
        </View>
      }
    >
      {topError ? <Banner kind="danger" text={topError} /> : null}
      {wide ? (
        <Row gap={18} style={{ alignItems: 'flex-start' }}>
          <Card style={{ flex: 1 }}>{pasteBox}</Card>
          <Card style={{ flex: 1.3 }}>{formBox}</Card>
        </Row>
      ) : (
        <>
          {pasteBox}
          {formBox}
        </>
      )}
      <DuplicateSheet
        visible={!!dup}
        message={dup?.message ?? ''}
        matches={dup?.matches ?? []}
        canOverride={!!dup?.canOverride}
        saving={saving}
        onCancel={() => setDup(null)}
        onView={(id) => {
          setDup(null);
          router.push(`/order/${id}`);
        }}
        onSaveAnyway={() => save(true)}
      />
    </Page>
  );
}

const st = StyleSheet.create({
  paste: {
    minHeight: 140,
    maxHeight: 520,
    paddingTop: 12,
    textAlignVertical: 'top',
    backgroundColor: C.tint,
    borderStyle: 'dashed',
    borderColor: C.action,
    borderRadius: R.input,
    fontSize: 15,
  },
  pasteBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.action, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 8 },
  pasteBtnText: { color: C.action, fontWeight: '700' },
});
