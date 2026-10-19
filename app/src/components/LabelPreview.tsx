import { StyleSheet, Text, View } from 'react-native';
import { fromLines, orderLine, toLines, type LabelOrder, type LabelShop } from '@shared/label';
import { C } from '@/lib/theme';

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
            {o ? (
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
  half: { flex: 1, justifyContent: 'flex-start' },
  cut: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#000' },
  t: { color: '#000' },
  b: { fontWeight: '700' },
  r: { textAlign: 'right' },
});
