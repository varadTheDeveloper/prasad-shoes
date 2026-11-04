import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiFile, ApiError } from '@/lib/api';
import { usePermission } from '@/lib/auth';
import { getSelection, setSelection } from '@/lib/selection';
import { saveFile } from '@/lib/download';
import { Banner, Button, Card, ListRow, Muted, Page, Row, SectionTitle, Toggle } from '@/components/ui';
import { PagePreview } from '@/components/LabelPreview';
import { dayTime } from '@/lib/format';
import { pagesFor } from '@shared/label';
import { C, R } from '@/lib/theme';
import type { Order, ShopSettings } from '@shared/types';
import { t } from '@/lib/i18n';

/** Screen 8 · Download Word labels. */
export default function Labels() {
  const qc = useQueryClient();
  const canReprint = usePermission('LABEL_REPRINT');
  const [ids] = useState(getSelection);
  const [markPrinted, setMarkPrinted] = useState(true);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);

  const shop = useQuery({ queryKey: ['shop'], queryFn: () => api<ShopSettings>('GET', '/shop') });
  const batches = useQuery({
    queryKey: ['batches'],
    queryFn: () => api<{ batches: { id: number; order_count: number; page_count: number; created_at: string; created_by_name: string }[] }>('GET', '/labels'),
  });
  // Preview: first 2 pages = first 4 orders
  const preview = useQueries({
    queries: ids.slice(0, 4).map((id) => ({ queryKey: ['order', String(id)], queryFn: () => api<Order>('GET', `/orders/${id}`) })),
  });
  const previewOrders = preview.map((p) => p.data ?? null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  async function download() {
    setBusy('new');
    setMsg(null);
    try {
      const f = await apiFile('POST', '/labels', { orderIds: ids, markPrinted });
      await saveFile(f.name, f.bytes);
      setMsg({ kind: 'ok', text: [t('Downloaded {name}', { name: f.name }), t(f.pages === 1 ? '{n} page' : '{n} pages', { n: f.pages }), markPrinted ? t('orders marked printed') : '']
          .filter(Boolean)
          .join(' · ') });
      setSelection([]);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as ApiError).message });
    } finally {
      setBusy(null);
    }
  }

  async function again(batchId: number) {
    setBusy(batchId);
    setMsg(null);
    try {
      const f = await apiFile('GET', `/labels/${batchId}/docx`);
      await saveFile(f.name, f.bytes);
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as ApiError).message });
    } finally {
      setBusy(null);
    }
  }

  const n = ids.length;
  const pages = pagesFor(n);
  const done = msg?.kind === 'ok';

  return (
    <Page title={t('Download labels')}>
      <Pressable onPress={back} style={{ marginBottom: 10 }}>
        <Text style={{ color: C.action, fontSize: 15, fontWeight: '600' }}>{t('‹ Back to orders')}</Text>
      </Pressable>
      {n === 0 && !done ? (
        <Banner kind="info" text={t('No orders selected. Go to Orders, tick the orders and tap Download Word.')} />
      ) : (
        <>
          <View style={{ backgroundColor: C.tint, borderRadius: R.card, padding: 16, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.action }}>
              {t('{n} orders → {p}', { n, p: t(pages === 1 ? '{n} A4 page' : '{n} A4 pages', { n: pages }) })}
            </Text>
            <Text style={{ color: C.action }}>{t('2 labels per page')}</Text>
          </View>
          {shop.data ? (
            <Row gap={12} style={{ marginBottom: 14 }}>
              <PagePreview labels={[previewOrders[0], previewOrders[1]]} shop={shop.data} />
              {n > 2 ? <PagePreview labels={[previewOrders[2], previewOrders[3]]} shop={shop.data} /> : <View style={{ flex: 1 }} />}
            </Row>
          ) : null}
          {n > 4 ? <Muted style={{ textAlign: 'center', marginTop: -6, marginBottom: 12 }}>{t('Showing the first 2 pages of {p}.', { p: pages })}</Muted> : null}
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, color: C.text }}>{t('Mark these orders as printed')}</Text>
            <Toggle value={markPrinted} onChange={setMarkPrinted} />
          </Card>
        </>
      )}
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
      {n > 0 && !done ? (
        <Button title={busy === 'new' ? t('Preparing file…') : t('⬇  Download Word file (.docx)')} onPress={download} loading={busy === 'new'} />
      ) : null}

      <SectionTitle>{t('Earlier downloads')}</SectionTitle>
      <Card style={{ padding: 0 }}>
        {(batches.data?.batches ?? []).length === 0 ? (
          <View style={{ padding: 16 }}>
            <Muted>{t('None yet.')}</Muted>
          </View>
        ) : (
          batches.data!.batches.map((b, i, arr) => (
            <ListRow key={b.id} last={i === arr.length - 1} onPress={canReprint ? () => again(b.id) : undefined}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: C.text }}>{dayTime(b.created_at)}</Text>
                <Muted style={{ fontSize: 13 }}>{t('by {name}', { name: b.created_by_name })}</Muted>
              </View>
              <Muted>
                {busy === b.id
                  ? t('Preparing…')
                  : `${t(b.order_count === 1 ? '{n} order' : '{n} orders', { n: b.order_count })} · ${t(b.page_count === 1 ? '{n} page' : '{n} pages', { n: b.page_count })}`}
                {canReprint && busy !== b.id ? '  ⬇' : ''}
              </Muted>
            </ListRow>
          ))
        )}
      </Card>
      {!canReprint ? <Muted style={{ textAlign: 'center' }}>{t('Only the owner can download an earlier file again.')}</Muted> : null}
    </Page>
  );
}
