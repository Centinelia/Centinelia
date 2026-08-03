/**
 * Fill a .docx template with user data via docxtemplater, then convert the
 * result to PDF using the agent's own Google Drive or OneDrive OAuth connection.
 *
 * Uses the user's Drive as a "conversion engine" — no external services,
 * no additional cost. Temp file is deleted after conversion.
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { createAdminClient } from '@/lib/supabase/admin';
import { getConnector, type IntegrationRow } from '@/lib/connectors';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const TEMP_FILE_PREFIX = 'centinelia-temp-';

/** Fill a .docx template buffer using docxtemplater. Returns filled .docx buffer. */
export function fillDocxTemplate(
  templateBuffer: Buffer,
  data:           Record<string, unknown>,
): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
    delimiters:    { start: '{{', end: '}}' },
    errorLogging:  false,
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

interface DriveIntegration {
  provider:      'gmail' | 'outlook';
  access_token:  string;
  refresh_token: string;
  token_expires_at: string;
}

/**
 * Convert a filled .docx buffer to PDF using the agent's connected Drive.
 * Google: upload as Google Doc (auto-conversion) → export PDF → delete.
 * Microsoft: upload → GET content?format=pdf → delete.
 * Throws if the agent has no email_integrations row.
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  agentId:    string,
  supabase:   SupabaseClient,
): Promise<Buffer> {
  const { data } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', agentId)
    .single();

  if (!data) {
    throw new Error('Sin Google Drive u OneDrive conectado. Conecta uno desde Portal → Integraciones → Correo para poder generar documentos desde tu plantilla.');
  }

  // Ensure token is fresh (getConnector performs refresh if needed)
  await getConnector(data as IntegrationRow, supabase);

  // Re-read after possible refresh
  const { data: fresh } = await supabase
    .from('email_integrations')
    .select('provider, access_token, refresh_token, token_expires_at')
    .eq('agent_id', agentId)
    .single();
  const integration = fresh as DriveIntegration;

  return integration.provider === 'gmail'
    ? convertViaGoogleDrive(docxBuffer, integration.access_token)
    : convertViaOneDrive(docxBuffer, integration.access_token);
}

async function convertViaGoogleDrive(docxBuffer: Buffer, accessToken: string): Promise<Buffer> {
  const tempName = `${TEMP_FILE_PREFIX}${Date.now()}`;
  const boundary = `docx_convert_${Date.now()}`;
  const metadata = {
    name:     tempName,
    mimeType: 'application/vnd.google-apps.document', // auto-convert on upload
  };

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
    ),
    docxBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  // 1. Upload .docx with target mimeType = Google Doc → Drive converts automatically
  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method:  'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    },
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Google Drive conversion upload failed (${uploadRes.status}): ${err.slice(0, 300)}`);
  }
  const { id: fileId } = await uploadRes.json() as { id: string };

  try {
    // 2. Export as PDF
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!exportRes.ok) {
      const err = await exportRes.text();
      throw new Error(`Google Drive PDF export failed (${exportRes.status}): ${err.slice(0, 300)}`);
    }
    return Buffer.from(await exportRes.arrayBuffer());
  } finally {
    // 3. Always delete temp file, even if export failed
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => { /* best effort */ });
  }
}

async function convertViaOneDrive(docxBuffer: Buffer, accessToken: string): Promise<Buffer> {
  const tempName = `${TEMP_FILE_PREFIX}${Date.now()}.docx`;

  // 1. Upload .docx to OneDrive root
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(tempName)}:/content?@microsoft.graph.conflictBehavior=rename`,
    {
      method:  'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      body: docxBuffer as unknown as BodyInit,
    },
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`OneDrive upload failed (${uploadRes.status}): ${err.slice(0, 300)}`);
  }
  const { id: itemId } = await uploadRes.json() as { id: string };

  try {
    // 2. Convert to PDF (Graph returns 302 to the PDF download URL by default)
    const convertRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content?format=pdf`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!convertRes.ok) {
      const err = await convertRes.text();
      throw new Error(`OneDrive PDF conversion failed (${convertRes.status}): ${err.slice(0, 300)}`);
    }
    return Buffer.from(await convertRes.arrayBuffer());
  } finally {
    await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => { /* best effort */ });
  }
}
