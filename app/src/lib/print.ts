// "Print" (owner): the server makes a print page of the labels (same layout as the Word file) and
// marks the orders printed. Then:
//   - website: the page is loaded in a hidden frame and the browser's print window opens (Ctrl+P window)
//   - Android app: the page opens in Chrome, which opens Android's print window by itself
// Browsers and phones always show the print window – silent printing is not allowed.
import { Linking, Platform } from 'react-native';
import { api, API_URL } from './api';

export async function printLabels(orderIds: number[]): Promise<{ orders: number; pages: number }> {
  const web = Platform.OS === 'web';
  const r = await api<{ url: string; orders: number; pages: number }>(
    'POST',
    '/labels/print',
    { orderIds, markPrinted: true, autoPrint: !web },
    120_000,
  );
  const url = `${API_URL}${r.url}`;
  if (!web) {
    await Linking.openURL(url);
    return r;
  }
  await new Promise<void>((resolve, reject) => {
    const doc = globalThis.document;
    const frame = doc.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    frame.onload = () => {
      try {
        const w = frame.contentWindow!;
        // Remove the frame once the print window is closed (printed or cancelled).
        w.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 500));
        w.focus();
        w.print();
        resolve();
      } catch (e) {
        frame.remove();
        reject(e);
      }
    };
    frame.onerror = () => {
      frame.remove();
      reject(new Error('Print page could not be loaded'));
    };
    frame.src = url;
    doc.body.appendChild(frame);
  });
  return r;
}
