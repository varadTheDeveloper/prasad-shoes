import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, apiFile, ApiError } from '@/lib/api';
import { saveFile } from '@/lib/download';
import { getPref, setPref } from '@/lib/storage';
import { OrdersTable } from '@/components/OrdersTable';
import { useIsAdmin, usePermission } from '@/lib/auth';
import { Button, Checkbox, Chip, Header, Input, Loading, Muted, useWide } from '@/components/ui';
import { DateField } from '@/components/DateField';
import { payText, shiftISO, shortDateTime, todayISO } from '@/lib/format';
import { setSelection } from '@/lib/selection';
import { pagesFor } from '@shared/label';
import { C, R } from '@/lib/theme';
import type { Order } from '@shared/types';

type PrintFilter = 'no' | 'yes' | 'all';
const PAGE = 50; // orders loaded at a time; more load while scrolling

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/** Screen 6 · Orders: From – To dates, printed status, search; 50 at a time; Select all = every matching order. */
export default function Orders() {
  const params = useLocalSearchParams<{ preset?: string; at?: string }>();
  const admin = useIsAdmin();
  const canPrint = usePermission('LABEL_PRINT');
  const canReprint = usePermission('LABEL_REPRINT');
  const showAmount = usePermission('ORDER_VIEW_AMOUNT');
  const wide = useWide();
  const today = todayISO();

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [printed, setPrinted] = useState<PrintFilter>('all');
  const [deleted, setDeleted] = useState(false);
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 400);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allIds, setAllIds] = useState<number | null>(null); // how many "Select all" picked
  const [autoSelect, setAutoSelect] = useState(false);
  const [selecting, setSelecting] = useState(false);
  // Owner only: "Table" view for checking orders (remembered on this device).
  const [view, setView] = useState<'list' | 'table'>('list');
  const [exporting, setExporting] = useState('');
  useEffect(() => {
    if (admin) getPref('orders_view').then((v) => v === 'table' && setView('table'));
  }, [admin]);
  const pickView = (v: 'list' | 'table') => {
    setView(v);
    setPref('orders_view', v);
  };
  const table = admin && view === 'table';

  // Home buttons open this screen with a preset: today, not printed, all ticked.
  useEffect(() => {
    if (params.preset === 'unprinted') {
      setFrom(todayISO());
      setTo(todayISO());
      setPrinted('no');
      setDeleted(false);
      setQ('');
      setAutoSelect(true);
    }
  }, [params.preset, params.at]); // "at" changes on every tap, so a second tap resets the filters again

  const filterQs = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    printed: deleted ? 'all' : printed,
    ...(deleted ? { deleted: '1' } : {}),
    ...(search ? { q: search } : {}),
  }).toString();

  const list = useInfiniteQuery({
    queryKey: ['orders', 'list', filterQs],
    queryFn: ({ pageParam }) => api<{ orders: Order[]; total: number }>('GET', `/orders?${filterQs}&limit=${PAGE}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.length * PAGE < last.total ? all.length + 1 : undefined),
  });
  const orders = list.data?.pages.flatMap((p) => p.orders) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const selectable = (o: Order) => !o.deleted_at && (!o.is_printed || canReprint);

  const olderQs = new URLSearchParams({ to: shiftISO(today, -1), printed: 'no', limit: '1' }).toString();
  const showOlder = from === today && to === today && printed !== 'yes' && !deleted && !search;
  const older = useQuery({
    queryKey: ['orders', 'older-unprinted', olderQs],
    queryFn: () => api<{ orders: Order[]; total: number }>('GET', `/orders?${olderQs}`),
    enabled: showOlder,
  });
  const olderCount = showOlder ? (older.data?.total ?? 0) : 0;

  // New filter = new list: clear the ticks.
  useEffect(() => {
    setSelected(new Set());
    setAllIds(null);
  }, [filterQs]);

  /** Tick every order that matches the filters (all pages), not just the ones on screen. */
  async function selectAll() {
    setSelecting(true);
    try {
      const r = await api<{ ids: number[] }>('GET', `/orders/ids?${filterQs}`);
      setSelected(new Set(r.ids));
      setAllIds(r.ids.length);
    } finally {
      setSelecting(false);
    }
  }
  useEffect(() => {
    if (autoSelect && list.data) {
      setAutoSelect(false);
      selectAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect, list.data]);

  const allSelected = allIds !== null && selected.size === allIds && allIds > 0;
  const toggleAll = () => (allSelected ? (setSelected(new Set()), setAllIds(null)) : selectAll());
  const toggle = (id: number) => {
    setAllIds(null);
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  async function exportExcel() {
    setExporting('busy');
    try {
      const f = await apiFile('GET', `/orders/export?${filterQs}`);
      await saveFile(f.name, f.bytes);
      setExporting(`Downloaded ${f.name} – opens in Excel`);
    } catch (e) {
      setExporting((e as ApiError).message);
    }
  }

  function download() {
    // Newest first, like the list
    const ids = [...selected].sort((a, b) => b - a);
    setSelection(ids);
    router.push({ pathname: '/labels', params: { n: String(ids.length) } });
  }

  const statusChips = !deleted ? (
    <View style={st.chips}>
      {/* Tap again to show both (no separate "All") */}
      <Chip title="Not printed" active={printed === 'no'} onPress={() => setPrinted(printed === 'no' ? 'all' : 'no')} />
      <Chip title="Printed" active={printed === 'yes'} onPress={() => setPrinted(printed === 'yes' ? 'all' : 'yes')} />
    </View>
  ) : null;

  const filters = (
    <View style={[st.filters, { maxWidth: wide ? 1100 : 720 }]}>
      {deleted ? (
        <Pressable onPress={() => setDeleted(false)} style={st.deletedBar} hitSlop={6}>
          <Text style={{ color: C.danger, fontSize: 14, fontWeight: '700' }}>Showing deleted orders · tap to go back</Text>
        </Pressable>
      ) : null}
      <View style={st.card}>
        <View style={[st.line, !wide && { flexWrap: 'wrap' }]}>
          <View style={{ flexDirection: 'row', gap: 10, flex: wide ? 1.2 : undefined, width: wide ? undefined : '100%' }}>
            <DateField label="From" value={from} onChange={setFrom} max={to || undefined} />
            <DateField label="To" value={to} onChange={setTo} min={from || undefined} />
          </View>
          <View style={[st.searchBox, wide ? { flex: 1, marginTop: 18 } : { width: '100%' }]}>
            <Text style={st.searchIcon}>🔍</Text>
            <Input value={q} onChangeText={setQ} placeholder="Search name, mobile or pincode" style={st.searchInput} />
          </View>
        </View>
        <View style={[st.line, { marginTop: 10, justifyContent: 'space-between' }]}>
          {statusChips ?? <View />}
          {table && total > 0 ? (
            <Button
              kind="secondary"
              title={exporting === 'busy' ? 'Preparing…' : `⬇ Excel (${total})`}
              loading={exporting === 'busy'}
              onPress={exportExcel}
              style={{ paddingVertical: 8, paddingHorizontal: 14 }}
            />
          ) : null}
        </View>
        {exporting && exporting !== 'busy' ? <Muted style={{ marginTop: 8 }}>{exporting}</Muted> : null}
      </View>
      {olderCount > 0 ? (
        <Pressable
          onPress={() => {
            setFrom('');
            setTo(shiftISO(today, -1));
            setPrinted('no');
          }}
          style={st.older}
          hitSlop={6}
        >
          <Text style={{ color: C.action, fontSize: 14, fontWeight: '600' }}>
            ⚠ {olderCount} older order{olderCount === 1 ? '' : 's'} not printed – show {olderCount === 1 ? 'it' : 'them'}
          </Text>
        </Pressable>
      ) : null}
      {!table && total > 0 ? (
        <View style={st.bar}>
          {canPrint && !deleted ? (
            <Pressable style={st.selectAll} onPress={toggleAll} disabled={selecting} hitSlop={6}>
              {selecting ? <ActivityIndicator color={C.action} /> : <Checkbox checked={allSelected} onPress={toggleAll} />}
              <Text style={{ fontSize: 15, color: C.text, fontWeight: '600' }}>Select all ({total})</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Muted style={{ fontSize: 13 }}>
            {orders.length} of {total}
          </Muted>
        </View>
      ) : null}
      {allSelected && allIds! < total ? (
        <Muted style={{ fontSize: 13, marginBottom: 6 }}>
          {total - allIds!} printed order{total - allIds! === 1 ? '' : 's'} skipped – only the owner can print again
        </Muted>
      ) : null}
    </View>
  );

  const renderItem = ({ item: o, index }: { item: Order; index: number }) => {
    const sel = selected.has(o.id);
    const meta = [o.pincode, o.size ? `${o.size} no` : '', o.product_name ?? '', o.note ?? ''].filter(Boolean).join(' · ');
    const pay = payText(o, showAmount);
    return (
      <View style={[st.rowWrap, { maxWidth: wide ? 1100 : 720 }]}>
        <Pressable
          onPress={() => router.push(`/order/${o.id}`)}
          style={({ pressed }) => [st.row, index === 0 && st.first, index === orders.length - 1 && st.last, sel && { backgroundColor: C.tint }, pressed && { backgroundColor: '#EEF2F7' }]}
        >
          {canPrint && !deleted ? (
            <View style={{ opacity: selectable(o) ? 1 : 0.35 }}>
              <Checkbox checked={sel} onPress={selectable(o) ? () => toggle(o.id) : undefined} />
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={st.line}>
              <View style={[st.dot, { backgroundColor: o.deleted_at ? C.danger : o.is_printed ? C.ok : C.warn }]} />
              <Text style={st.name} numberOfLines={1}>
                {o.ship_name}
              </Text>
              {o.dup_override ? <Text style={st.flag}>Saved anyway</Text> : null}
              {pay ? <Text style={st.amount}>{pay}</Text> : null}
              <Text style={[st.status, { color: o.deleted_at ? C.danger : o.is_printed ? C.ok : C.warn }]}>
                {o.deleted_at ? 'Deleted' : o.is_printed ? 'Printed' : 'Not printed'}
              </Text>
            </View>
            <Text style={st.meta} numberOfLines={1}>
              {shortDateTime(o.created_at)} · {o.created_by_name}
              {meta ? ` · ${meta}` : ''}
              {wide ? ` · ${o.mobile1}` : ''}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  };


  return (
    <View style={{ flex: 1, backgroundColor: C.ground }}>
      <Header
        title="Orders"
        right={
          admin ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip title="List" active={!table} onPress={() => pickView('list')} />
              <Chip title="Table" active={table} onPress={() => pickView('table')} />
            </View>
          ) : undefined
        }
      />
      {table ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>{filters}</View>
          <OrdersTable
            orders={orders}
            total={total}
            loading={list.isLoading}
            loadingMore={list.isFetchingNextPage}
            onEnd={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
            onRefresh={() => list.refetch()}
            refreshing={list.isRefetching}
          />
        </View>
      ) : (
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        renderItem={renderItem}
        ListHeaderComponent={filters}
        ListEmptyComponent={list.isLoading ? <Loading /> : <Muted style={{ textAlign: 'center', padding: 30 }}>No orders for this filter.</Muted>}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          total > 0 ? (
            <View style={{ padding: 16, alignItems: 'center', gap: 10 }}>
              {list.isFetchingNextPage ? <ActivityIndicator color={C.action} /> : null}
              <Muted>
                Showing {orders.length} of {total}
              </Muted>
              {admin && !deleted ? <Button kind="link" title="Show deleted orders" onPress={() => setDeleted(true)} /> : null}
            </View>
          ) : admin && !deleted ? (
            <Button kind="link" title="Show deleted orders" onPress={() => setDeleted(true)} />
          ) : undefined
        }
        contentContainerStyle={{ padding: 18, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => list.refetch()}
        refreshing={list.isRefetching}
      />
      )}
      {canPrint && selected.size > 0 && !table ? (
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
  filters: { width: '100%', alignSelf: 'center', marginBottom: 4 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: R.card, padding: 12, marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1, fontSize: 15 },
  searchInput: { flex: 1, paddingLeft: 38 },
  deletedBar: { backgroundColor: C.dangerTint, borderRadius: R.card, padding: 10, marginBottom: 10 },
  older: { paddingVertical: 4, marginBottom: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 6, marginBottom: 4 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowWrap: { width: '100%', alignSelf: 'center' },
  row: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderTopWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  first: { borderTopWidth: 1, borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  last: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  amount: { fontSize: 14, fontWeight: '700', color: C.text },
  status: { fontSize: 12, fontWeight: '700' },
  flag: { fontSize: 11, fontWeight: '700', color: C.danger },
  meta: { fontSize: 13, color: C.muted, marginTop: 3, marginLeft: 16 },
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
