// Builds the editable Word file: A4 portrait, 2 labels per page, no limit on the number of orders.
//
// Page layout (fixed, the same in MS Word, WPS Office and LibreOffice):
//
//   ┌──────────────────────────── A4 210 × 297 mm ────────────────────────────┐
//   │                 Booking Under … / Customer ID … / BNPL HUB … (centred)   │
//   │                 COD FOR RUPEES …                 (COD only)              │
//   │                                           TO, <name>   (right)           │
//   │                                           address / mobile / pin         │
//   │                                           PREPAID (…) / COD 1299 (…)     │
//   │  From :-  PRASAD SHOES …  (left)                                         │
//   ├ - - - - - - - - - - - - cut line at exactly 148.5 mm - - - - - - - - - - ┤
//   │                 (the second label, laid out the same way)                │
//   └──────────────────────────────────────────────────────────────────────────┘
//
// Each label sits in the MIDDLE of its half of the paper (client, 16 Nov 2026: the top label used to
// hug the paper edge with a big gap under it), so both halves look the same whatever the length.
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
  fromLines,
  headLines,
  labelOrderLine,
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

// ---- one label (COD and Prepaid, the shop's printed layout) -------------------------------------
//   header lines, centred (Customer ID line bold; COD adds the bold "COD FOR RUPEES" line) ->
//   "TO, <name>" + address, right-aligned -> "COD 1999 (…)" / "PREPAID (…)" (bold) ->
//   "From :-" + the shop, left-aligned.
const TO_GAP = 200; // header -> TO
const LINE_GAP = 160; // address -> COD / PREPAID line

// Where each label sits: in the middle of its half of the PAPER (0–148.5 mm and 148.5–297 mm).
// Top half: the label row starts at 8 mm (page margin) and is as tall as needed to centre it at
// 74.25 mm; a blank row under it ends at the cut line (its dashed bottom border).
// Bottom half: a blank row under the cut line, then the label row, centred at 222.75 mm.
const TOP_ROW = 2 * (HALF / 2 - (MARGIN_T + TOP_PARA)); // 7511 twips ≈ 132.5 mm
const TOP_SPACER = TOP_HALF - TOP_ROW; // ≈ 8 mm above the cut line
const BOTTOM_ROW = 2 * (BOTTOM_HALF - HALF / 2); // 7151 twips ≈ 126 mm
const BOTTOM_SPACER = BOTTOM_HALF - BOTTOM_ROW; // ≈ 11 mm below the cut line
// Height the text may use: the smaller label row minus 4 mm on each side, so there is always at
// least ~12 mm of blank paper next to the cut line and the paper edges.
const LABEL_ROOM = Math.min(TOP_ROW, BOTTOM_ROW) - 2 * 227;

/** Every line of one label, top to bottom (used for the font size and by the print page). */
export function labelLines(o: LabelOrder, shop: LabelShop): string[] {
  return [...headLines(o), `TO, ${o.ship_name}`, ...toLines(o), labelOrderLine(o), 'From :-', ...fromLines(shop)];
}

/** Biggest font (half-points, 14 pt down to 9 pt) at which every line of the label fits its half. */
export function labelSize(o: LabelOrder, shop: LabelShop): number {
  const lines = labelLines(o, shop);
  for (const size of [28, 26, 24, 22, 20, 18]) {
    const perLine = Math.floor((55 * 28) / size); // ~55 characters per line at 14 pt
    const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
    // Nirmala UI line = font size x 1.33, x 1.1 for the paragraph line spacing (264/240); 20 twips per point
    const height = rows * (size / 2) * 20 * 1.33 * 1.1 + TO_GAP + LINE_GAP + FROM_GAP;
    if (height <= LABEL_ROOM) return size;
  }
  return 18;
}

/** The text of one label (COD or Prepaid). */
function labelBlock(o: LabelOrder, shop: LabelShop): Paragraph[] {
  const size = labelSize(o, shop);
  const at = (before: number) => (before ? { spacing: { before, after: 0, line: 264 } } : {});
  return [
    ...headLines(o).map((l, i) => para(AlignmentType.CENTER, [run(l, size, { bold: i === 1 || i === 3 })])),
    para(AlignmentType.RIGHT, [run('TO, ', size, { bold: true }), run(o.ship_name, size, { bold: true })], at(TO_GAP)),
    ...toLines(o).map((l) => para(AlignmentType.RIGHT, [run(l, size)])),
    para(AlignmentType.RIGHT, [run(labelOrderLine(o), size, { bold: true })], at(LINE_GAP)),
    para(AlignmentType.LEFT, [run('From :-', size, { bold: true, underline: true })], at(FROM_GAP)),
    ...fromLines(shop).map((l) => para(AlignmentType.LEFT, [run(l, size)])),
  ];
}

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const DASHED = { style: BorderStyle.DASHED, size: 8, color: '000000' };
const blank = () => [new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' as any }, children: [new TextRun({ text: '', size: 2 })] })];

// No cell margins (padding): WPS Office adds them on top of the EXACT row height, which pushed the
// bottom half onto the next page. The gaps come from the row heights instead.
function cell(children: Paragraph[], cutLineBelow = false) {
  return new TableCell({
    children: children.length ? children : blank(),
    verticalAlign: VerticalAlign.CENTER,
    width: { size: COL_W, type: WidthType.DXA },
    borders: { top: NONE, left: NONE, right: NONE, bottom: cutLineBelow ? DASHED : NONE },
  });
}

const row = (height: number, c: TableCell) => new TableRow({ height: { value: height, rule: HeightRule.EXACT }, cantSplit: true, children: [c] });

function pageTable(top: LabelOrder | null, bottom: LabelOrder | null, shop: LabelShop) {
  return new Table({
    width: { size: COL_W, type: WidthType.DXA },
    columnWidths: [COL_W],
    borders: TableBorders.NONE,
    // The dashed cut line is the bottom edge of the top half = exactly 148.5 mm from the top.
    rows: [
      row(TOP_ROW, cell(top ? labelBlock(top, shop) : [])),
      row(TOP_SPACER, cell(blank(), true)),
      row(BOTTOM_SPACER, cell(blank())),
      row(BOTTOM_ROW, cell(bottom ? labelBlock(bottom, shop) : [])),
    ],
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
