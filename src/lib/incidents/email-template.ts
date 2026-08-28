interface IncidentEmailInput {
  businessName: string;
  contactName?: string | null;
  contactPhone: string;
  address: string;
  motivo: string;
  capturedAt: Date;
  agentDisplayName: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Zona MX estándar. Vercel corre en UTC → getHours() da hora UTC (bug
// 2026-08-28: correos mostraban 19:28 cuando el evento pasó 13:28 MTY).
// Intl formatea directo en la tz correcta sin ajustes manuales.
const MX_TZ = 'America/Monterrey';

function formatFecha(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MX_TZ, day: '2-digit', month: 'numeric', year: '2-digit',
  }).formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value ?? '00';
  const monthNum = Number(parts.find(p => p.type === 'month')?.value ?? '1') - 1;
  const year = parts.find(p => p.type === 'year')?.value ?? '00';
  return `${day}-${MONTHS[monthNum]}-${year}`;
}

function formatHora(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MX_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function contactoLine(name: string | null | undefined, phone: string): string {
  if (name) {
    const cleaned = phone.replace(/^\+52/, '');
    return `${name} - ${cleaned}`;
  }
  return phone;
}

export function renderIncidentCardEmail(input: IncidentEmailInput): { subject: string; html: string } {
  const fecha = formatFecha(input.capturedAt);
  const hora = formatHora(input.capturedAt);
  const contacto = contactoLine(input.contactName, input.contactPhone);
  const subject = `Reporte de incidencia: ${input.businessName} (${fecha})`;
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p style="margin: 0 0 16px 0; color: #333;">
    Se registró una incidencia de cliente. Detalles a continuación:
  </p>
  <table border="1" cellspacing="0" cellpadding="10" style="border-collapse: collapse; width: 100%; border-color: #ccc;">
    <tr><td style="background-color: #f9e04c; font-weight: bold; width: 35%;">FECHA</td><td>${fecha}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">HORA</td><td>${hora}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">NOMBRE DEL NEGOCIO</td><td>${input.businessName}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">DIRECCIÓN</td><td>${input.address}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">MOTIVO</td><td>${input.motivo}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">CONTACTO</td><td>${contacto}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">VENDEDOR</td><td>&nbsp;</td></tr>
  </table>
  <p style="margin: 16px 0 0 0; color: #666; font-size: 13px;">
    Capturado por ${input.agentDisplayName}. En 3 días se hará llamada de verificación al cliente.
  </p>
</div>`.trim();
  return { subject, html };
}
