/**
 * Fill a .docx template with user data via docxtemplater, then convert the
 * result to PDF using the CloudConvert API (Word Online engine).
 *
 * Why CloudConvert and not Google Drive?
 * Google Drive's docx→PDF converter is conservative and misrenders docx files
 * exported by fiscal systems (Solución Factible, CONTPAQ, Aspel), CRMs, or
 * legacy Word — collapsing lines to vertical, breaking table layouts. Users
 * expect "sube tu plantilla y sale igual" so we route through CloudConvert
 * which uses the real Word Online engine for perfect fidelity.
 *
 * Cost: CloudConvert free tier = 25 min/day (~150-300 conversions).
 * See centinelia.dev@gmail.com account for billing / paid plans.
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

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
    nullGetter:    () => '', // never fail on missing keys — render empty instead
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const CC_BASE = 'https://api.cloudconvert.com/v2';
const CC_POLL_INTERVAL_MS = 1000;
const CC_POLL_MAX_TRIES   = 90; // 90s cap — CloudConvert usually finishes in 2-10s

interface CCJobResponse {
  data: {
    id: string;
    tasks: CCTaskResponse[];
  };
}
interface CCTaskResponse {
  id:        string;
  name:      string;
  operation: string;
  status:    'waiting' | 'processing' | 'finished' | 'error';
  message?:  string;
  result?: {
    form?:  { url: string; parameters: Record<string, string> };
    files?: Array<{ filename: string; url: string; size: number }>;
  };
}

async function ccApi<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) throw new Error('CLOUDCONVERT_API_KEY no está configurada. Sin ella no puedo generar documentos desde tu plantilla Word.');
  const res = await fetch(`${CC_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`CloudConvert ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

/**
 * Convert a filled .docx buffer to PDF via CloudConvert (Word Online engine).
 * Signature preserved (agentId + supabase kept for backwards-compat but unused).
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  _agentId:    string,
  _supabase:   unknown,
): Promise<Buffer> {
  // 1. Create a job with import → convert → export chain
  const job = await ccApi<CCJobResponse>('/jobs', {
    method: 'POST',
    body: JSON.stringify({
      tasks: {
        'import-1': { operation: 'import/upload' },
        'convert-1': {
          operation:     'convert',
          input:         'import-1',
          input_format:  'docx',
          output_format: 'pdf',
          engine:        'office', // Word Online — highest fidelity
        },
        'export-1': { operation: 'export/url', input: 'convert-1' },
      },
    }),
  });

  // 2. Upload docx to import task
  const importTask = job.data.tasks.find(t => t.name === 'import-1')!;
  let form = importTask.result?.form;
  // Poll briefly if the form URL isn't ready immediately
  for (let i = 0; !form && i < 10; i++) {
    await new Promise(r => setTimeout(r, 300));
    const t = await ccApi<{ data: CCTaskResponse }>(`/tasks/${importTask.id}`);
    form = t.data.result?.form;
  }
  if (!form) throw new Error('CloudConvert import/upload no devolvió URL para subir el docx.');

  const fd = new FormData();
  for (const [k, v] of Object.entries(form.parameters)) fd.append(k, v);
  fd.append('file', new Blob([docxBuffer as unknown as BlobPart]), 'template.docx');
  const upRes = await fetch(form.url, { method: 'POST', body: fd });
  if (!upRes.ok) {
    throw new Error(`CloudConvert upload falló (${upRes.status}): ${(await upRes.text()).slice(0, 300)}`);
  }

  // 3. Poll job until all tasks finished or errored
  let finalTasks: CCTaskResponse[] | null = null;
  for (let i = 0; i < CC_POLL_MAX_TRIES; i++) {
    await new Promise(r => setTimeout(r, CC_POLL_INTERVAL_MS));
    const j = await ccApi<CCJobResponse>(`/jobs/${job.data.id}`);
    if (j.data.tasks.every(t => t.status === 'finished' || t.status === 'error')) {
      finalTasks = j.data.tasks;
      break;
    }
  }
  if (!finalTasks) throw new Error(`CloudConvert timeout tras ${CC_POLL_MAX_TRIES}s.`);

  const errored = finalTasks.find(t => t.status === 'error');
  if (errored) throw new Error(`CloudConvert task ${errored.name} falló: ${errored.message ?? 'sin mensaje'}`);

  // 4. Download exported PDF
  const exportTask = finalTasks.find(t => t.name === 'export-1');
  const fileUrl    = exportTask?.result?.files?.[0]?.url;
  if (!fileUrl) throw new Error('CloudConvert export/url no devolvió URL de descarga.');
  const pdfRes = await fetch(fileUrl);
  if (!pdfRes.ok) throw new Error(`CloudConvert PDF download falló (${pdfRes.status})`);
  return Buffer.from(await pdfRes.arrayBuffer());
}
