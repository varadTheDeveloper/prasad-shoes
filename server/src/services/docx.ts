// Builds the editable Word file: A4 portrait, ONE order per page, with the same label text as
// the shop's "Post Office COD" file. Each order starts on a new page (page break), so
// N orders = N pages and there is no limit on the number of orders.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { fromLines, orderLine, toLines, type LabelOrder, type LabelShop } from '../../../shared/label';

const FONT = 'Nirmala UI'; // ships with Windows; prints English, Marathi and Hindi
const SIZE = 28; // half-points -> 14 pt

// A4 in twips (1/1440 inch)
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_TB = 720; // 1.27 cm
const MARGIN_LR = 1080; // 1.9 cm

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

function labelParagraphs(o: LabelOrder, shop: LabelShop, newPage: boolean): Paragraph[] {
  const to = toLines(o);
  const ps: Paragraph[] = [];
  ps.push(right([run('TO, ', { bold: true }), run(o.ship_name, { bold: true })], newPage ? { pageBreakBefore: true } : {}));
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

export async function buildLabelsDocx(orders: LabelOrder[], shop: LabelShop): Promise<Buffer> {
  const children: Paragraph[] = [];
  orders.forEach((o, i) => {
    // Every order after the first starts on a new page.
    children.push(...labelParagraphs(o, shop, i > 0));
  });
  if (children.length === 0) children.push(new Paragraph({ children: [] }));

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
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
