// Builds the editable Word file: A4 portrait, 2 labels per page, no limit on the number of orders.
//
// Page layout (fixed, the same in MS Word, WPS Office and LibreOffice):
//
//   ┌──────────────────────────── A4 210 × 297 mm ────────────────────────────┐
//   │                                           TO, <name>   (right, top)      │
//   │                                           address / pin / mobile         │
//   │                                           PREPAID (…) / COD 1299 (…)     │
//   │  From :-  (left, right under the TO block)                               │
//   │  PRASAD SHOES …                                                          │
//   │                       (blank – room to cut)                              │
//   ├ - - - - - - - - - - - - cut line at exactly 148.5 mm - - - - - - - - - - ┤
//   │                       (15 mm blank)                                      │
//   │                                           TO, <name>                     │
//   │                                           …                              │
//   │  From :-                                                                 │
//   │  PRASAD SHOES …                                                          │
//   │                       (blank)                                            │
//   └──────────────────────────────────────────────────────────────────────────┘
//
// Each page is its own small table with EXACT row heights (rows cannot grow or move), and a
// page break comes before the next page. Every page starts with the same 1-point paragraph, so
// all pages line up identically and the cut line is always at 148.5 mm.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { fromLines, orderLine, toLines, type LabelOrder, type LabelShop } from '../../../shared/label';

const FONT = 'Nirmala UI'; // ships with Windows; prints English, Marathi and Hindi
const SIZE = 28; // half-points -> 14 pt (smaller automatically for very long addresses)

// ---- geometry, in twips (1/1440 inch; 1 mm = 56.7 twips) ----------------------------------------
const PAGE_W = 11906; // 210 mm
const PAGE_H = 16838; // 297 mm
const HALF = Math.round(PAGE_H / 2); // 8419 = 148.5 mm
const MARGIN_LR = 1080; // 19 mm
const TOP_PARA = 20; // the 1-pt paragraph at the top of every page (carries the page break)
const MARGIN_T = 434; // 7.7 mm: margin + TOP_PARA = 454 twips = 8 mm from the paper edge
const MARGIN_B = 454; // 8 mm
const TOP_HALF = HALF - MARGIN_T - TOP_PARA; // rows of the top half end exactly at 148.5 mm
const SPARE = 180; // ~3 mm left unused at the bottom so no program ever pushes a row to the next page
const BOTTOM_HALF = PAGE_H - MARGIN_B - HALF - SPARE;
const FROM_GAP = 340; // ~6 mm between the COD/PREPAID line and "From :-"
const CUT_GAP = 850; // 15 mm blank band below the cut line before the bottom label starts
const COL_W = PAGE_W - 2 * MARGIN_LR;

const font = { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT };

function run(text: string, size: number, opts: { bold?: boolean; underline?: boolean } = {}) {
  return new TextRun({
    text,
    font,
    size,
    sizeComplexScript: size,
    bold: opts.bold,
    boldComplexScript: opts.bold,
    underline: opts.underline ? {} : undefined,
  });
}

const para = (align: (typeof AlignmentType)[keyof typeof AlignmentType], children: TextRun[], extra: Record<string, unknown> = {}) =>
  new Paragraph({ alignment: align, spacing: { before: 0, after: 0, line: 264 }, children, ...extra });

/** Very long addresses get a smaller font so the TO block always fits its fixed space. */
function sizeFor(o: LabelOrder): number {
  const lines = [o.ship_name, ...toLines(o), orderLine(o)].reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 55)), 0);
  if (lines <= 11) return SIZE; // 14 pt
  if (lines <= 13) return 24; // 12 pt
  return 20; // 10 pt
}

function toBlock(o: LabelOrder): Paragraph[] {
  const size = sizeFor(o);
  return [
    para(AlignmentType.RIGHT, [run('TO, ', size, { bold: true }), run(o.ship_name, size, { bold: true })]),
    ...toLines(o).map((l) => para(AlignmentType.RIGHT, [run(l, size)])),
    // The COD / PREPAID line right under the TO address
    para(AlignmentType.RIGHT, [run(orderLine(o), size, { bold: true })], { spacing: { before: 160, after: 0, line: 264 } }),
  ];
}

function fromBlock(shop: LabelShop): Paragraph[] {
  return [
    para(AlignmentType.LEFT, [run('From :-', SIZE, { bold: true, underline: true })], { spacing: { before: FROM_GAP, after: 0, line: 264 } }),
    ...fromLines(shop).map((l) => para(AlignmentType.LEFT, [run(l, SIZE)])),
  ];
}

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const DASHED = { style: BorderStyle.DASHED, size: 8, color: '000000' };

function cell(children: Paragraph[], align: typeof VerticalAlign.TOP | typeof VerticalAlign.BOTTOM, cutLineBelow = false, padTop = 120) {
  return new TableCell({
    children: children.length ? children : [new Paragraph({ children: [] })],
    verticalAlign: align,
    width: { size: COL_W, type: WidthType.DXA },
    margins: { top: padTop, bottom: 160, left: 0, right: 0 },
    borders: { top: NONE, left: NONE, right: NONE, bottom: cutLineBelow ? DASHED : NONE },
  });
}

const row = (height: number, c: TableCell) => new TableRow({ height: { value: height, rule: HeightRule.EXACT }, cantSplit: true, children: [c] });

/** One half of the page: TO block at the top (right), From block at the bottom (left). */
/** One half of the page: TO block (right), the COD/PREPAID line, then From (left) right under it.
 *  The rest of the half stays blank, so there is plenty of room around the cut line. */
function half(o: LabelOrder | null, shop: LabelShop, height: number, cutLineBelow: boolean, padTop: number): TableRow[] {
  return [row(height, cell(o ? [...toBlock(o), ...fromBlock(shop)] : [], VerticalAlign.TOP, cutLineBelow, padTop))];
}

function pageTable(top: LabelOrder | null, bottom: LabelOrder | null, shop: LabelShop) {
  return new Table({
    width: { size: COL_W, type: WidthType.DXA },
    columnWidths: [COL_W],
    borders: TableBorders.NONE,
    // The dashed cut line is the bottom edge of the top half = exactly 148.5 mm from the top.
    // Both halves start their TO block the same distance from their top edge (paper edge / cut line).
    rows: [...half(top, shop, TOP_HALF, true, 120), ...half(bottom, shop, BOTTOM_HALF, false, CUT_GAP)],
  });
}

const tinyPara = (pageBreakBefore: boolean) =>
  new Paragraph({
    pageBreakBefore,
    spacing: { before: 0, after: 0, line: TOP_PARA, lineRule: 'exact' as any },
    children: [new TextRun({ text: '', size: 2 })],
  });

export async function buildLabelsDocx(orders: LabelOrder[], shop: LabelShop): Promise<Buffer> {
  const children: (Table | Paragraph)[] = [];
  for (let i = 0; i < Math.max(orders.length, 1); i += 2) {
    children.push(tinyPara(i > 0)); // same 1-pt line on every page; from page 2 on it also starts the new page
    children.push(pageTable(orders[i] ?? null, orders[i + 1] ?? null, shop));
  }
  children.push(tinyPara(false)); // Word needs a paragraph after the last table (fits in SPARE)

  const doc = new Document({
    creator: shop.shop_name,
    title: 'Parcel labels',
    styles: { default: { document: { run: { font, size: SIZE, sizeComplexScript: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN_T, bottom: MARGIN_B, left: MARGIN_LR, right: MARGIN_LR, header: 200, footer: 200 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
