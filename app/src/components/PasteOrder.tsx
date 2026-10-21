// Paste a WhatsApp message -> fields fill -> check the label -> Save.
// Used by the Home screen. All checks run before Save:
//   - required fields (name, address, 6-digit pincode, 10-digit mobile, mobile 2 not the same)
//   - India Post pincode check (red note when the pincode does not exist)
//   - "Not used" lines: text from the message that ended up in no field
// Warnings never block: the first Save tap shows them, the second tap ("Checked – Save") saves.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { usePermission } from '@/lib/auth';
import { Banner, Button, Field, Input, Pill, Row } from '@/components/ui';
import { OrderForm, emptyForm, formToLabel, toInput, validate, type FormKey, type FormState } from '@/components/OrderForm';
import { DuplicateSheet } from '@/components/DuplicateSheet';
import { ToPreview } from '@/components/LabelPreview';
import { AddressNotes, mismatchKey, mismatchText, usePinCheck } from '@/components/AddressChecks';
import { findUnused, parseWhatsApp, type ParseResult } from '@shared/parser';
import { C, R } from '@/lib/theme';
import type { DuplicateMatch, Order } from '@shared/types';

const PARSED_KEYS = ['ship_name', 'address', 'landmark', 'district', 'state', 'pincode', 'mobile1', 'mobile2', 'size'] as const;

export function usePasteOrder() {
  const qc = useQueryClient();
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
  const [clipNote, setClipNote] = useState('');
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [ackKey, setAckKey] = useState<string | null>(null);
  const [askAck, setAskAck] = useState(false);
  const [keptMismatch, setKeptMismatch] = useState<Set<string>>(new Set());
  // Fields filled from the pincode (not typed / pasted): replaced again if the pincode changes.
  const [autoFilled, setAutoFilled] = useState<Set<FormKey>>(new Set());
  // One id per filled form: a double tap or network retry can never save twice.
  const requestId = useRef(Crypto.randomUUID());

  const pin = usePinCheck(form);
  const unused = useMemo(
    () => (raw.trim() ? findUnused(raw, form as unknown as Record<string, string>).filter((l) => !ignored.has(l)) : []),
    [raw, form, ignored],
  );

  // Empty District / State are filled from the India Post list. A District / State that the message
  // has but that does not match the pincode is NOT changed: the person is asked first (see mismatch).
  useEffect(() => {
    const c = pin.check;
    if (!c?.found) return;
    const guessedState = parsed?.guessed.includes('state') ?? false;
    const f = form;
    const filled = new Set(autoFilled);
    let district = f.district;
    let state = f.state;
    // Not when the address names another district: then the person is asked first.
    if (!touched.has('district') && !f.district.trim() && c.districts.length === 1 && !c.mismatch?.district) {
      district = c.districts[0];
      filled.add('district');
    }
    if (!touched.has('state') && c.state && (!f.state.trim() || guessedState) && c.state !== f.state) {
      state = c.state;
      filled.add('state');
    }
    if (district === f.district && state === f.state) return;
    setForm((cur) => ({ ...cur, district, state }));
    setAutoFilled(filled);
    // Runs only when a new pincode result arrives (the fields it fills must not re-trigger it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.check]);

  function applyPaste(text: string) {
    setRaw(text);
    setSaved(null);
    setClipNote('');
    setAskAck(false);
    const p = parseWhatsApp(text);
    setParsed(text.trim() ? p : null);
    setForm((f) => {
      const next = { ...f };
      PARSED_KEYS.forEach((k) => {
        if (!touched.has(k) || !f[k]) next[k] = p[k];
      });
      if (p.amount !== null && (!touched.has('amount') || !f.amount)) next.amount = String(p.amount);
      return next;
    });
    setAutoFilled(new Set());
    setErrors({});
  }

  function change(k: FormKey, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched((t) => new Set(t).add(k));
    setAutoFilled((a) => {
      if (!a.has(k)) return a;
      const n = new Set(a);
      n.delete(k);
      return n;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  }

  function clear() {
    setRaw('');
    setForm(emptyForm());
    setTouched(new Set());
    setParsed(null);
    setErrors({});
    setTopError('');
    setIgnored(new Set());
    setAutoFilled(new Set());
    setAckKey(null);
    setAskAck(false);
    setKeptMismatch(new Set());
    requestId.current = Crypto.randomUUID();
  }

  async function pasteFromClipboard() {
    try {
      const t = await Clipboard.getStringAsync();
      if (t?.trim()) {
        clear();
        setSaved(null);
        applyPaste(t);
      } else setClipNote('Nothing copied. In WhatsApp, long-press the customer’s message → Copy, then tap Paste again.');
    } catch {
      setClipNote(Platform.OS === 'web' ? 'Press Ctrl+V in the box below to paste.' : 'Could not read the copied text. Paste it in the box below.');
    }
  }

  const addToAddress = (line: string) => change('address', [form.address.trim(), line].filter(Boolean).join(', '));
  const ignore = (line: string) => setIgnored((s) => new Set(s).add(line));

  // District / State that do not match the pincode: shown until the person picks one.
  const mm = pin.check?.mismatch;
  const mmKey = mismatchKey(pin.check?.pincode ?? '', mm);
  const mismatch = mmKey && !keptMismatch.has(mmKey) ? mm : undefined;
  function applyPincodeValues() {
    if (!mm) return;
    setForm((f) => ({ ...f, district: mm.district?.pincode ?? f.district, state: mm.state?.pincode ?? f.state }));
    setTouched((t) => {
      const n = new Set(t);
      if (mm.district) n.add('district');
      if (mm.state) n.add('state');
      return n;
    });
  }
  const keepTyped = () => setKeptMismatch((k) => new Set(k).add(mmKey));

  // What still needs a look before saving (shown above Save; never blocks).
  const notes = [...(pin.check?.warnings.map((w) => w.text) ?? []), ...(mismatch ? [mismatchText(pin.check!.pincode, mismatch)] : []), ...unused];
  const notesKey = notes.join('\n');
  const needsAck = notes.length > 0 && ackKey !== notesKey;

  async function save(force = false) {
    setTopError('');
    const e = validate(form, showAmount);
    if (Object.keys(e).length) {
      setErrors(e);
      setTopError('Please fill the fields marked in red.');
      return;
    }
    if (needsAck && !force) {
      // First tap: show what needs checking. Second tap saves.
      setAckKey(notesKey);
      setAskAck(true);
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

  const highlight = [
    ...(parsed ? [...parsed.missing, ...parsed.guessed].filter((k) => !touched.has(k as FormKey) && !autoFilled.has(k as FormKey)) : []),
    ...(pin.check?.warnings.map((w) => w.field) ?? []),
    ...(mismatch?.district ? ['district'] : []),
    ...(mismatch?.state ? ['state'] : []),
  ];

  return {
    raw, form, parsed, errors, saving, dup, saved, topError, clipNote, unused, pin, showAmount, askAck: askAck && notes.length > 0,
    noteCount: notes.length, highlight, autoFilled, needsAck, mismatch, applyPincodeValues, keepTyped,
    applyPaste, change, clear, pasteFromClipboard, addToAddress, ignore, save, setDup,
    label: formToLabel(form),
  };
}

export type PasteOrderState = ReturnType<typeof usePasteOrder>;

/** Big paste button + the message box. */
export function PasteBox({ s, wide }: { s: PasteOrderState; wide?: boolean }) {
  const has = !!(s.raw || s.form.ship_name);
  return (
    <View>
      <Pressable onPress={s.pasteFromClipboard} style={({ pressed }) => [st.pasteBig, pressed && { opacity: 0.85 }]}>
        <Text style={st.pasteBigText}>📋  Paste from WhatsApp</Text>
        <Text style={st.pasteBigSub}>Copy the customer’s address message, then tap here</Text>
      </Pressable>
      {s.clipNote ? <Banner kind="info" text={s.clipNote} /> : null}
      <Field label="Message">
        <Input
          value={s.raw}
          onChangeText={s.applyPaste}
          multiline
          placeholder={'…or paste / type the message here'}
          style={[st.paste, wide && { minHeight: 200 }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </Field>
      <Row style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: -4, marginBottom: 12 }}>
        {s.parsed ? (
          <Pill
            kind={s.parsed.missing.length ? 'warn' : 'ok'}
            text={s.parsed.missing.length ? `${s.parsed.filled.length} filled · check highlighted` : `${s.parsed.filled.length} fields auto-filled`}
          />
        ) : (
          <View />
        )}
        {has ? (
          <Pressable onPress={s.clear} hitSlop={10}>
            <Text style={{ color: C.muted, fontSize: 15 }}>Clear</Text>
          </Pressable>
        ) : null}
      </Row>
    </View>
  );
}

/** The label as it will print + every warning. */
export function CheckBox({ s }: { s: PasteOrderState }) {
  return (
    <View>
      <ToPreview order={s.label} />
      <AddressNotes
        check={s.pin.check}
        failed={s.pin.failed}
        unused={s.unused}
        onAddToAddress={s.addToAddress}
        onIgnore={s.ignore}
        mismatch={s.mismatch}
        onUsePincode={s.applyPincodeValues}
        onKeepTyped={s.keepTyped}
      />
      {s.autoFilled.size ? (
        <Text style={st.small}>
          {[...s.autoFilled].map((k) => (k === 'district' ? 'District' : 'State')).join(' and ')} set from the pincode.
        </Text>
      ) : null}
    </View>
  );
}

export function PasteForm({ s, twoCol }: { s: PasteOrderState; twoCol?: boolean }) {
  return <OrderForm value={s.form} onChange={s.change} errors={s.errors} highlight={s.highlight} showAmount={s.showAmount} twoCol={twoCol} />;
}

/** Save button (and the "Saved" banner) for the screen footer. */
export function SaveBar({ s }: { s: PasteOrderState }) {
  return (
    <View>
      {s.saved ? (
        <Pressable onPress={() => router.push(`/order/${s.saved!.id}`)}>
          <Banner kind="ok" title={`Saved #${s.saved.id} · ${s.saved.ship_name}`} text="Ready for the next order. Tap to view this one." />
        </Pressable>
      ) : null}
      {s.topError ? <Banner kind="danger" text={s.topError} /> : null}
      {s.askAck ? (
        <Banner
          kind="warn"
          text={`Check the ${s.noteCount === 1 ? 'orange / red note' : `${s.noteCount} orange / red notes`} above the form. If the label is right, tap Save again.`}
        />
      ) : null}
      <Button
        title={s.askAck ? 'Checked – Save order' : 'Save order'}
        onPress={() => s.save(false)}
        loading={s.saving && !s.dup}
        disabled={s.saving}
      />
    </View>
  );
}

export function PasteDuplicate({ s }: { s: PasteOrderState }) {
  return (
    <DuplicateSheet
      visible={!!s.dup}
      message={s.dup?.message ?? ''}
      matches={s.dup?.matches ?? []}
      canOverride={!!s.dup?.canOverride}
      saving={s.saving}
      onCancel={() => s.setDup(null)}
      onView={(id) => {
        s.setDup(null);
        router.push(`/order/${id}`);
      }}
      onSaveAnyway={() => s.save(true)}
    />
  );
}

const st = StyleSheet.create({
  pasteBig: { backgroundColor: C.action, borderRadius: R.card, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', marginBottom: 12 },
  pasteBigText: { color: C.onAction, fontSize: 20, fontWeight: '800' },
  pasteBigSub: { color: C.onActionSub, fontSize: 13, marginTop: 4 },
  paste: {
    minHeight: 90,
    maxHeight: 360,
    paddingTop: 12,
    textAlignVertical: 'top',
    backgroundColor: C.tint,
    borderStyle: 'dashed',
    borderColor: C.action,
    borderRadius: R.input,
    fontSize: 15,
  },
  small: { color: C.muted, fontSize: 13, marginTop: -2, marginBottom: 10 },
});
