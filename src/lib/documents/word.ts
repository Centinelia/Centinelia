import {
  Document, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Packer, BorderStyle,
  Table, TableRow, TableCell, WidthType,
  Header, ImageRun,
} from 'docx';

export interface WordOptions {
  title:         string;
  content:       string;
  templateType?: 'general' | 'proposal' | 'letter';
  // proposal
  clientName?:   string;
  clientEmail?:  string;
  totalPrice?:   string;
  validityDays?: number;
  // letter
  recipientName?:  string;
  recipientEmail?: string;
  // branding
  businessName?: string;
  accentColor?:  string; // hex without #
}

function parseContent(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();

    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text:    line.slice(2),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      }));
    } else if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text:    line.slice(3),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
      }));
    } else if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        text:    line.slice(4),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 160, after: 60 },
      }));
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      paragraphs.push(new Paragraph({
        text:   line.slice(2),
        bullet: { level: 0 },
      }));
    } else if (/^\d+\.\s/.test(line)) {
      paragraphs.push(new Paragraph({
        text:           line.replace(/^\d+\.\s/, ''),
        numbering: { reference: 'default-numbering', level: 0 },
      }));
    } else if (line === '') {
      paragraphs.push(new Paragraph({ text: '' }));
    } else {
      // Handle **bold** inline
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const runs  = parts.map(p => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return new TextRun({ text: p.slice(2, -2), bold: true });
        }
        return new TextRun({ text: p });
      });
      paragraphs.push(new Paragraph({ children: runs }));
    }
  }

  return paragraphs;
}

function metaRow(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value }),
    ],
    spacing: { before: 40, after: 40 },
  });
}

export async function generateWord(opts: WordOptions): Promise<Buffer> {
  const { title, content, templateType = 'general', businessName, accentColor } = opts;
  const color = (accentColor ?? '6C3BFF').replace('#', '');

  const titleParagraph = new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 56, color })],
    alignment: AlignmentType.LEFT,
    spacing:   { before: 0, after: 240 },
    border:    { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 8 } },
  });

  const metaParagraphs: Paragraph[] = [];

  if (businessName) {
    metaParagraphs.push(new Paragraph({
      children: [new TextRun({ text: businessName, bold: true, size: 24, color: '666666' })],
      spacing:  { before: 0, after: 60 },
    }));
  }

  if (templateType === 'proposal') {
    if (opts.clientName)   metaParagraphs.push(metaRow('Cliente', opts.clientName));
    if (opts.clientEmail)  metaParagraphs.push(metaRow('Correo', opts.clientEmail));
    if (opts.totalPrice)   metaParagraphs.push(new Paragraph({
      children: [new TextRun({ text: `Total: ${opts.totalPrice}`, bold: true, size: 28, color })],
      spacing: { before: 80, after: 80 },
    }));
    if (opts.validityDays) metaParagraphs.push(metaRow('Válido por', `${opts.validityDays} días`));
  }

  if (templateType === 'letter') {
    if (opts.recipientName)  metaParagraphs.push(metaRow('Para', opts.recipientName));
    if (opts.recipientEmail) metaParagraphs.push(metaRow('Correo', opts.recipientEmail));
    metaParagraphs.push(new Paragraph({
      text:    new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }),
      spacing: { before: 80, after: 80 },
    }));
  }

  const contentParagraphs = parseContent(content);

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level:  0,
          format: 'decimal',
          text:   '%1.',
          alignment: AlignmentType.START,
        }],
      }],
    },
    sections: [{
      properties: {},
      children: [
        titleParagraph,
        ...metaParagraphs,
        ...(metaParagraphs.length > 0 ? [new Paragraph({ text: '', spacing: { before: 120, after: 0 } })] : []),
        ...contentParagraphs,
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
