// "Print" (owner): the same labels as the Word file, as a web page that the browser / phone prints.
// Same layout as services/docx.ts – A4, 2 labels per page, cut line at exactly 148.5 mm, each label
// in the middle of its half of the paper, the same text (shared/label.ts), the same font size
// (labelSize) and the same spacing (converted from twips: 1 mm = 56.7 twips).
import { fromLines, headLines, labelOrderLine, toLines, type LabelOrder, type LabelShop } from '../../../shared/label';
import { labelSize } from './docx';

const mm = (twips: number) => `${(twips / 56.7).toFixed(2)}mm`;
// The same numbers as docx.ts
const HALF_MM = 148.5;
const TO_GAP = 200;
const LINE_GAP = 160;
const FROM_GAP = 340;
const SIDE = 1080; // 19 mm left / right
const CLEAR = 12; // mm of blank paper kept at the paper edges and next to the cut line

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const line = (text: string, cls: string, gap = 0) => `<p class="${cls}"${gap ? ` style="margin-top:${mm(gap)}"` : ''}>${esc(text)}</p>`;

function label(o: LabelOrder, shop: LabelShop): string {
  const pt = labelSize(o, shop) / 2;
  return [
    `<div class="label" style="font-size:${pt}pt">`,
    ...headLines(o).map((l, i) => line(l, i === 1 || i === 3 ? 'c b' : 'c')),
    `<p class="r b" style="margin-top:${mm(TO_GAP)}">TO, ${esc(o.ship_name)}</p>`,
    ...toLines(o).map((l) => line(l, 'r')),
    line(labelOrderLine(o), 'r b', LINE_GAP),
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
  .half { position: absolute; left: 0; right: 0; height: ${HALF_MM}mm; padding: ${CLEAR}mm ${mm(SIDE)};
          display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
  .top { top: 0; border-bottom: 1px dashed #000; }
  .bottom { top: ${HALF_MM}mm; }
  p { margin: 0; line-height: 1.32; white-space: pre-wrap; word-wrap: break-word; }
  .r { text-align: right; } .l { text-align: left; } .c { text-align: center; }
  .b { font-weight: 700; } .u { text-decoration: underline; }
  @media screen { body { background: #888; } .page { margin: 10px auto; background: #fff; box-shadow: 0 1px 6px #0006; } }
</style></head>
<body>${pages.join('\n')}
${autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>' : ''}
</body></html>`;
}
