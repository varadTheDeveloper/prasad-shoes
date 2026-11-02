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
import {
  codAmountLines,
  codFromLines,
  codHeadLines,
  codItemLine,
  fromLines,
  orderLine,
  toLines,
  type LabelOrder,
  type LabelShop,
} from '../../../shared/label';

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

function toBlock(o: LabelOrder, spaceBefore: number): Paragraph[] {
  const size = sizeFor(o);
  return [
    para(AlignmentType.RIGHT, [run('TO, ', size, { bold: true }), run(o.ship_name, size, { bold: true })], {
      spacing: { before: spaceBefore, after: 0, line: 264 },
    }),
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

// ---- COD label (India Post) ---------------------------------------------------------------------
// Same half-page, same cut line; only the text inside differs. Top to bottom (right-aligned):
// Booking Under / Customer ID / Contract ID / Booking Date + Weight, the COD amount (figures and
// words), then "TO, <name>" and the address; "From :-" (left) with the sender – or the shop.
// The COD label has more lines, so its font is picked to fit the half page (14 pt down to 9 pt).
const COD_AMOUNT_GAP = 100;
const COD_TO_GAP = 160;
// Height the text may use in each half (the smaller of the two halves, minus a safety band).
const COD_ROOM = Math.min(TOP_HALF - 120, BOTTOM_HALF - CUT_GAP) - 300;

function codAllLines(o: LabelOrder, shop: LabelShop): string[] {
  const item = codItemLine(o);
  return [...codHeadLines(o), ...codAmountLines(o), ...(item ? [item] : []), `TO, ${o.ship_name}`, ...toLines(o), 'From :-', ...codFromLines(o, shop)];
}

/** Biggest font (half-points) at which every COD line fits in its half of the page. */
export function codSize(o: LabelOrder, shop: LabelShop): number {
  const lines = codAllLines(o, shop);
  for (const size of [28, 26, 24, 22, 20, 18]) {
    const perLine = Math.floor((55 * 28) / size); // ~55 characters per line at 14 pt
    const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
    // Nirmala UI line = font size x 1.33, x 1.1 for the paragraph line spacing (264/240); 20 twips per point
    const height = rows * (size / 2) * 20 * 1.33 * 1.1 + COD_AMOUNT_GAP + COD_TO_GAP + FROM_GAP;
    if (height <= COD_ROOM) return size;
  }
  return 18;
}

function codBlock(o: LabelOrder, shop: LabelShop, spaceBefore: number): Paragraph[] {
  const size = codSize(o, shop);
  const item = codItemLine(o);
  const right = (text: string, opts: { bold?: boolean } = {}, before = 0) =>
    para(AlignmentType.RIGHT, [run(text, size, opts)], before ? { spacing: { before, after: 0, line: 264 } } : {});
  return [
    ...codHeadLines(o).map((l, i) => right(l, { bold: i === 3 }, i === 0 ? spaceBefore : 0)),
    ...codAmountLines(o).map((l, i) => right(l, { bold: i === 0 }, i === 0 ? COD_AMOUNT_GAP : 0)),
    ...(item ? [right(item)] : []),
    para(AlignmentType.RIGHT, [run('TO, ', size, { bold: true }), run(o.ship_name, size, { bold: true })], {
      spacing: { before: COD_TO_GAP, after: 0, line: 264 },
    }),
    ...toLines(o).map((l) => right(l)),
    para(AlignmentType.LEFT, [run('From :-', size, { bold: true, underline: true })], { spacing: { before: FROM_GAP, after: 0, line: 264 } }),
    ...codFromLines(o, shop).map((l) => para(AlignmentType.LEFT, [run(l, size)])),
  ];
}

/** The text of one label: the COD template for COD orders, the (unchanged) Prepaid one otherwise. */
function labelBlock(o: LabelOrder, shop: LabelShop, spaceBefore: number): Paragraph[] {
  if (o.payment_type === 'COD') return codBlock(o, shop, spaceBefore);
  return [...toBlock(o, spaceBefore), ...fromBlock(shop)];
}

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const DASHED = { style: BorderStyle.DASHED, size: 8, color: '000000' };

// No cell margins (padding): WPS Office adds them on top of the EXACT row height, which pushed the
// bottom half onto the next page. The gaps come from paragraph spacing instead.
function cell(children: Paragraph[], align: typeof VerticalAlign.TOP | typeof VerticalAlign.BOTTOM, cutLineBelow = false) {
  return new TableCell({
    children: children.length ? children : [new Paragraph({ children: [] })],
    verticalAlign: align,
    width: { size: COL_W, type: WidthType.DXA },
    borders: { top: NONE, left: NONE, right: NONE, bottom: cutLineBelow ? DASHED : NONE },
  });
}

const row = (height: number, c: TableCell) => new TableRow({ height: { value: height, rule: HeightRule.EXACT }, cantSplit: true, children: [c] });

/** One half of the page: TO block (right), the COD/PREPAID line, then From (left) right under it.
 *  The rest of the half stays blank, so there is plenty of room around the cut line. */
function half(o: LabelOrder | null, shop: LabelShop, height: number, cutLineBelow: boolean, spaceBefore: number): TableRow[] {
  return [row(height, cell(o ? labelBlock(o, shop, spaceBefore) : [], VerticalAlign.TOP, cutLineBelow))];
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
