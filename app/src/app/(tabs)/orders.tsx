import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useIsAdmin, usePermission } from '@/lib/auth';
import { Button, Checkbox, Chip, Header, Input, Loading, Muted, Pill, useWide } from '@/components/ui';
import { dayTime, rupees, shiftISO, todayISO } from '@/lib/format';
import { setSelection } from '@/lib/selection';
import { pagesFor } from '@shared/label';
import { C, R } from '@/lib/theme';
import type { Order } from '@shared/types';

type DateFilter = 'today' | 'yesterday' | '7days' | 'all';
type PrintFilter = 'no' | 'yes' | 'all' | 'deleted';

/** Screen 6 · Orders: select & print. */
export default function Orders() {
  const params = useLocalSearchParams<{ preset?: string; createdBy?: string }>();
  const admin = useIsAdmin();
  const canPrint = usePermission('LABEL_PRINT');
  const canReprint = usePermission('LABEL_REPRINT');
  const showAmount = usePermission('ORDER_VIEW_AMOUNT');
  const wide = useWide();

  const [date, setDate] = useState<DateFilter>('today');
  const [printed, setPrinted] = useState<PrintFilter>('all');
  const [q, setQ] = useState('');
  const [createdBy, setCreatedBy] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [autoSelect, setAutoSelect] = useState(false);

  // Dashboard buttons open this screen with a preset.
  useEffect(() => {
    if (params.preset === 'unprinted') {
      setDate('all');
      setPrinted('no');
      setAutoSelect(true);
    }
    if (params.createdBy) {
      setCreatedBy(params.createdBy);
      setDate('today');
      setPrinted('all');
    }
  }, [params.preset, params.createdBy]);

  const range = useMemo(() => {
    const t = todayISO();
    if (date === 'today') return { from: t, to: t };
    if (date === 'yesterday') return { from: shiftISO(t, -1), to: shiftISO(t, -1) };
    if (date === '7days') return { from: shiftISO(t, -6), to: t };
    return {};
  }, [date]);

  const qs = new URLSearchParams({
    ...(range.from ? { from: range.from, to: range.to! } : {}),
    printed: printed === 'deleted' ? 'all' : printed,
    ...(printed === 'deleted' ? { deleted: '1' } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(createdBy ? { createdBy } : {}),
    limit: '1000',
  }).toString();

  const list = useQuery({ queryKey: ['orders', qs], queryFn: () => api<{ orders: Order[]; total: number }>('GET', `/orders?${qs}`) });
  const orders = list.data?.orders ?? [];
  const selectable = (o: Order) => !o.deleted_at && (!o.is_printed || canReprint);
  const notPrinted = orders.filter((o) => !o.is_printed && !o.deleted_at);

  useEffect(() => {
    if (autoSelect && list.data) {
      setSelected(new Set(notPrinted.map((o) => o.id)));
      setAutoSelect(false);
    }
  }, [autoSelect, list.data]);

  // Drop selections that are no longer in the list
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => orders.some((o) => o.id === id))));
  }, [list.data]);

  const allNotPrintedSelected = notPrinted.length > 0 && notPrinted.every((o) => selected.has(o.id));
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  function download() {
    // Keep the order the list shows (newest first)
    const picked = orders.filter((o) => selected.has(o.id));
    setSelection(picked.map((o) => o.id));
    router.push({ pathname: '/labels', params: { n: String(picked.length) } });
  }

  const creatorName = createdBy ? orders.find((o) => String(o.created_by) === createdBy)?.created_by_name : undefined;

  const filters = (
    <View style={[st.filters, { maxWidth: wide ? 1100 : 720 }]}>
      <View style={st.chips}>
        <Chip title="Today" active={date === 'today'} onPress={() => setDate('today')} />
        <Chip title="Yesterday" active={date === 'yesterday'} onPress={() => setDate('yesterday')} />
        <Chip title="7 days" active={date === '7days'} onPress={() => setDate('7days')} />
        <Chip title="All dates" active={date === 'all'} onPress={() => setDate('all')} />
      </View>
      <View style={st.chips}>
        <Chip title="Not printed" active={printed === 'no'} onPress={() => setPrinted('no')} />
        <Chip title="Printed" active={printed === 'yes'} onPress={() => setPrinted('yes')} />
        <Chip title="All" active={printed === 'all'} onPress={() => setPrinted('all')} />
        {admin ? <Chip title="Deleted" active={printed === 'deleted'} onPress={() => setPrinted('deleted')} /> : null}
        {createdBy ? <Chip title={`By ${creatorName ?? 'staff'}  ✕`} active onPress={() => setCreatedBy(undefined)} /> : null}
      </View>
      <Input value={q} onChangeText={setQ} placeholder="Search name, mobile or pincode" style={{ marginBottom: 10 }} />
      {canPrint && printed !== 'deleted' && notPrinted.length > 0 ? (
        <Pressable
          style={st.selectAll}
          onPress={() => setSelected(allNotPrintedSelected ? new Set() : new Set([...selected, ...notPrinted.map((o) => o.id)]))}
        >
          <Checkbox checked={allNotPrintedSelected} onPress={() => setSelected(allNotPrintedSelected ? new Set() : new Set(notPrinted.map((o) => o.id)))} />
          <Text style={{ fontSize: 16, color: C.text }}>Select all not printed ({notPrinted.length})</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderItem = ({ item: o, index }: { item: Order; index: number }) => {
    const sel = selected.has(o.id);
    const meta = [o.pincode, o.size ? `${o.size} no` : '', o.product_name ?? '', o.note ?? '', `by ${o.created_by_name}`].filter(Boolean);
    return (
      <View style={[st.rowWrap, { maxWidth: wide ? 1100 : 720 }]}>
        <Pressable
          onPress={() => router.push(`/order/${o.id}`)}
          style={({ pressed }) => [
            st.row,
            index === 0 && st.first,
            index === orders.length - 1 && st.last,
            pressed && { backgroundColor: '#F8FAFC' },
          ]}
        >
          {canPrint && printed !== 'deleted' ? (
            <View style={{ opacity: selectable(o) ? 1 : 0.35 }}>
              <Checkbox checked={sel} onPress={selectable(o) ? () => toggle(o.id) : undefined} />
            </View>
          ) : null}
          <View style={{ flex: 1, opacity: o.is_printed && !sel ? 0.7 : 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={st.name} numberOfLines={1}>
                {o.ship_name}
              </Text>
              <Text style={st.amount}>{o.payment_type === 'COD' ? `COD ${showAmount ? rupees(o.amount) : ''}`.trim() : 'Prepaid'}</Text>
            </View>
            <Muted style={{ marginTop: 2 }}>
              {meta.join(' · ')}
              {wide ? ` · ${o.mobile1}` : ''}
            </Muted>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
              <Pill kind={o.deleted_at ? 'danger' : o.is_printed ? 'ok' : 'warn'} text={o.deleted_at ? 'Deleted' : o.is_printed ? 'Printed' : 'Not printed'} />
              {o.dup_override ? <Pill kind="danger" text="Saved anyway" /> : null}
              <Muted style={{ fontSize: 13 }}>
                #{o.id} · {dayTime(o.created_at)}
              </Muted>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ground }}>
      <Header title="Orders" />
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        renderItem={renderItem}
        ListHeaderComponent={filters}
        ListEmptyComponent={list.isLoading ? <Loading /> : <Muted style={{ textAlign: 'center', padding: 30 }}>No orders for this filter.</Muted>}
        ListFooterComponent={
          list.data && list.data.total > orders.length ? (
            <Muted style={{ textAlign: 'center', padding: 16 }}>
              Showing {orders.length} of {list.data.total}. Narrow the date to see the rest.
            </Muted>
          ) : undefined
        }
        contentContainerStyle={{ padding: 18, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => list.refetch()}
        refreshing={list.isRefetching}
      />
      {canPrint && selected.size > 0 ? (
        <View style={st.footer}>
          <View style={[st.footerCard, { maxWidth: wide ? 1100 : 720 }]}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>{selected.size} selected</Text>
              <Muted>
                {pagesFor(selected.size)} A4 page{pagesFor(selected.size) === 1 ? '' : 's'}
              </Muted>
            </View>
            <Button title="Download Word" onPress={download} style={{ paddingHorizontal: 22 }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  filters: { width: '100%', alignSelf: 'center', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, marginBottom: 6 },
  rowWrap: { width: '100%', alignSelf: 'center' },
  row: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderTopWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  first: { borderTopWidth: 1, borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  last: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  name: { fontSize: 17, fontWeight: '700', color: C.text, flexShrink: 1 },
  amount: { fontSize: 16, fontWeight: '700', color: C.text },
  footer: { padding: 12, backgroundColor: C.ground },
  footerCard: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
