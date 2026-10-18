// Builds the editable Word file: A4 portrait, 2 labels per page, exactly like the shop's
// current "Post Office COD" file. One table row = one label (half a page), so Word moves to a
// new page after every 2 labels by itself, and there is no limit on the number of orders.
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
const SIZE = 28; // half-points -> 14 pt

// A4 in twips (1/1440 inch)
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_TB = 720; // 1.27 cm
const MARGIN_LR = 1080; // 1.9 cm
// Two rows must fit the usable height with a little room for Word's own rounding.
const ROW_H = Math.floor((PAGE_H - 2 * MARGIN_TB) / 2) - 60;

const font = { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT };

function run(text: string, opts: { bold?: boolean; underline?: boolean } = {}) {
  return new TextRun({
    text,
    font,
    size: SIZE,
    sizeComplexScript: SIZE,
    bold: opts.bold,
    boldComplexScript: opts.bold,
    underline: opts.underline ? {} : undefined,
  });
}

const right = (children: TextRun[], extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) =>
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 276 }, children, ...extra });
const left = (children: TextRun[], extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) =>
  new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 0, line: 276 }, children, ...extra });

function labelParagraphs(o: LabelOrder, shop: LabelShop): Paragraph[] {
  const to = toLines(o);
  const ps: Paragraph[] = [];
  ps.push(right([run('TO, ', { bold: true }), run(o.ship_name, { bold: true })]));
  for (const l of to) ps.push(right([run(l)]));
  // Order line, then the dashed cut line under it
  ps.push(right([run(orderLine(o), { bold: true })], { spacing: { before: 240, after: 120 } }));
  ps.push(
    new Paragraph({
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.DASHED, size: 8, color: '000000', space: 4 } },
      children: [run('')],
    }),
  );
  ps.push(left([run('From :-', { bold: true, underline: true })]));
  for (const l of fromLines(shop)) ps.push(left([run(l)]));
  return ps;
}

function emptyRow() {
  return new TableRow({
    height: { value: ROW_H, rule: HeightRule.ATLEAST },
    cantSplit: true,
    children: [new TableCell({ children: [new Paragraph({ children: [] })], borders: TableBorders.NONE })],
  });
}

export async function buildLabelsDocx(orders: LabelOrder[], shop: LabelShop): Promise<Buffer> {
  const rows = orders.map(
    (o) =>
      new TableRow({
        // "at least" half a page: a very long address grows the row instead of being cut off.
        height: { value: ROW_H, rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [
          new TableCell({
            children: labelParagraphs(o, shop),
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 240, bottom: 120, left: 120, right: 120 },
            borders: TableBorders.NONE,
          }),
        ],
      }),
  );
  if (rows.length === 0) rows.push(emptyRow());

  const doc = new Document({
    creator: shop.shop_name,
    title: 'Parcel labels',
    styles: {
      default: { document: { run: { font, size: SIZE, sizeComplexScript: SIZE } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN_TB, bottom: MARGIN_TB, left: MARGIN_LR, right: MARGIN_LR, header: 0, footer: 0 },
          },
        },
        children: [
          new Table({
            width: { size: PAGE_W - 2 * MARGIN_LR, type: WidthType.DXA },
            columnWidths: [PAGE_W - 2 * MARGIN_LR],
            borders: TableBorders.NONE,
            rows,
          }),
          // Word needs a paragraph after a table; keep it 1 pt so it never makes an extra blank page.
          new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' as any }, children: [new TextRun({ text: '', size: 2 })] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
