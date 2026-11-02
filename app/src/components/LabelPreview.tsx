import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  codAmountLines,
  codFromLines,
  codHeadLines,
  codItemLine,
  fromLines,
  orderLine,
  toLines,
  type LabelOrder,
  type LabelShop,
} from '@shared/label';
import type { ShopSettings } from '@shared/types';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

/** Every line of a COD label, top to bottom, as the Word file prints it. */
function codRows(o: LabelOrder, shop: LabelShop | null) {
  const item = codItemLine(o);
  return {
    head: codHeadLines(o),
    amount: codAmountLines(o),
    item,
    to: toLines(o),
    from: shop ? codFromLines(o, shop) : o.sender_name || o.sender_address ? codFromLines(o, { shop_name: '', address1: '', city_pin: '', phones: '' }) : [],
  };
}

/**
 * A small picture of one A4 page, drawn from the same text the Word file uses:
 * two equal halves with a dashed cut line between them; in each half TO (right) at the top, the
 * COD / PREPAID line under it and From (left) right after – the rest stays blank for cutting.
 */
export function PagePreview({ labels, shop, scale = 1 }: { labels: (LabelOrder | null)[]; shop: LabelShop; scale?: number }) {
  const f = (n: number) => n * scale;
  return (
    <View style={st.page}>
      {[0, 1].map((i) => {
        const o = labels[i];
        return (
          <View key={i} style={[st.half, { padding: f(8), paddingTop: i === 0 ? f(8) : f(14) }, i === 0 && st.cut]}>
            {o && o.payment_type === 'COD' ? (
              <CodPage o={o} shop={shop} f={f} />
            ) : o ? (
              <>
                <View>
                  <Text style={[st.t, st.b, st.r, { fontSize: f(7) }]}>TO, {o.ship_name}</Text>
                  {toLines(o).map((l, j) => (
                    <Text key={j} style={[st.t, st.r, { fontSize: f(6) }]} numberOfLines={1}>
                      {l}
                    </Text>
                  ))}
                  <Text style={[st.t, st.b, st.r, { fontSize: f(6.5), marginTop: f(3) }]} numberOfLines={2}>
                    {orderLine(o)}
                  </Text>
                </View>
                <View style={{ marginTop: f(5) }}>
                  <FromBlock shop={shop} size={f(6)} />
                </View>
              </>
            ) : (
              <Text style={[st.t, { fontSize: f(6), color: C.placeholder, textAlign: 'center', marginTop: f(40) }]}>(bottom half empty)</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** One COD half on the small A4 picture. */
function CodPage({ o, shop, f }: { o: LabelOrder; shop: LabelShop; f: (n: number) => number }) {
  const r = codRows(o, shop);
  const line = (l: string, j: number, extra: object = {}) => (
    <Text key={j} style={[st.t, st.r, { fontSize: f(5) }, extra]} numberOfLines={1}>
      {l}
    </Text>
  );
  return (
    <>
      <View>
        {r.head.map((l, j) => line(l, j, j === 3 ? st.b : {}))}
        <View style={{ marginTop: f(2) }}>{r.amount.map((l, j) => line(l, j, j === 0 ? st.b : {}))}</View>
        {r.item ? line(r.item, 0) : null}
        <Text style={[st.t, st.b, st.r, { fontSize: f(5.5), marginTop: f(2) }]} numberOfLines={1}>
          TO, {o.ship_name}
        </Text>
        {r.to.map((l, j) => line(l, j))}
      </View>
      <View style={{ marginTop: f(3) }}>
        <Text style={[st.t, st.b, { fontSize: f(5), textDecorationLine: 'underline' }]}>From :-</Text>
        {r.from.map((l, j) => (
          <Text key={j} style={[st.t, { fontSize: f(5) }]} numberOfLines={1}>
            {l}
          </Text>
        ))}
      </View>
    </>
  );
}

/**
 * The TO block of one label exactly as it will be printed (same lines as the Word file):
 * shown on the paste screen so the person saving checks the real label, not just the fields.
 */
export function ToPreview({ order }: { order: LabelOrder }) {
  const empty = !order.ship_name && !order.address;
  const cod = order.payment_type === 'COD';
  // The shop's address is the COD "From" when no sender was given (same query the print screen uses).
  const shop = useQuery({ queryKey: ['shop'], queryFn: () => api<ShopSettings>('GET', '/shop'), enabled: cod, staleTime: 5 * 60_000 });
  if (cod) {
    const r = codRows(order, shop.data ?? null);
    return (
      <View style={st.paper}>
        <Text style={st.paperTag}>WILL PRINT · COD</Text>
        {r.head.map((l, j) => (
          <Text key={`h${j}`} style={[st.t, st.r, st.small, j === 3 && st.b]}>
            {l}
          </Text>
        ))}
        {r.amount.map((l, j) => (
          <Text key={`a${j}`} style={[st.t, st.r, st.line, j === 0 ? [st.b, { marginTop: 6 }] : st.small]}>
            {l}
          </Text>
        ))}
        {r.item ? <Text style={[st.t, st.r, st.small]}>{r.item}</Text> : null}
        {empty ? (
          <Text style={[st.t, { color: C.placeholder, textAlign: 'center', paddingVertical: 12 }]}>The address appears here after you paste</Text>
        ) : (
          <>
            <Text style={[st.t, st.b, st.r, st.line, { marginTop: 8 }]}>TO, {order.ship_name || '—'}</Text>
            {r.to.map((l, j) => (
              <Text key={`t${j}`} style={[st.t, st.r, st.line]}>
                {l}
              </Text>
            ))}
          </>
        )}
        <Text style={[st.t, st.b, st.small, { marginTop: 8, textDecorationLine: 'underline' }]}>From :-</Text>
        {r.from.map((l, j) => (
          <Text key={`f${j}`} style={[st.t, st.small]}>
            {l}
          </Text>
        ))}
      </View>
    );
  }
  return (
    <View style={st.paper}>
      <Text style={st.paperTag}>WILL PRINT</Text>
      {empty ? (
        <Text style={[st.t, { color: C.placeholder, textAlign: 'center', paddingVertical: 18 }]}>The label appears here after you paste</Text>
      ) : (
        <View>
          <Text style={[st.t, st.b, st.r, st.line]}>TO, {order.ship_name || '—'}</Text>
          {toLines(order).map((l, j) => (
            <Text key={j} style={[st.t, st.r, st.line]}>
              {l}
            </Text>
          ))}
          <Text style={[st.t, st.b, st.r, st.line, { marginTop: 6 }]}>{orderLine(order)}</Text>
        </View>
      )}
    </View>
  );
}

export function FromBlock({ shop, size = 15 }: { shop: LabelShop; size?: number }) {
  return (
    <View>
      <Text style={[st.t, st.b, { fontSize: size, textDecorationLine: 'underline' }]}>From :-</Text>
      {fromLines(shop).map((l, i) => (
        <Text key={i} style={[st.t, { fontSize: size, lineHeight: size * 1.35 }]}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  page: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.inputBorder, aspectRatio: 210 / 297, flex: 1 },
  half: { flex: 1, justifyContent: 'flex-start' },
  cut: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#000' },
  t: { color: '#000' },
  b: { fontWeight: '700' },
  r: { textAlign: 'right' },
  paper: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.checkBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 12,
    marginBottom: 12,
  },
  paperTag: { position: 'absolute', top: 6, left: 10, fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.5 },
  line: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
});
