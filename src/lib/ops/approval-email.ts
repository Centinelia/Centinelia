const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
const LOGO_URL = `${BASE_URL}/logo-tagline.png`;

const CATEGORY_COLORS: Record<string, string> = {
  proveedor: '#6C3BFF',
  cliente:   '#22c55e',
  urgente:   '#ef4444',
  factura:   '#f59e0b',
  spam:      '#94a3b8',
  otro:      '#6b7280',
};

export function approvalEmailHtml(opts: {
  businessName:       string;
  emailFrom:          string;
  emailSubject:       string;
  category:           string;
  categoryLabel:      string;
  summary:            string;
  draft:              string | null;
  itemType:           'email' | 'invoice';
  invoiceData:        Record<string, string | number | null> | null;
  invoiceValid:       boolean | null;
  invoiceDiscrepancy: string | null;
  approveUrl:         string;
  rejectUrl:          string;
  portalUrl:          string;
  attachmentCount:    number;
}): string {
  const {
    businessName, emailFrom, emailSubject, category, categoryLabel,
    summary, draft, itemType, invoiceData, invoiceValid, invoiceDiscrepancy,
    approveUrl, rejectUrl, portalUrl, attachmentCount,
  } = opts;

  const accentColor = CATEGORY_COLORS[category] ?? '#6C3BFF';
  const BG      = '#120726';
  const CARD    = 'rgba(255,255,255,0.055)';
  const BORDER  = 'rgba(255,255,255,0.10)';
  const TEXT    = '#e2e8f0';
  const SUB     = 'rgba(255,255,255,0.58)';
  const MUTE    = 'rgba(255,255,255,0.35)';
  const HEADER  = '#EDE8FF';

  const invoiceSection = itemType === 'invoice' && invoiceData ? `
    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:16px;margin-bottom:16px">
      <p style="color:rgba(245,158,11,0.7);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">Datos de la factura</p>
      ${invoiceData.vendor  ? `<p style="color:${TEXT};font-size:13px;margin:0 0 6px"><span style="color:${MUTE};font-size:11px;text-transform:uppercase;font-weight:700">Proveedor:</span> ${invoiceData.vendor}</p>` : ''}
      ${invoiceData.amount  ? `<p style="color:${TEXT};font-size:13px;margin:0 0 6px"><span style="color:${MUTE};font-size:11px;text-transform:uppercase;font-weight:700">Monto:</span> $${Number(invoiceData.amount).toLocaleString('es-MX')} ${invoiceData.currency ?? 'MXN'}</p>` : ''}
      ${invoiceData.invoice_no ? `<p style="color:${TEXT};font-size:13px;margin:0 0 6px"><span style="color:${MUTE};font-size:11px;text-transform:uppercase;font-weight:700">No. Factura:</span> ${invoiceData.invoice_no}</p>` : ''}
      ${invoiceData.po_ref ? `<p style="color:${TEXT};font-size:13px;margin:0 0 0"><span style="color:${MUTE};font-size:11px;text-transform:uppercase;font-weight:700">Ref OC:</span> ${invoiceData.po_ref}</p>` : ''}
    </div>
    ${invoiceDiscrepancy ? `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:14px;margin-bottom:16px">
      <p style="color:#ef4444;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 6px">Discrepancia detectada</p>
      <p style="color:${TEXT};font-size:13px;margin:0">${invoiceDiscrepancy}</p>
    </div>` : (invoiceValid ? `
    <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:12px;margin-bottom:16px;text-align:center">
      <p style="color:#22c55e;font-size:12px;font-weight:700;margin:0">Factura validada correctamente</p>
    </div>` : '')}
  ` : '';

  const draftSection = draft ? `
    <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;padding:16px;margin-bottom:20px">
      <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">${itemType === 'invoice' ? 'Respuesta de confirmación' : 'Borrador de respuesta'}</p>
      <p style="color:${SUB};font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap">${draft}</p>
    </div>
  ` : '';

  const attachmentNote = attachmentCount > 0
    ? `<p style="color:${MUTE};font-size:12px;margin:0 0 16px">Adjuntos: ${attachmentCount} archivo${attachmentCount > 1 ? 's' : ''}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">
    <div style="background:${HEADER};border-radius:16px 16px 0 0;padding:20px 32px;text-align:center;border-bottom:1px solid rgba(108,59,255,0.15)">
      <img src="${LOGO_URL}" alt="Centinelia" width="200" style="width:200px;height:auto;display:inline-block">
    </div>
    <div style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:32px">

      <div style="text-align:center;margin-bottom:20px">
        <span style="display:inline-block;background:${accentColor}22;border:1px solid ${accentColor}40;border-radius:20px;padding:6px 16px;color:${accentColor};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${categoryLabel}</span>
      </div>

      <h1 style="color:${TEXT};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">Revisión pendiente</h1>
      <p style="color:${SUB};font-size:13px;margin:0 0 24px;text-align:center">${businessName}</p>

      <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;padding:16px;margin-bottom:16px">
        <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px">Email recibido</p>
        <p style="color:${TEXT};font-size:13px;font-weight:600;margin:0 0 4px">${emailSubject || '(sin asunto)'}</p>
        <p style="color:${SUB};font-size:12px;margin:0">De: ${emailFrom}</p>
      </div>

      ${attachmentNote}

      <div style="background:rgba(108,59,255,0.08);border:1px solid rgba(108,59,255,0.2);border-radius:10px;padding:14px;margin-bottom:16px">
        <p style="color:rgba(155,109,255,0.7);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 6px">Resumen</p>
        <p style="color:${TEXT};font-size:13px;line-height:1.65;margin:0">${summary}</p>
      </div>

      ${invoiceSection}
      ${draftSection}

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr>
          <td style="padding-right:8px;width:50%">
            <a href="${approveUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 12px;border-radius:12px">Aprobar y enviar</a>
          </td>
          <td style="padding-left:8px;width:50%">
            <a href="${rejectUrl}" style="display:block;text-align:center;background:transparent;border:1.5px solid rgba(239,68,68,0.35);color:#ef4444;font-size:14px;font-weight:600;text-decoration:none;padding:13px 12px;border-radius:12px">Rechazar</a>
          </td>
        </tr>
      </table>

      <div style="text-align:center">
        <a href="${portalUrl}" style="color:${MUTE};font-size:12px;text-decoration:none">Ver en el portal →</a>
      </div>

    </div>
    <div style="text-align:center;padding:24px 0 0">
      <p style="color:${MUTE};font-size:12px;margin:0">
        <a href="https://www.centinelia.mx" style="color:${MUTE};text-decoration:none">centinelia.mx</a>
        &nbsp;·&nbsp;
        <a href="mailto:hola@centinelia.mx" style="color:#9B6DFF;text-decoration:none">hola@centinelia.mx</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
