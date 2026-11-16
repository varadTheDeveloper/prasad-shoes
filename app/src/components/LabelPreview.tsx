import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fromLines, headLines, labelOrderLine, toLines, type LabelOrder, type LabelShop } from '@shared/label';
import type { ShopSettings } from '@shared/types';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Every line of a label (COD or Prepaid), top to bottom, as the Word file prints it (From = the shop). */
function labelRows(o: LabelOrder, shop: LabelShop | null) {
  return { head: headLines(o), to: toLines(o), line: labelOrderLine(o), from: shop ? fromLines(shop) : [] };
}

/**
 * A small picture of one A4 page, drawn from the same text the Word file uses:
 * two equal halves with a dashed cut line between them; each label sits in the middle of its half
 * (header lines centred, TO right, the COD / PREPAID line, From left).
 */
export function PagePreview({ labels, shop, scale = 1 }: { labels: (LabelOrder | null)[]; shop: LabelShop; scale?: number }) {
  const f = (n: number) => n * scale;
  return (
    <View style={st.page}>
      {[0, 1].map((i) => {
        const o = labels[i];
        return (
          <View key={i} style={[st.half, { padding: f(10) }, i === 0 && st.cut]}>
            {o ? (
              <LabelHalf o={o} shop={shop} f={f} />
            ) : (
              <Text style={[st.t, { fontSize: f(6), color: C.placeholder, textAlign: 'center' }]}>{t('(bottom half empty)')}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** One label (COD or Prepaid) on the small A4 picture. */
function LabelHalf({ o, shop, f }: { o: LabelOrder; shop: LabelShop; f: (n: number) => number }) {
  const r = labelRows(o, shop);
  const t = (l: string, j: number, extra: object[] = []) => (
    <Text key={j} style={[st.t, { fontSize: f(5) }, ...extra]} numberOfLines={1}>
      {l}
    </Text>
  );
  return (
    <>
      <View>
        {r.head.map((l, j) => t(l, j, [st.c, j === 1 || j === 3 ? st.b : {}]))}
        <Text style={[st.t, st.b, st.r, { fontSize: f(5.5), marginTop: f(3) }]} numberOfLines={1}>
          TO, {o.ship_name}
        </Text>
        {r.to.map((l, j) => t(l, j, [st.r]))}
        <Text style={[st.t, st.b, st.r, { fontSize: f(5.5), marginTop: f(2) }]} numberOfLines={2}>
          {r.line}
        </Text>
      </View>
      <View style={{ marginTop: f(4) }}>
        <Text style={[st.t, st.b, { fontSize: f(5), textDecorationLine: 'underline' }]}>From :-</Text>
        {r.from.map((l, j) => t(l, j))}
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
  // "From" is always the shop (same query the print screen uses).
  const shop = useQuery({ queryKey: ['shop'], queryFn: () => api<ShopSettings>('GET', '/shop'), staleTime: 5 * 60_000 });
  const r = labelRows(order, shop.data ?? null);
  return (
    <View style={st.paper}>
      <Text style={st.paperTag}>{cod ? t('WILL PRINT · COD') : t('WILL PRINT · PREPAID')}</Text>
      {r.head.map((l, j) => (
        <Text key={`h${j}`} style={[st.t, st.c, st.small, (j === 1 || j === 3) && st.b]}>
          {l}
        </Text>
      ))}
      {empty ? (
        <Text style={[st.t, { color: C.placeholder, textAlign: 'center', paddingVertical: 12 }]}>{t('The address appears here after you paste')}</Text>
      ) : (
        <>
          <Text style={[st.t, st.b, st.r, st.line, { marginTop: 8 }]}>TO, {order.ship_name || '—'}</Text>
          {r.to.map((l, j) => (
            <Text key={`t${j}`} style={[st.t, st.r, st.line]}>
              {l}
            </Text>
          ))}
          <Text style={[st.t, st.b, st.r, st.line, { marginTop: 6 }]}>{r.line}</Text>
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
  half: { flex: 1, justifyContent: 'center' },
  cut: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#000' },
  t: { color: '#000' },
  b: { fontWeight: '700' },
  r: { textAlign: 'right' },
  c: { textAlign: 'center' },
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
