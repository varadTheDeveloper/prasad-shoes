import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth, useIsAdmin, usePermission } from '@/lib/auth';
import { setSelection } from '@/lib/selection';
import { Button, Card, ListRow, Muted, Page, Pill, Row, SectionTitle, useWide } from '@/components/ui';
import { CheckBox, PasteBox, PasteDuplicate, PasteForm, SaveBar, usePasteOrder } from '@/components/PasteOrder';
import { dayTime, payText, shiftISO, time, todayISO } from '@/lib/format';
import { C } from '@/lib/theme';
import type { Order } from '@shared/types';

interface Stats {
  savedByMeToday: number;
  notPrinted: number;
  ordersToday: number;
  codToday: number | null;
  staffToday: { id: number; name: string; orders: number; last_order: string }[];
  myRecent: { id: number; ship_name: string; pincode: string; payment_type: string; amount?: number | null; is_printed: boolean; created_at: string }[];
}

/**
 * Home: the paste screen. Paste → check the label → Save; and one button to print today's labels.
 * Today's numbers sit in a small strip at the top.
 */
export default function Home() {
  const { me, logout } = useAuth();
  const admin = useIsAdmin();
  const canCreate = usePermission('ORDER_CREATE');
  const canPrint = usePermission('LABEL_PRINT');
  const wide = useWide();
  const s = usePasteOrder();

  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('GET', '/stats') });
  const today = todayISO();
  const todayQs = new URLSearchParams({ from: today, to: today, printed: 'no' }).toString();
  const unprintedToday = useQuery({
    queryKey: ['orders', 'home-unprinted-today', todayQs],
    queryFn: () => api<{ ids: number[] }>('GET', `/orders/ids?${todayQs}`),
    enabled: canPrint,
  });
  const olderQs = new URLSearchParams({ to: shiftISO(today, -1), printed: 'no', limit: '1' }).toString();
  const older = useQuery({
    queryKey: ['orders', 'older-unprinted', olderQs],
    queryFn: () => api<{ orders: Order[]; total: number }>('GET', `/orders?${olderQs}`),
    enabled: canPrint,
  });
  useFocusEffect(
    useCallback(() => {
      stats.refetch();
      unprintedToday.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const d = stats.data;
  const toPrint = unprintedToday.data?.ids ?? [];
  const olderCount = older.data?.total ?? 0;

  function printToday() {
    setSelection(toPrint);
    router.push({ pathname: '/labels', params: { n: String(toPrint.length) } });
  }

  const strip = (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Namaste, {me?.name}</Text>
        {d ? (
          <Muted style={{ fontSize: 14 }}>
            {admin ? `Today ${d.ordersToday}` : `Saved by me ${d.savedByMeToday}`} · Not printed {d.notPrinted}
          </Muted>
        ) : null}
      </View>
      {canPrint ? (
        <View>
          <Button
            kind="secondary"
            disabled={!toPrint.length}
            title={toPrint.length ? `⬇  Print today’s labels (${toPrint.length})` : 'No labels to print right now'}
            onPress={printToday}
          />
          {olderCount > 0 ? (
            <Pressable onPress={() => router.push({ pathname: '/orders', params: { preset: 'unprinted', at: String(Date.now()) } })} hitSlop={6}>
              <Text style={{ color: C.action, fontSize: 14, fontWeight: '600', marginTop: 8 }}>
                {olderCount} older order{olderCount === 1 ? '' : 's'} not printed – open Orders
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const below = (
    <>
      {d && admin ? (
        <>
          <SectionTitle>Saved by staff today</SectionTitle>
          <Card style={{ padding: 0 }}>
            {d.staffToday.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Muted>No orders saved yet today.</Muted>
              </View>
            ) : (
              d.staffToday.map((x, i) => (
                <ListRow key={x.id} last={i === d.staffToday.length - 1}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>{x.name}</Text>
                    <Muted>Last order {time(x.last_order)}</Muted>
                  </View>
                  <Pill kind="info" text={`${x.orders} order${x.orders === 1 ? '' : 's'}`} />
                </ListRow>
              ))
            )}
          </Card>
        </>
      ) : null}
      {d && !admin ? (
        <>
          <SectionTitle>My recent orders</SectionTitle>
          <Card style={{ padding: 0 }}>
            {d.myRecent.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Muted>No orders yet.</Muted>
              </View>
            ) : (
              d.myRecent.map((o, i) => (
                <ListRow key={o.id} last={i === d.myRecent.length - 1} onPress={() => router.push(`/order/${o.id}`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>{o.ship_name}</Text>
                    <Muted>{[o.pincode, payText(o), dayTime(o.created_at)].filter(Boolean).join(' · ')}</Muted>
                  </View>
                  <Pill kind={o.is_printed ? 'ok' : 'warn'} text={o.is_printed ? 'Printed' : 'Not printed'} />
                </ListRow>
              ))
            )}
          </Card>
        </>
      ) : null}
      <Row style={{ justifyContent: 'center', marginTop: 24 }} gap={24}>
        <Button kind="link" title="Change password" onPress={() => router.push('/change-password')} />
        <Button kind="link" title="Log out" onPress={logout} />
      </Row>
    </>
  );

  if (!canCreate) {
    // Someone who cannot add orders: just the numbers and the print button.
    return (
      <Page title="Home">
        {strip}
        {below}
      </Page>
    );
  }

  const started = !!(s.raw || s.form.ship_name);
  return (
    <Page title="Home" wide={wide} footer={started || s.saved || wide ? <SaveBar s={s} /> : undefined}>
      {strip}
      {wide ? (
        <Row gap={18} style={{ alignItems: 'flex-start' }}>
          <Card style={{ flex: 1 }}>
            <PasteBox s={s} wide />
            <CheckBox s={s} />
          </Card>
          <Card style={{ flex: 1.2 }}>
            <PasteForm s={s} twoCol />
          </Card>
        </Row>
      ) : (
        <>
          <PasteBox s={s} />
          {started ? (
            <>
              <CheckBox s={s} />
              <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 14 }}>
                <Muted style={{ marginBottom: 10 }}>Fix anything below – the label above changes with it.</Muted>
                <PasteForm s={s} />
              </View>
            </>
          ) : null}
        </>
      )}
      {below}
      <PasteDuplicate s={s} />
    </Page>
  );
}
