import { View } from 'react-native';
import { Field, Input, Row, Segmented } from './ui';
import type { Order, OrderInput, PaymentType } from '@shared/types';
import { DEFAULT_PAYMENT, FEATURES, effectivePayment } from '@shared/features';

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
}
export type FormKey = keyof FormState;

export const emptyForm = (): FormState => ({
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
  payment_type: DEFAULT_PAYMENT,
  amount: '',
});

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
  };
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
  };
  if (showAmount) out.amount = f.amount.trim() ? Number(f.amount.replace(/[,₹\s]/g, '')) : null;
  return out;
}

/** Quick checks in the app (BRD ORD-06). The server checks the same rules again. */
export function validate(f: FormState, showAmount: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.ship_name.trim()) e.ship_name = 'Enter name';
  if (!f.address.trim()) e.address = 'Enter address';
  if (!/^[1-9]\d{5}$/.test(f.pincode.replace(/\s/g, ''))) e.pincode = '6 digits, not starting with 0';
  const m1 = f.mobile1.replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
  if (!/^[6-9]\d{9}$/.test(m1)) e.mobile1 = '10 digits, starting 6–9';
  if (f.mobile2.trim()) {
    const m2 = f.mobile2.replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
    if (!/^[6-9]\d{9}$/.test(m2)) e.mobile2 = '10 digits, starting 6–9';
  }
  const amt = f.amount.replace(/[,₹\s]/g, '');
  // Amount is optional. It is required only for COD, and COD is switched off for now (shared/features.ts).
  if (showAmount && amt && !(Number(amt) >= 0)) e.amount = 'Enter a number, e.g. 1299';
  if (showAmount && FEATURES.cod && f.payment_type === 'COD' && !(Number(amt) > 0)) e.amount = 'Enter COD amount';
  return e;
}

export function OrderForm({
  value,
  onChange,
  errors,
  highlight = [],
  showAmount,
  twoCol,
}: {
  value: FormState;
  onChange: (key: FormKey, v: string) => void;
  errors: Record<string, string>;
  highlight?: string[];
  showAmount: boolean;
  twoCol?: boolean;
}) {
  const f = value;
  const hl = (k: FormKey) => highlight.includes(k);
  const input = (k: FormKey, extra: Record<string, unknown> = {}) => (
    <Input value={f[k] as string} onChangeText={(v) => onChange(k, v)} error={!!errors[k]} highlight={hl(k)} {...extra} />
  );
  const half = { flex: 1 };
  return (
    <View>
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
        <Field label="Size" error={errors.size} style={half}>
          {input('size', { placeholder: 'e.g. 9' })}
        </Field>
      </Row>
      <View style={twoCol ? { flexDirection: 'row', gap: 10 } : undefined}>
        <Field label="Product name (optional)" error={errors.product_name} style={twoCol ? half : undefined}>
          {input('product_name', { placeholder: 'e.g. Kolhapuri Kurundwad' })}
        </Field>
        <Field label="Note (optional)" error={errors.note} style={twoCol ? half : undefined}>
          {input('note', { placeholder: 'e.g. RED' })}
        </Field>
      </View>
      {FEATURES.cod ? (
        <Row>
          <Field label="Payment" style={half}>
            <Segmented
              options={[
                { value: 'COD', label: 'COD' },
                { value: 'PREPAID', label: 'Prepaid' },
              ]}
              value={f.payment_type}
              onChange={(v) => onChange('payment_type', v)}
            />
          </Field>
          {showAmount ? (
            <Field label="Amount (₹)" required={f.payment_type === 'COD'} error={errors.amount} style={half}>
              {input('amount', { keyboardType: 'decimal-pad', placeholder: f.payment_type === 'COD' ? '1299' : 'Optional' })}
            </Field>
          ) : (
            <View style={half} />
          )}
        </Row>
      ) : showAmount ? (
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
