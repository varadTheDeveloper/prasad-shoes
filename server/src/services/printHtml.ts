// "Print" (owner): the same labels as the Word file, as a web page that the browser / phone prints.
// Same layout as services/docx.ts – A4, 2 labels per page, cut line at exactly 148.5 mm, the same
// text (shared/label.ts), the same font sizes (sizeFor / codSize) and the same spacing (converted from
// twips: 1 mm = 56.7 twips). Prepaid and COD exactly as in the Word file.
import { codHeadLines, codOrderLine, fromLines, orderLine, toLines, type LabelOrder, type LabelShop } from '../../../shared/label';
import { codSize, sizeFor } from './docx';

const mm = (twips: number) => `${(twips / 56.7).toFixed(2)}mm`;
// The same numbers as docx.ts
const SIZE = 28; // half-points
const TOP_START = 454; // 8 mm from the paper edge
const HALF_MM = 148.5;
const SPACE_TOP = 120; // before the top label
const CUT_GAP = 850; // 15 mm below the cut line
const ORDER_GAP = 160;
const FROM_GAP = 340;
const COD_TO_GAP = 200;
const SIDE = 1080; // 19 mm left / right

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const line = (text: string, cls: string, gap = 0) => `<p class="${cls}"${gap ? ` style="margin-top:${mm(gap)}"` : ''}>${esc(text)}</p>`;

function label(o: LabelOrder, shop: LabelShop): string {
  if (o.payment_type === 'COD') {
    const pt = codSize(o, shop) / 2;
    return [
      `<div style="font-size:${pt}pt">`,
      ...codHeadLines(o).map((l, i) => line(l, i === 1 || i === 3 ? 'c b' : 'c')),
      `<p class="r b" style="margin-top:${mm(COD_TO_GAP)}">TO, ${esc(o.ship_name)}</p>`,
      ...toLines(o).map((l) => line(l, 'r')),
      line(codOrderLine(o), 'r b', ORDER_GAP),
      line('From :-', 'l b u', FROM_GAP),
      ...fromLines(shop).map((l) => line(l, 'l')),
      '</div>',
    ].join('');
  }
  const pt = sizeFor(o) / 2;
  return [
    `<div style="font-size:${pt}pt">`,
    `<p class="r b">TO, ${esc(o.ship_name)}</p>`,
    ...toLines(o).map((l) => line(l, 'r')),
    line(orderLine(o), 'r b', ORDER_GAP),
    '</div>',
    // From is always 14 pt on the Prepaid label (as in the Word file)
    `<div style="font-size:${SIZE / 2}pt">`,
    line('From :-', 'l b u', FROM_GAP),
    ...fromLines(shop).map((l) => line(l, 'l')),
    '</div>',
  ].join('');
}

/**
 * The print page. autoPrint: the page opens the print window by itself (phone: opened in Chrome).
 * Without it the app calls print() itself (website: hidden frame).
 */
export function buildLabelsHtml(orders: LabelOrder[], shop: LabelShop, autoPrint: boolean): string {
  const pages: string[] = [];
  for (let i = 0; i < Math.max(orders.length, 1); i += 2) {
    const top = orders[i];
    const bottom = orders[i + 1];
    pages.push(
      `<section class="page">` +
        `<div class="half top">${top ? label(top, shop) : ''}</div>` +
        `<div class="half bottom">${bottom ? label(bottom, shop) : ''}</div>` +
        `</section>`,
    );
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prasad Shoes labels</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: 'Nirmala UI', 'Noto Sans Devanagari', 'Noto Sans', Mangal, Arial, sans-serif;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .half { position: absolute; left: ${mm(SIDE)}; right: ${mm(SIDE)}; overflow: hidden; }
  .top { top: ${mm(TOP_START)}; height: calc(${HALF_MM}mm - ${mm(TOP_START)}); padding-top: ${mm(SPACE_TOP)};
         border-bottom: 1px dashed #000; }
  .bottom { top: ${HALF_MM}mm; bottom: 8mm; padding-top: ${mm(CUT_GAP)}; }
  p { margin: 0; line-height: 1.32; white-space: pre-wrap; word-wrap: break-word; }
  .r { text-align: right; } .l { text-align: left; } .c { text-align: center; }
  .b { font-weight: 700; } .u { text-decoration: underline; }
  @media screen { body { background: #888; } .page { margin: 10px auto; background: #fff; box-shadow: 0 1px 6px #0006; } }
</style></head>
<body>${pages.join('\n')}
${autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>' : ''}
</body></html>`;
}
