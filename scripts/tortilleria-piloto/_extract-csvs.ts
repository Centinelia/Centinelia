/**
 * Dev-only: extrae CSVs de la BD `adTortillasEstrella_PILOTO_DEV` (SQL Express local)
 * al formato que consume CONTPAQiAdapter (csv-parser.ts) para hacer E2E sin depender
 * del Windows agent + Dropbox.
 *
 * Uso:
 *   npx tsx scripts/tortilleria-piloto/_extract-csvs.ts
 *
 * Produce:
 *   dev-fixtures/tortilleria-piloto/Config/contpaqi_clientes.csv
 *   dev-fixtures/tortilleria-piloto/Config/contpaqi_productos.csv
 *   dev-fixtures/tortilleria-piloto/Config/last_sync.json
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', '..');
const OUT_DIR = join(REPO_ROOT, 'dev-fixtures', 'tortilleria-piloto', 'Config');

const SQL_INSTANCE = '(local)\\SQLEXPRESS';
const SQL_DB = 'adTortillasEstrella_PILOTO_DEV';
const SQL_USER = 'sa';
const SQL_PASS = 'PilotoEstrella2026!';
const SEP = '\x1f';

function runSql(query: string): string[][] {
  const args = [
    '-S', SQL_INSTANCE, '-d', SQL_DB, '-U', SQL_USER, '-P', SQL_PASS,
    '-h', '-1', '-s', SEP, '-W', '-Q', query,
  ];
  const res = spawnSync('sqlcmd', args, { encoding: 'utf-8' });
  if (res.status !== 0) throw new Error(`sqlcmd failed: ${res.stderr}\n${res.stdout}`);
  return res.stdout
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\(\d+ rows? affected\)$/.test(l.trim()))
    .map((l) => l.split(SEP).map((f) => f.trim()));
}

function toCsvField(v: string): string {
  const needs = /[",\r\n]/.test(v);
  if (!needs) return v;
  return '"' + v.replace(/"/g, '""') + '"';
}

function toCsv(header: string[], rows: string[][]): string {
  const bom = '﻿';
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.map(toCsvField).join(','));
  return bom + lines.join('\n') + '\n';
}

console.log('[extract-csvs] Querying clientes...');
const clientesRows = runSql(`
SET NOCOUNT ON;
SELECT TOP 40
  c.CRFC,
  CAST(c.CIDCLIENTEPROVEEDOR AS varchar(20)),
  c.CRAZONSOCIAL,
  ISNULL(NULLIF(c.CUSOCFDI, ''), 'G01'),
  '612',
  ISNULL(d.CCODIGOPOSTAL, '64000'),
  ISNULL(c.CEMAIL1, ''),
  ISNULL(d.CTELEFONO1, '')
FROM admClientes c
LEFT JOIN admDomicilios d
  ON d.CIDCATALOGO = c.CIDCLIENTEPROVEEDOR
 AND d.CTIPOCATALOGO = 1
 AND d.CTIPODIRECCION = 1
WHERE c.CRFC IS NOT NULL
  AND c.CRFC <> ''
  AND c.CRFC NOT LIKE 'XAX%'
  AND LEN(c.CRFC) IN (12,13)
  AND c.CTIPOCLIENTE = 1
  AND c.CESTATUS = 1
ORDER BY c.CIDCLIENTEPROVEEDOR;
`);
console.log(`[extract-csvs] Got ${clientesRows.length} clientes`);

const clientesCsv = toCsv(
  ['rfc', 'adapter_client_id', 'razon_social', 'uso_cfdi', 'regimen_fiscal', 'codigo_postal', 'email', 'telefono'],
  clientesRows,
);

console.log('[extract-csvs] Querying productos...');
const productosRows = runSql(`
SET NOCOUNT ON;
SELECT TOP 30
  p.CCODIGOPRODUCTO,
  p.CNOMBREPRODUCTO,
  ISNULL(u.CABREVIATURA, 'PZA'),
  CAST(p.CPRECIO1 AS varchar(20)),
  ISNULL(NULLIF(p.CCLAVESAT, ''), '50161509'),
  CASE WHEN p.CESEXENTO = 1 THEN '0.0' ELSE '0.0' END
FROM admProductos p
LEFT JOIN admUnidadesMedidaPeso u ON u.CIDUNIDAD = p.CIDUNIDADBASE
WHERE p.CCODIGOPRODUCTO IS NOT NULL
  AND p.CCODIGOPRODUCTO <> ''
  AND p.CSTATUSPRODUCTO = 1
  AND p.CTIPOPRODUCTO IN (1, 2)
  AND p.CPRECIO1 > 0
ORDER BY p.CIDPRODUCTO;
`);
console.log(`[extract-csvs] Got ${productosRows.length} productos`);

const productosCsv = toCsv(
  ['sku', 'nombre', 'unidad', 'precio', 'clave_sat', 'iva_tasa'],
  productosRows,
);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'contpaqi_clientes.csv'), clientesCsv, 'utf-8');
writeFileSync(join(OUT_DIR, 'contpaqi_productos.csv'), productosCsv, 'utf-8');

const now = new Date().toISOString();
const freshness = {
  lastSyncAt: now,
  status: 'ok',
  records: { clients: clientesRows.length, products: productosRows.length },
  durationMs: 0,
  agentVersion: 'local-dev-extract-1.0',
};
writeFileSync(join(OUT_DIR, 'last_sync.json'), JSON.stringify(freshness, null, 2), 'utf-8');

console.log(`[extract-csvs] Wrote 3 files to ${OUT_DIR}`);
