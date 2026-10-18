import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth, useIsAdmin, usePermission } from '@/lib/auth';
import { Button, Card, ListRow, Loading, Muted, Page, Pill, Row, SectionTitle, Stat } from '@/components/ui';
import { dayTime, longDate, rupees, rupeesShort, time } from '@/lib/format';
import { C } from '@/lib/theme';

interface Stats {
  savedByMeToday: number;
  notPrinted: number;
  ordersToday: number;
  codToday: number | null;
  staffToday: { id: number; name: string; orders: number; last_order: string }[];
  myRecent: { id: number; ship_name: string; pincode: string; payment_type: string; amount?: number; is_printed: boolean; created_at: string }[];
}

export default function Home() {
  const { me, logout } = useAuth();
  const admin = useIsAdmin();
  const canCreate = usePermission('ORDER_CREATE');
  const canPrint = usePermission('LABEL_PRINT');
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('GET', '/stats') });
  useFocusEffect(
    useCallback(() => {
      stats.refetch();
    }, []),
  );
  const d = stats.data;

  const footerLinks = (
    <Row style={{ justifyContent: 'center', marginTop: 24 }} gap={24}>
      <Button kind="link" title="Change password" onPress={() => router.push('/change-password')} />
      <Button kind="link" title="Log out" onPress={logout} />
    </Row>
  );

  return (
    <Page title={admin ? 'Dashboard' : 'Home'}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: C.text }}>Namaste, {me?.name}</Text>
      <Muted style={{ marginTop: 2, marginBottom: 16 }}>{longDate()}</Muted>
      {!d ? (
        <Loading />
      ) : admin ? (
        <>
          <Row style={{ marginBottom: 14 }}>
            <Stat label="Orders today" value={d.ordersToday} />
            <Stat label="Not printed" value={d.notPrinted} tint />
            <Stat label="COD today" value={rupeesShort(d.codToday)} />
          </Row>
          <Button
            big
            title={`＋  Print labels (${d.notPrinted})`}
            onPress={() => router.push({ pathname: '/orders', params: { preset: 'unprinted' } })}
          />
          <Row style={{ marginTop: 12, marginBottom: 18 }}>
            <Button kind="secondary" title="New order" onPress={() => router.push('/new')} style={{ flex: 1 }} />
            <Button kind="secondary" title="Staff" onPress={() => router.push('/staff')} style={{ flex: 1 }} />
            <Button kind="secondary" title="Shop" onPress={() => router.push('/shop')} style={{ flex: 1 }} />
          </Row>
          <SectionTitle>Saved by staff today</SectionTitle>
          <Card style={{ padding: 0 }}>
            {d.staffToday.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Muted>No orders saved yet today.</Muted>
              </View>
            ) : (
              d.staffToday.map((s, i) => (
                <ListRow key={s.id} last={i === d.staffToday.length - 1} onPress={() => router.push({ pathname: '/orders', params: { createdBy: String(s.id) } })}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>{s.name}</Text>
                    <Muted>Last order {time(s.last_order)}</Muted>
                  </View>
                  <Pill kind="info" text={`${s.orders} order${s.orders === 1 ? '' : 's'}`} />
                </ListRow>
              ))
            )}
          </Card>
        </>
      ) : (
        <>
          <Row style={{ marginBottom: 14 }}>
            <Stat label="Saved by me today" value={d.savedByMeToday} />
            <Stat label="Not printed yet" value={d.notPrinted} tint />
          </Row>
          {canCreate ? <Button big title="＋  Paste new order" onPress={() => router.push('/new')} /> : null}
          <Row style={{ marginTop: 12, marginBottom: 18 }}>
            <Button kind="secondary" title="View orders" onPress={() => router.push('/orders')} style={{ flex: 1 }} />
            {canPrint ? (
              <Button
                kind="secondary"
                title="Download labels"
                onPress={() => router.push({ pathname: '/orders', params: { preset: 'unprinted' } })}
                style={{ flex: 1 }}
              />
            ) : null}
          </Row>
          <SectionTitle>My recent orders</SectionTitle>
          <Card style={{ padding: 0 }}>
            {d.myRecent.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Muted>No orders yet. Tap “Paste new order”.</Muted>
              </View>
            ) : (
              d.myRecent.map((o, i) => (
                <ListRow key={o.id} last={i === d.myRecent.length - 1} onPress={() => router.push(`/order/${o.id}`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>{o.ship_name}</Text>
                    <Muted>
                      {[o.pincode, o.payment_type === 'COD' ? `COD ${o.amount !== undefined ? rupees(o.amount) : ''}`.trim() : 'Prepaid', dayTime(o.created_at)].join(' · ')}
                    </Muted>
                  </View>
                  <Pill kind={o.is_printed ? 'ok' : 'warn'} text={o.is_printed ? 'Printed' : 'Not printed'} />
                </ListRow>
              ))
            )}
          </Card>
        </>
      )}
      {footerLinks}
    </Page>
  );
}
