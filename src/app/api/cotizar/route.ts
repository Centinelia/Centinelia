import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, empresarialConfirmationHtml } from '@/lib/email/send';

/*
  SQL — run once in Supabase:

  CREATE TABLE enterprise_quotes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    empresa     TEXT NOT NULL,
    industria   TEXT,
    nombre      TEXT NOT NULL,
    apellido    TEXT NOT NULL,
    correo      TEXT NOT NULL,
    telefono    TEXT NOT NULL,
    empleados   TEXT NOT NULL,
    mensaje     TEXT,
    status      TEXT DEFAULT 'nuevo'
  );
*/

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ADMIN_EMAIL = 'hola@centinelia.mx';

function notifHtml(data: {
  empresa: string; industria: string; nombre: string; apellido: string;
  correo: string; telefono: string; empleados: string; mensaje: string;
}) {
  const rows = [
    ['Empresa',    data.empresa],
    ['Industria',  data.industria || '—'],
    ['Nombre',     `${data.nombre} ${data.apellido}`],
    ['Correo',     data.correo],
    ['Teléfono',   data.telefono],
    ['Empleados',  data.empleados],
    ['Mensaje',    data.mensaje || '—'],
  ];

  const C = { bg: '#120726', card: 'rgba(255,255,255,0.055)', border: 'rgba(255,255,255,0.10)', accent: '#9B6DFF', text: '#e2e8f0', sub: 'rgba(255,255,255,0.58)', mute: 'rgba(255,255,255,0.35)' };

  const tableRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid ${C.border};color:${C.mute};font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;width:100px;vertical-align:top">${label}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${C.border};color:${C.text};font-size:13px">${value}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:rgba(108,59,255,0.22);border:1px solid rgba(108,59,255,0.4);border-radius:20px;padding:6px 16px;text-align:center;display:inline-block;margin-bottom:20px">
      <span style="color:${C.accent};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">Nueva solicitud empresarial</span>
    </div>
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 20px">${data.empresa}</h1>
    <div style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:4px 20px">
      <table style="width:100%;border-collapse:collapse">${tableRows}</table>
    </div>
  </div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { empresa, industria = '', nombre, apellido, correo, telefono, empleados, mensaje = '' } = body;

  if (!empresa || !nombre || !apellido || !correo || !telefono || !empleados) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  await supabase.from('enterprise_quotes').insert({
    empresa, industria, nombre, apellido, correo, telefono, empleados, mensaje,
  });

  await Promise.all([
    sendEmail({
      to:      correo,
      subject: `Recibimos tu solicitud, ${nombre}`,
      html:    empresarialConfirmationHtml({ clientName: nombre, businessName: empresa, contactEmail: ADMIN_EMAIL }),
    }),
    sendEmail({
      to:      ADMIN_EMAIL,
      subject: `Nueva solicitud empresarial: ${empresa}`,
      html:    notifHtml({ empresa, industria, nombre, apellido, correo, telefono, empleados, mensaje }),
    }),
  ]);

  return NextResponse.json({ ok: true });
}
