/**
 * daily.test.ts — TDD para buildDailyReport y sendDailyReport.
 *
 * Mocks:
 *   - @/lib/billing/storage/dropbox   (DropboxClient)
 *   - @/lib/billing/excel/workbook    (ExcelWorkbook)
 *   - @/lib/supabase/admin            (createAdminClient)
 *   - @/lib/billing/mail/send         (sendBillingMail)
 *
 * Casos:
 *   1. buildDailyReport — notitas normales (con xmlPath, con registros en log)
 *   2. buildDailyReport — escalaciones presentes (requiereAtencion no vacio)
 *   3. buildDailyReport — 0 notitas del dia (mensaje sin actividad)
 *   4. sendDailyReport  — cuerpo con secciones correctas + attachment Excel
 *   5. sendDailyReport  — sección "Requieren tu atención" listada cuando no vacia
 *   6. sendDailyReport  — sin sección requieren cuando vacia
 *   7. sendDailyReport  — retorna messageId de sendBillingMail
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks hoisted
// ---------------------------------------------------------------------------

const {
  mockDropboxReadFile,
  mockDropboxWriteFile,
  mockExcelGetRows,
  mockExcelToBuffer,
  mockExcelEmpty,
  mockExcelFromBuffer,
  mockSupabaseFrom,
  mockSendBillingMail,
} = vi.hoisted(() => ({
  mockDropboxReadFile:  vi.fn(),
  mockDropboxWriteFile: vi.fn(),
  mockExcelGetRows:     vi.fn(),
  mockExcelToBuffer:    vi.fn(),
  mockExcelEmpty:       vi.fn(),
  mockExcelFromBuffer:  vi.fn(),
  mockSupabaseFrom:     vi.fn(),
  mockSendBillingMail:  vi.fn(),
}));

vi.mock('@/lib/billing/storage/dropbox', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DropboxClient: vi.fn().mockImplementation(function (this: any) {
    this.readFile  = mockDropboxReadFile;
    this.writeFile = mockDropboxWriteFile;
  }),
}));

vi.mock('@/lib/billing/excel/workbook', () => ({
  ExcelWorkbook: {
    fromBuffer: mockExcelFromBuffer,
    empty:      mockExcelEmpty,
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockSupabaseFrom }),
}));

vi.mock('@/lib/billing/mail/send', () => ({
  sendBillingMail: mockSendBillingMail,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { buildDailyReport, sendDailyReport } from '@/lib/billing/reports/daily';
import type { DailyReport } from '@/lib/billing/reports/daily';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_DATE = '2026-08-17';

const BASE_CTX = {
  portalEmail: 'empresa@example.com',
  integrationId: 'integ-001',
  dropboxToken:  'dbx-token-test',
};

const BASE_PATH = '/Facturacion/2026';

/** Filas de ventas de ejemplo en el Excel diario. */
const MOCK_VENTAS_ROWS = [
  { num: 1, hora: '09:15', cliente: 'Tortilleria El Sol', rfc: 'TES010101ABC', productos: 'Tortillas', total: 120, metodo: 'efectivo', status: 'listo_timbrar', factura: '' },
  { num: 2, hora: '10:30', cliente: 'Miscelanea La Luna', rfc: 'MLL020202XYZ', productos: 'Pan', total: 85, metodo: 'efectivo', status: 'listo_timbrar', factura: '' },
  { num: 3, hora: '11:00', cliente: 'PUBLICO EN GENERAL', rfc: 'XAXX010101000', productos: 'Refrescos', total: 54, metodo: 'efectivo', status: 'publico_general', factura: '' },
  { num: 4, hora: '12:45', cliente: 'PUBLICO EN GENERAL', rfc: 'XAXX010101000', productos: 'Dulces', total: 28, metodo: 'efectivo', status: 'publico_general', factura: '' },
  { num: 5, hora: '14:00', cliente: 'Panaderia Central', rfc: 'PAC030303DEF', productos: 'Harina', total: 350, metodo: 'transferencia', status: 'acumulado_semanal', factura: '' },
];

/** Filas con escalaciones. */
const MOCK_VENTAS_CON_ESCALACION = [
  { num: 23, hora: '10:00', cliente: 'Miscelanea El Sol', rfc: '', productos: 'Varios', total: 200, metodo: 'efectivo', status: 'escalado', factura: '' },
  { num: 31, hora: '14:30', cliente: 'Cliente Grande SA', rfc: 'CGS040404GHI', productos: 'Servicio', total: 8450, metodo: 'transferencia', status: 'monto_inusual', factura: '' },
];

/** Registros de activity_log con escalaciones (schema real: action_type, severity, entity_ref, context, timestamp). */
const MOCK_ACTIVITY_LOG_ESCALACIONES = [
  {
    action_type: 'escalation',
    severity:    'error',
    entity_ref:  'cliente_desconocido',
    context:     { notita_num: 23, motivo: 'no reconoci al cliente "Miscelanea El Sol". Es nuevo?', email_id: 'email-abc' },
    timestamp:   '2026-08-17T10:05:00Z',
  },
  {
    action_type: 'monto_inusual',
    severity:    'warning',
    entity_ref:  'CGS040404GHI',
    context:     { notita_num: 31, motivo: 'monto inusual ($8,450). Verifica antes de timbrar.', email_id: 'email-abc' },
    timestamp:   '2026-08-17T14:35:00Z',
  },
];

/** Mock del buffer de Excel. */
const MOCK_EXCEL_BUFFER = Buffer.from('fake-excel-content');

// ---------------------------------------------------------------------------
// Setup comun
// ---------------------------------------------------------------------------

function setupDropboxExcelRead(rows: object[]) {
  mockDropboxReadFile.mockResolvedValue(MOCK_EXCEL_BUFFER);
  mockExcelToBuffer.mockResolvedValue(MOCK_EXCEL_BUFFER);
  mockExcelGetRows.mockReturnValue(rows);
  mockExcelFromBuffer.mockResolvedValue({
    getRows: mockExcelGetRows,
    toBuffer: mockExcelToBuffer,
  });
}

function setupActivityLog(rows: object[]) {
  const selectResult = {
    eq:     vi.fn().mockReturnValue({
      gte:    vi.fn().mockReturnValue({
        lte:  vi.fn().mockReturnValue({
          data: rows, error: null,
        }),
      }),
    }),
  };
  mockSupabaseFrom.mockReturnValue({
    select: vi.fn().mockReturnValue(selectResult),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildDailyReport
// ---------------------------------------------------------------------------

describe('buildDailyReport', () => {
  it('cuenta correctamente processed, escalated, consulted y totales por status', async () => {
    setupDropboxExcelRead(MOCK_VENTAS_ROWS);
    setupActivityLog([]);

    const report = await buildDailyReport(TEST_DATE, BASE_CTX, BASE_PATH);

    // 2 listo_timbrar + 2 publico_general + 1 acumulado_semanal = 5 processed
    expect(report.processed).toBe(5);
    expect(report.escalated).toBe(0);
    // Acumulados: 1
    expect(report.consulted).toBe(1);
    // Publico general: $54 + $28 = $82
    expect(report.totalNoFacturado).toBe(82);
    // listo_timbrar: $120 + $85 = $205
    expect(report.totalFacturado).toBe(205);
    expect(report.date).toBe(TEST_DATE);
  });

  it('incluye requiereAtencion con las escalaciones del log del dia', async () => {
    setupDropboxExcelRead([...MOCK_VENTAS_ROWS, ...MOCK_VENTAS_CON_ESCALACION]);
    setupActivityLog(MOCK_ACTIVITY_LOG_ESCALACIONES);

    const report = await buildDailyReport(TEST_DATE, BASE_CTX, BASE_PATH);

    expect(report.requiereAtencion).toHaveLength(2);
    expect(report.requiereAtencion[0]).toMatchObject({ notitaNum: 23 });
    expect(report.requiereAtencion[1]).toMatchObject({ notitaNum: 31 });
    expect(report.escalated).toBe(2);
  });

  it('retorna processed=0 cuando no hay filas en el Excel (sin actividad)', async () => {
    setupDropboxExcelRead([]);
    setupActivityLog([]);

    const report = await buildDailyReport(TEST_DATE, BASE_CTX, BASE_PATH);

    expect(report.processed).toBe(0);
    expect(report.totalFacturado).toBe(0);
    expect(report.totalNoFacturado).toBe(0);
    expect(report.requiereAtencion).toHaveLength(0);
  });

  it('incluye dailyExcelPath con el nombre correcto del archivo', async () => {
    setupDropboxExcelRead(MOCK_VENTAS_ROWS);
    setupActivityLog([]);

    const report = await buildDailyReport(TEST_DATE, BASE_CTX, BASE_PATH);

    expect(report.dailyExcelPath).toContain('2026-08-17');
    expect(report.dailyExcelPath).toContain('.xlsx');
  });

  it('expone xmlPath cuando existe en el Excel (status listo_timbrar)', async () => {
    const rowsConXml = [
      { ...MOCK_VENTAS_ROWS[0], status: 'listo_timbrar' },
    ];
    setupDropboxExcelRead(rowsConXml);
    setupActivityLog([]);

    const report = await buildDailyReport(TEST_DATE, BASE_CTX, BASE_PATH);

    // xmlPath debe incluir la fecha
    expect(report.xmlPath).toContain('2026-08-17');
  });
});

// ---------------------------------------------------------------------------
// sendDailyReport
// ---------------------------------------------------------------------------

describe('sendDailyReport', () => {
  const BASE_REPORT: DailyReport = {
    date: TEST_DATE,
    processed: 47,
    escalated: 2,
    consulted: 6,
    totalFacturado: 4500,
    totalNoFacturado: 82,
    requiereAtencion: [
      { notitaNum: 23, motivo: 'no reconoci al cliente "Miscelanea El Sol". Es nuevo?' },
      { notitaNum: 31, motivo: 'monto inusual ($8,450). Verifica antes de timbrar.' },
    ],
    xmlPath:       '/Facturacion/2026/pendientes_importar/facturas_2026-08-17.xml',
    dailyExcelPath: '/Facturacion/2026/diario/Ventas_2026-08-17.xlsx',
  };

  beforeEach(() => {
    mockSendBillingMail.mockResolvedValue({ messageId: '<msg-123@centinelia.internal>' });
    // Buffer del Excel adjunto
    mockDropboxReadFile.mockResolvedValue(MOCK_EXCEL_BUFFER);
  });

  it('llama a sendBillingMail una vez por destinatario', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    expect(mockSendBillingMail).toHaveBeenCalledTimes(1);
  });

  it('envia a multiples destinatarios (un correo por cada uno)', async () => {
    await sendDailyReport(BASE_REPORT, ['a@empresa.mx', 'b@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    expect(mockSendBillingMail).toHaveBeenCalledTimes(2);
  });

  it('el cuerpo menciona el numero de notitas procesadas', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.body).toContain('47');
  });

  it('el cuerpo incluye la seccion "Requieren tu atencion" con los items listados', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.body).toContain('Requieren');
    expect(callArgs.body).toContain('Notita #23');
    expect(callArgs.body).toContain('Notita #31');
  });

  it('omite la seccion "Requieren" cuando requiereAtencion esta vacia', async () => {
    const reportLimpio: DailyReport = { ...BASE_REPORT, requiereAtencion: [], escalated: 0 };

    await sendDailyReport(reportLimpio, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.body).not.toContain('Requieren tu atencion');
    expect(callArgs.body).not.toContain('Requieren tu atenci');
  });

  it('adjunta el Excel diario con el nombre correcto', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.attachments).toHaveLength(1);
    expect(callArgs.attachments![0].filename).toContain('2026-08-17');
    expect(callArgs.attachments![0].filename).toContain('.xlsx');
  });

  it('incluye el asunto con la fecha del dia', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.subject).toContain('2026-08-17');
  });

  it('retorna el messageId del correo enviado', async () => {
    const result = await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    expect(result).toHaveProperty('messageId');
    expect(result.messageId).toBe('<msg-123@centinelia.internal>');
  });

  it('el cuerpo menciona el archivo XML en Dropbox cuando hay listo_timbrar', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.body).toContain('pendientes_importar');
  });

  it('cuerpo con 0 notitas menciona sin actividad', async () => {
    const reportVacio: DailyReport = {
      date: TEST_DATE,
      processed: 0,
      escalated: 0,
      consulted: 0,
      totalFacturado: 0,
      totalNoFacturado: 0,
      requiereAtencion: [],
      dailyExcelPath: '/Facturacion/2026/diario/Ventas_2026-08-17.xlsx',
    };

    await sendDailyReport(reportVacio, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.body).toContain('sin actividad');
  });

  it('no usa guiones em-dash ni emojis en el cuerpo', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    // Em-dash: U+2014
    expect(callArgs.body).not.toContain('—');
    // Emoji range check (simplified: no common emojis)
    expect(callArgs.body).not.toMatch(/[\u{1F600}-\u{1F64F}]/u);
  });

  it('incluye mensaje "OK timbrado" en el pie del correo', async () => {
    await sendDailyReport(BASE_REPORT, ['contadora@empresa.mx'], { dropboxToken: 'dbx-token', dropboxBasePath: BASE_PATH });

    const callArgs = mockSendBillingMail.mock.calls[0][0];
    expect(callArgs.body).toContain('OK timbrado');
  });
});
