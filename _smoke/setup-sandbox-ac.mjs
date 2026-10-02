// Setup sandbox en OneDrive de Camila para dry-run E2E pre-Meet.
//
// Qué hace (idempotente):
//   1. Resuelve token Microsoft + location real del Excel de Camila.
//   2. Crea carpeta "_Centinelia_sandbox_E2E_dry_run" al lado del Excel real.
//   3. Copia Excel real → "AC_Inventario_SANDBOX_DRY_RUN.xlsx" dentro del sandbox.
//   4. Sube PDF sample BACKLOG → "BACKLOG_SAMPLE_DRY_RUN.pdf" dentro del sandbox.
//   5. Guarda state (sandboxExcelItemId, folderId, driveId, scope) en
//      C:/Users/Nazre/centinelia/.ac-sandbox-state.json
//
// Riesgo: cero sobre el Excel real. Solo crea archivos nuevos en una carpeta aparte,
// claramente nombrada como sandbox. inventory_excel_config NO se modifica.
//
// Uso: ALLOW_PROD_SMOKE=true node _smoke/setup-sandbox-ac.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') {
  console.error('Requiere ALLOW_PROD_SMOKE=true. Aborting.');
  process.exit(1);
}

const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const SANDBOX_FOLDER_NAME = '_Centinelia_sandbox_E2E_dry_run';
const SANDBOX_EXCEL_NAME  = 'AC_Inventario_SANDBOX_DRY_RUN.xlsx';
const SANDBOX_PDF_NAME    = 'BACKLOG_SAMPLE_DRY_RUN.pdf';
const SAMPLE_PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';
const STATE_FILE = 'C:/Users/Nazre/centinelia/.ac-sandbox-state.json';

const GRAPH = 'https://graph.microsoft.com/v1.0';

if (!fs.existsSync(SAMPLE_PDF)) {
  console.error('Sample PDF no encontrado:', SAMPLE_PDF);
  process.exit(1);
}

// ─── Helpers Graph ──────────────────────────────────────────────────────────
function driveBase(scope) {
  if (scope.type === 'me') return `${GRAPH}/me/drive`;
  if (scope.type === 'user') return `${GRAPH}/users/${encodeURIComponent(scope.userId)}/drive`;
  if (scope.type === 'site') {
    const drivePart = scope.driveId ? `/drives/${scope.driveId}` : '/drive';
    return `${GRAPH}/sites/${scope.siteId}${drivePart}`;
  }
  throw new Error(`scope.type desconocido: ${scope.type}`);
}

async function gfetch(url, init = {}, { expect = 'json' } = {}) {
  const r = await fetch(url, init);
  if (!r.ok && r.status !== 202) {
    const body = await r.text();
    throw new Error(`Graph ${r.status} ${init.method ?? 'GET'} ${url}\n  → ${body.slice(0, 400)}`);
  }
  if (expect === 'json' && r.status !== 204) {
    const txt = await r.text();
    try { return txt ? JSON.parse(txt) : null; } catch { return txt; }
  }
  if (expect === 'response') return r;
  return null;
}

async function getItem(token, scope, itemId) {
  return await gfetch(`${driveBase(scope)}/items/${itemId}?$select=id,name,parentReference`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function listChildren(token, scope, parentItemId) {
  const data = await gfetch(`${driveBase(scope)}/items/${parentItemId}/children?$select=id,name,folder,file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.value ?? [];
}

async function createFolder(token, scope, parentItemId, name) {
  return await gfetch(`${driveBase(scope)}/items/${parentItemId}/children`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });
}

async function copyItem(token, scope, sourceItemId, targetParentItemId, newName, targetDriveId) {
  const r = await gfetch(`${driveBase(scope)}/items/${sourceItemId}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parentReference: { driveId: targetDriveId, id: targetParentItemId },
      name: newName,
    }),
  }, { expect: 'response' });
  const monitorUrl = r.headers.get('location');
  if (!monitorUrl) throw new Error('Copy no devolvió Location header');
  // Poll monitor hasta success
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise(res => setTimeout(res, 1500));
    const mr = await fetch(monitorUrl);
    const mj = await mr.json();
    if (mj.status === 'completed' || mj.resourceId) return mj.resourceId;
    if (mj.status === 'failed') throw new Error('Copy failed: ' + JSON.stringify(mj));
  }
  throw new Error('Copy timeout 60s');
}

async function uploadFile(token, scope, parentItemId, name, bytes) {
  return await gfetch(`${driveBase(scope)}/items/${parentItemId}:/${encodeURIComponent(name)}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
}

// ─── Flow ───────────────────────────────────────────────────────────────────
console.log('── 1. Resolver ctx (token + location real) ──');
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error('ctx err:', ctx); process.exit(1); }
const { token, config } = ctx;
const scope = config.location.scope;
const realItemId = config.location.itemId;
console.log('  realItemId:', realItemId);
console.log('  scope:', JSON.stringify(scope));

console.log('\n── 2. Lookup parent folder del Excel real ──');
const realItem = await getItem(token, scope, realItemId);
console.log('  Excel real:', realItem.name);
const parentId = realItem.parentReference?.id;
const parentDriveId = realItem.parentReference?.driveId ?? scope.driveId;
if (!parentId) { console.error('No parentReference.id en Excel real'); process.exit(1); }
console.log('  Parent folder id:', parentId);
console.log('  Parent driveId:', parentDriveId);

console.log('\n── 3. Verificar/crear sandbox folder ──');
const parentChildren = await listChildren(token, scope, parentId);
let sandboxFolder = parentChildren.find(c => c.name === SANDBOX_FOLDER_NAME && c.folder);
if (sandboxFolder) {
  console.log('  Ya existe:', SANDBOX_FOLDER_NAME, '(id=' + sandboxFolder.id + ') → reuse');
} else {
  sandboxFolder = await createFolder(token, scope, parentId, SANDBOX_FOLDER_NAME);
  console.log('  Creada:', SANDBOX_FOLDER_NAME, '(id=' + sandboxFolder.id + ')');
}

console.log('\n── 4. Verificar/copiar Excel sandbox ──');
const sandboxChildren = await listChildren(token, scope, sandboxFolder.id);
let sandboxExcel = sandboxChildren.find(c => c.name === SANDBOX_EXCEL_NAME && c.file);
if (sandboxExcel) {
  console.log('  Ya existe:', SANDBOX_EXCEL_NAME, '(id=' + sandboxExcel.id + ') → reuse');
} else {
  console.log('  Copiando desde real → sandbox (async, poll 60s)...');
  const newId = await copyItem(token, scope, realItemId, sandboxFolder.id, SANDBOX_EXCEL_NAME, parentDriveId);
  sandboxExcel = { id: newId, name: SANDBOX_EXCEL_NAME };
  console.log('  Copiado (id=' + newId + ')');
}

console.log('\n── 5. Verificar/subir PDF sample BACKLOG ──');
let sandboxPdf = sandboxChildren.find(c => c.name === SANDBOX_PDF_NAME && c.file);
if (sandboxPdf) {
  console.log('  Ya existe:', SANDBOX_PDF_NAME, '(id=' + sandboxPdf.id + ') → reuse');
} else {
  console.log('  Uploading PDF local → sandbox...');
  const pdfBytes = fs.readFileSync(SAMPLE_PDF);
  sandboxPdf = await uploadFile(token, scope, sandboxFolder.id, SANDBOX_PDF_NAME, pdfBytes);
  console.log('  Subido (id=' + sandboxPdf.id + ', ' + pdfBytes.length + ' bytes)');
}

console.log('\n── 6. Guardar state ──');
const state = {
  updated_at: new Date().toISOString(),
  portal: PORTAL,
  nami_agent_id: NAMI,
  real_excel_item_id: realItemId,
  sandbox_folder_id: sandboxFolder.id,
  sandbox_folder_name: SANDBOX_FOLDER_NAME,
  sandbox_excel_item_id: sandboxExcel.id,
  sandbox_excel_name: SANDBOX_EXCEL_NAME,
  sandbox_backlog_pdf_item_id: sandboxPdf.id,
  sandbox_backlog_pdf_name: SANDBOX_PDF_NAME,
  scope,
  parent_drive_id: parentDriveId,
};
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
console.log('  Escrito:', STATE_FILE);
console.log('\n✓ DONE. Sandbox listo. inventory_excel_config NO fue modificado.');
console.log('  Siguiente: ALLOW_PROD_SMOKE=true node _smoke/e2e-sandbox-ac.mjs');
