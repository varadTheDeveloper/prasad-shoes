import { Text, View } from 'react-native';
import { Field, Input, Row, Segmented } from './ui';
import { DateField } from './DateField';
import type { Order, OrderInput, PaymentType } from '@shared/types';
import type { LabelOrder } from '@shared/label';
import { normaliseMobile } from '@shared/parser';
import { DEFAULT_PAYMENT, FEATURES, effectivePayment } from '@shared/features';
import { COD_FIXED, isIsoDate } from '@shared/cod';
import { todayISO } from '@/lib/format';
import { C } from '@/lib/theme';

export interface FormState {
  ship_name: string;
  address: string;
  landmark: string;
  district: string;
  state: string;
  pincode: string;
  mobile1: string;
  mobile2: string;
  product_name: string;
  size: string;
  note: string;
  payment_type: PaymentType;
  amount: string;
  // COD only
  booking_date: string; // 'YYYY-MM-DD'
  weight: string;
}
export type FormKey = keyof FormState;

export const COD_KEYS = ['booking_date', 'weight'] as const;

export const emptyForm = (type: PaymentType = DEFAULT_PAYMENT): FormState => ({
  ship_name: '',
  address: '',
  landmark: '',
  district: '',
  state: '',
  pincode: '',
  mobile1: '',
  mobile2: '',
  product_name: '',
  size: '',
  note: '',
  payment_type: effectivePayment(type),
  amount: '',
  booking_date: effectivePayment(type) === 'COD' ? todayISO() : '',
  weight: '',
});

/** Prepaid <-> COD on an existing form: Prepaid keeps no COD details; COD gets today's booking date. */
export function withType(f: FormState, type: PaymentType): FormState {
  const t = effectivePayment(type);
  if (t === 'PREPAID') return { ...f, payment_type: t, booking_date: '', weight: '' };
  return { ...f, payment_type: t, booking_date: f.booking_date || todayISO() };
}

export function formFromOrder(o: Order): FormState {
  return {
    ship_name: o.ship_name,
    address: o.address,
    landmark: o.landmark ?? '',
    district: o.district ?? '',
    state: o.state ?? '',
    pincode: o.pincode,
    mobile1: o.mobile1,
    mobile2: o.mobile2 ?? '',
    product_name: o.product_name ?? '',
    size: o.size ?? '',
    note: o.note ?? '',
    payment_type: effectivePayment(o.payment_type),
    amount: o.amount === undefined || o.amount === null ? '' : String(o.amount),
    booking_date: o.booking_date ?? '',
    weight: o.weight ?? '',
  };
}

/** COD details for saving / printing (null for Prepaid). */
function codPart(f: FormState) {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  if (effectivePayment(f.payment_type) !== 'COD') return { booking_date: null, weight: null };
  return { booking_date: n(f.booking_date), weight: n(f.weight) };
}

export function toInput(f: FormState, showAmount: boolean): OrderInput {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  const out: OrderInput = {
    ship_name: f.ship_name.trim(),
    address: f.address.trim(),
    landmark: n(f.landmark),
    district: n(f.district),
    state: n(f.state),
    pincode: f.pincode.replace(/\s/g, ''),
    mobile1: f.mobile1,
    mobile2: n(f.mobile2),
    product_name: n(f.product_name),
    size: n(f.size),
    note: n(f.note),
    payment_type: effectivePayment(f.payment_type),
    ...codPart(f),
  };
  if (showAmount) out.amount = f.amount.trim() ? Number(f.amount.replace(/[,₹\s]/g, '')) : null;
  return out;
}

/** The form as it will print on the label (same text the Word file uses). */
export function formToLabel(f: FormState): LabelOrder {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  return {
    ship_name: f.ship_name.trim(),
    address: f.address.trim(),
    landmark: n(f.landmark),
    district: n(f.district),
    state: n(f.state),
    pincode: f.pincode.replace(/\s/g, ''),
    mobile1: normaliseMobile(f.mobile1) || f.mobile1.trim(),
    mobile2: f.mobile2.trim() ? normaliseMobile(f.mobile2) || f.mobile2.trim() : null,
    product_name: n(f.product_name),
    size: n(f.size),
    note: n(f.note),
    payment_type: effectivePayment(f.payment_type),
    amount: f.amount.trim() ? Number(f.amount.replace(/[,₹\s]/g, '')) : null,
    ...codPart(f),
  };
}

/** Quick checks in the app (BRD ORD-06). The server checks the same rules again. */
export function validate(f: FormState, showAmount: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.ship_name.trim()) e.ship_name = 'Enter name';
  if (!f.address.trim()) e.address = 'Enter address';
  if (!/^[1-9]\d{5}$/.test(f.pincode.replace(/\s/g, ''))) e.pincode = '6 digits, not starting with 0';
  const m1 = f.mobile1.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^\d{10}$/.test(m1)) e.mobile1 = 'Enter 10 digits';
  if (f.mobile2.trim()) {
    const m2 = f.mobile2.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (!/^\d{10}$/.test(m2)) e.mobile2 = 'Enter 10 digits';
    else if (m2 === m1) e.mobile2 = 'Same as Mobile 1 – leave empty or enter another number';
  }
  const amt = f.amount.replace(/[,₹\s]/g, '');
  // Amount is optional. It is required only for COD, and COD is switched off for now (shared/features.ts).
  if (showAmount && amt && !(Number(amt) >= 0)) e.amount = 'Enter a number, e.g. 1299';
  if (showAmount && FEATURES.cod && f.payment_type === 'COD' && !(Number(amt) > 0)) e.amount = 'Enter COD amount';
  if (f.payment_type === 'COD' && f.booking_date && !isIsoDate(f.booking_date)) e.booking_date = 'Pick a booking date';
  return e;
}

export function OrderForm({
  value,
  onChange,
  errors,
  highlight = [],
  showAmount,
  twoCol,
  typePicker,
}: {
  value: FormState;
  onChange: (key: FormKey, v: string) => void;
  errors: Record<string, string>;
  highlight?: string[];
  showAmount: boolean;
  twoCol?: boolean;
  /** Show Prepaid / COD buttons inside the form (order edit screen; the paste screen has its own). */
  typePicker?: boolean;
}) {
  const f = value;
  const hl = (k: FormKey) => highlight.includes(k);
  const input = (k: FormKey, extra: Record<string, unknown> = {}) => (
    <Input value={f[k] as string} onChangeText={(v) => onChange(k, v)} error={!!errors[k]} highlight={hl(k)} {...extra} />
  );
  const half = { flex: 1 };
  // Order on screen (client's wish): Prepaid = Product + Size first, then the receiver.
  // COD = COD details first, then Product + Size, then the receiver. Labels / printing are not affected.
  return (
    <View>
      {FEATURES.cod && typePicker ? (
        <Field label="Shipment type">
          <TypeButtons value={f.payment_type} onChange={(v) => onChange('payment_type', v)} />
        </Field>
      ) : null}
      {f.payment_type === 'COD' ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>COD details</Text>
          <Text style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
            Prints on every COD label: Booking Under {COD_FIXED.bookingUnder} · Customer ID {COD_FIXED.customerId} · Contract ID{' '}
            {COD_FIXED.contractId} · {COD_FIXED.hub}. From is always the shop. Size + Note print as “COD 1999 (Size 8 …)”.
          </Text>
          <Row>
            {showAmount ? (
              <Field label="COD amount (₹)" required error={errors.amount} style={half}>
                {input('amount', { keyboardType: 'decimal-pad', placeholder: '1299' })}
              </Field>
            ) : (
              <View style={half} />
            )}
            <Field label="Weight" error={errors.weight} style={half}>
              {input('weight', { placeholder: 'e.g. 800 g' })}
            </Field>
          </Row>
          <Field label="Booking date" error={errors.booking_date}>
            <View style={hl('booking_date') ? { borderRadius: 8, backgroundColor: C.tint } : undefined}>
              <DateField label="" value={f.booking_date} onChange={(v) => onChange('booking_date', v)} placeholder="Pick date" />
            </View>
          </Field>
        </View>
      ) : null}
      <Row>
        <Field label="Product name (optional)" error={errors.product_name} style={half}>
          {input('product_name', { placeholder: 'e.g. Kolhapuri Kurundwad' })}
        </Field>
        <Field label="Size" error={errors.size} style={half}>
          {input('size', { placeholder: 'e.g. 9' })}
        </Field>
      </Row>
      <Field label="Name" required error={errors.ship_name}>
        {input('ship_name', { autoCapitalize: 'words' })}
      </Field>
      <Field label="Address" required error={errors.address}>
        {input('address', { multiline: true, style: { minHeight: 64, paddingTop: 12, textAlignVertical: 'top' } })}
      </Field>
      <Field label="Landmark" error={errors.landmark}>
        {input('landmark', { placeholder: 'Near school / road / chowk' })}
      </Field>
      <Row>
        <Field label="Pincode" required error={errors.pincode} style={half}>
          {input('pincode', { keyboardType: 'number-pad', maxLength: 7 })}
        </Field>
        <Field label="Mobile 1" required error={errors.mobile1} style={half}>
          {input('mobile1', { keyboardType: 'phone-pad', maxLength: 14 })}
        </Field>
      </Row>
      <Row>
        <Field label="District" error={errors.district} style={half}>
          {input('district')}
        </Field>
        <Field label="State" error={errors.state} style={half}>
          {input('state')}
        </Field>
      </Row>
      <Row>
        <Field label="Mobile 2" error={errors.mobile2} style={half}>
          {input('mobile2', { keyboardType: 'phone-pad', placeholder: 'Optional', maxLength: 14 })}
        </Field>
        <Field label="Note (optional)" error={errors.note} style={half}>
          {input('note', { placeholder: 'e.g. RED' })}
        </Field>
      </Row>
      {f.payment_type !== 'COD' && showAmount ? (
        <Row>
          <Field label="Amount (₹, optional)" error={errors.amount} style={half}>
            {input('amount', { keyboardType: 'decimal-pad', placeholder: 'Optional' })}
          </Field>
          <View style={half} />
        </Row>
      ) : null}
    </View>
  );
}

/** The two shipment-type buttons: Prepaid | COD. */
export function TypeButtons({ value, onChange }: { value: PaymentType; onChange: (v: PaymentType) => void }) {
  return (
    <Segmented
      options={[
        { value: 'PREPAID', label: 'Prepaid' },
        { value: 'COD', label: 'COD' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}
