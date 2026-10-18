import { StyleSheet, Text, View } from 'react-native';
import { fromLines, orderLine, toLines, type LabelOrder, type LabelShop } from '@shared/label';
import { C } from '@/lib/theme';

/** A small picture of one A4 page (2 labels), drawn from the same text the Word file uses. */
export function PagePreview({ labels, shop, scale = 1 }: { labels: (LabelOrder | null)[]; shop: LabelShop; scale?: number }) {
  const f = (n: number) => n * scale;
  return (
    <View style={[st.page, { padding: f(10) }]}>
      {[0, 1].map((i) => {
        const o = labels[i];
        return (
          <View key={i} style={{ flex: 1 }}>
            {o ? (
              <>
                <Text style={[st.t, st.b, st.r, { fontSize: f(7) }]}>TO, {o.ship_name}</Text>
                {toLines(o).map((l, j) => (
                  <Text key={j} style={[st.t, st.r, { fontSize: f(6) }]} numberOfLines={1}>
                    {l}
                  </Text>
                ))}
                <Text style={[st.t, st.b, st.r, { fontSize: f(6.5), marginTop: f(3) }]} numberOfLines={2}>
                  {orderLine(o)}
                </Text>
                <View style={[st.dash, { marginVertical: f(4) }]} />
                <FromBlock shop={shop} size={f(6)} />
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
  page: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1', aspectRatio: 210 / 297, flex: 1 },
  t: { color: '#000' },
  b: { fontWeight: '700' },
  r: { textAlign: 'right' },
  dash: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#000' },
});
