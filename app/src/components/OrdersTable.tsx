// Owner's "Table" view of the Orders screen: one line per order, for checking (no ticks).
// Same paged data as the List (50 at a time). Fixed row height = smooth scrolling with many rows.
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { C } from '@/lib/theme';
import { dateTime } from '@/lib/format';
import type { Order } from '@shared/types';

const ROW = 46;
const COLS = [
  { key: 'name', title: 'Customer', w: 170 },
  { key: 'date', title: 'Date', w: 150 },
  { key: 'address', title: 'Address', w: 300 },
  { key: 'mobile', title: 'Mobile', w: 120 },
  { key: 'by', title: 'Added by', w: 110 },
] as const;
const MIN_W = COLS.reduce((n, c) => n + c.w, 0) + 16;

const cellText = (o: Order, k: (typeof COLS)[number]['key']) =>
  k === 'name'
    ? o.ship_name
    : k === 'date'
      ? dateTime(o.created_at)
      : k === 'address'
        ? [o.address, o.landmark, o.district, o.pincode].filter(Boolean).join(', ').replace(/\s*\n\s*/g, ', ')
        : k === 'mobile'
          ? o.mobile1
          : o.created_by_name;

export function OrdersTable({
  orders,
  total,
  loading,
  loadingMore,
  onEnd,
  onRefresh,
  refreshing,
}: {
  orders: Order[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  onEnd: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { width } = useWindowDimensions();
  const tableW = Math.max(MIN_W, Math.min(width - 36, 1100));
  const scale = tableW / MIN_W; // wide screen: columns stretch
  const w = (cw: number) => cw * scale;
  return (
    <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: 18, flexGrow: 1, justifyContent: 'center' }} style={{ flex: 1 }}>
      <View style={{ width: tableW }}>
        <View style={[st.row, st.head]}>
          {COLS.map((c) => (
            <Text key={c.key} style={[st.cell, st.headText, { width: w(c.w) }]}>
              {c.title}
            </Text>
          ))}
        </View>
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.id)}
          getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
          initialNumToRender={20}
          windowSize={7}
          onEndReached={onEnd}
          onEndReachedThreshold={0.5}
          onRefresh={onRefresh}
          refreshing={refreshing}
          renderItem={({ item: o, index }) => (
            <Pressable
              onPress={() => router.push(`/order/${o.id}`)}
              style={({ pressed }) => [st.row, index % 2 === 1 && { backgroundColor: C.rowAlt }, pressed && { backgroundColor: C.tint }]}
            >
              {COLS.map((c) => (
                <View key={c.key} style={[st.cellBox, { width: w(c.w) }]}>
                  {c.key === 'name' ? <View style={[st.dot, { backgroundColor: o.is_printed ? C.ok : C.warn }]} /> : null}
                  <Text numberOfLines={1} style={[st.cell, c.key === 'name' && { fontWeight: '700' }]}>
                    {cellText(o, c.key)}
                  </Text>
                </View>
              ))}
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? <ActivityIndicator color={C.action} style={{ padding: 30 }} /> : <Text style={st.empty}>No orders for this filter.</Text>
          }
          ListFooterComponent={
            total > 0 ? (
              <View style={{ padding: 14 }}>
                {loadingMore ? <ActivityIndicator color={C.action} /> : null}
                <Text style={st.empty}>
                  Showing {orders.length} of {total} · <Text style={{ color: C.ok }}>●</Text> printed <Text style={{ color: C.warn }}>●</Text> not printed
                </Text>
              </View>
            ) : undefined
          }
        />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card, paddingHorizontal: 8 },
  head: { backgroundColor: C.tint, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  headText: { fontWeight: '700', color: C.action, fontSize: 13 },
  cellBox: { flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
  cell: { fontSize: 14, color: C.text, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  empty: { textAlign: 'center', color: C.muted, padding: 10 },
});
