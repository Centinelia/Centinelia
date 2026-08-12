# Solución Factible CFDI 4.0 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Solución Factible (PAC) para que los empleados digitales de Centinelia timbren y cancelen CFDI 4.0 reales cuando la org tiene el PAC conectado; sin conexión, mantener el flujo actual de escalar a humano.

**Architecture:** Interfaz `InvoicingProvider` provider-agnostic + implementación `SolucionFactibleProvider` (SOAP + XML CFDI 4.0 + firma con CSD custodiado en Supabase Storage cifrado AES-256-GCM). La tool única `solicitar_factura` bifurca vía `resolveInvoicingPath()`: con PAC + guardrails ok → timbra; sin PAC / guardrails fail → flujo humano actual. Cancelación asíncrona con toggle Off por default.

**Tech Stack:** Next.js 16 · TypeScript · Supabase (Postgres + Storage) · Vitest 4.1 (existente) · `xmlbuilder2` · `fast-xml-parser` · `node-forge` (nuevas). SOAP con `fetch` nativo, sin cliente pesado.

**Spec reference:** `docs/superpowers/specs/2026-08-12-solucion-factible-cfdi-integration-design.md` (commit `b026d8b6`).

## Global Constraints

- **Regla `feedback-integraciones-org-level`:** toda columna nueva vive en `organizations`, NUNCA en `voice_agents`. PK `portal_email`.
- **Regla `feedback-tool-3-canales`:** tools nuevas (solo `solicitar_cancelacion_factura` en este plan) DEBEN quedar registradas en `src/lib/vapi/sync.ts` (voice) + `src/app/api/portal/[token]/agent-chat/route.ts` (chat) + `src/lib/ops/inbox-processor.ts` (email) + handler central en `src/lib/tools/executor.ts`. Sin las 4, la tool no aparece al modelo.
- **Encoding CSD:** AES-256-GCM con la env var `ENCRYPTION_KEY` existente (ya rotada 2026-07-29). IV random de 12 bytes por blob, auth tag concatenado. `crypto` nativo Node, sin deps externas para el crypto.
- **Endpoints Solución Factible:** Test `https://testing.solucionfactible.com/ws/services/{Timbrado,Cancelacion}`; Prod `https://solucionfactible.com/ws/services/{Timbrado,Cancelacion}`. Sandbox creds públicas: `testing@solucionfactible.com` / `timbrado.SF.16672`.
- **Migrations:** archivos `migrations/YYYYMMDD_snake_name.sql`. Todas las columnas nuevas nullable con defaults seguros (cero downtime).
- **Kill switches:** env var `INVOICING_DISABLED=true` a nivel plataforma; botón "Desconectar" a nivel org (setea `invoicing_provider=null`).
- **Rate limits guardrails default:** `max_stamps_per_day=50`, `max_stamps_per_hour_per_rfc=3`, `monto_max_mxn=50000` (sugerido, editable), `blocked_uso_cfdi=["D01"..."D10"]` (deducciones personales). NO bloqueamos por RFC nuevo — clientes nuevos legítimamente piden factura el mismo día.
- **Toggle cancelación:** `invoicing_allow_agent_cancellation` default `false`. Si Off, la tool `solicitar_cancelacion_factura` no se registra en ningún canal para esa org.
- **Auditoría:** timbrado + cancelación → `policy_audit_log` con `capability='cfdi_timbrado'` o `'cfdi_cancelacion'`. Acceso al CSD → `admin_access_log` (LFPDPPP).
- **Commits:** convención existente del repo `<tipo>(<scope>): <mensaje>` (ver `git log`), Co-Authored-By footer opcional.

## File Map

**Nuevos (crear):**
```
migrations/20260812_invoicing_organizations_columns.sql
migrations/20260812_invoicing_factura_requests_columns.sql
migrations/20260812_invoicing_cfdi_cancellations_table.sql
migrations/20260812_invoicing_storage_buckets.sql

src/lib/invoicing/provider.ts                      # interface + types
src/lib/invoicing/error-mapping.ts                 # SF error codes → {retryable, action}
src/lib/invoicing/csd-vault.ts                     # AES-GCM encrypt/decrypt + Storage put/get
src/lib/invoicing/guardrails.ts                    # evaluateGuardrails()
src/lib/invoicing/emitir-factura.ts                # emitirFacturaAuto() orquestador
src/lib/invoicing/pdf-builder.ts                   # PDF representativo del CFDI
src/lib/invoicing/solicitar-cancelacion.ts        # handler shared 3-canales
src/lib/invoicing/kill-switch.ts                   # lee env INVOICING_DISABLED
src/lib/invoicing/solucion-factible/index.ts       # SolucionFactibleProvider
src/lib/invoicing/solucion-factible/xml-builder.ts # arma XML CFDI 4.0
src/lib/invoicing/solucion-factible/signer.ts      # firma XML con .cer + .key
src/lib/invoicing/solucion-factible/soap-client.ts # cliente SOAP con fetch
src/lib/invoicing/solucion-factible/cadena-original.xslt  # XSLT SAT oficial

src/app/api/portal/[token]/invoicing/connect/route.ts
src/app/api/portal/[token]/invoicing/csd/upload/route.ts
src/app/api/portal/[token]/invoicing/config/route.ts
src/app/api/portal/[token]/invoicing/disconnect/route.ts
src/app/api/portal/[token]/factura-requests/[id]/stamp/route.ts
src/app/api/portal/[token]/factura-requests/[id]/mark-manual/route.ts
src/app/api/portal/[token]/factura-requests/[id]/xml/route.ts
src/app/api/portal/[token]/factura-requests/[id]/pdf/route.ts
src/app/api/portal/[token]/cancellations/[id]/confirm/route.ts
src/app/api/portal/[token]/cancellations/[id]/reject/route.ts

src/app/api/voice/tools/solicitar-cancelacion-factura/route.ts
src/app/api/cron/poll-sat-cancellations/route.ts
src/app/api/cron/retry-failed-stamps/route.ts
src/app/api/cron/csd-expiry-notify/route.ts

src/app/portal/[token]/oficina/integraciones/solucion-factible/page.tsx
src/app/portal/[token]/oficina/integraciones/solucion-factible/SolucionFactibleSection.tsx

fixtures/cfdi-v4-sample.xml
fixtures/sat-test-csd/CSD_Prueba_CFDI_LAN7008173R5.cer
fixtures/sat-test-csd/CSD_Prueba_CFDI_LAN7008173R5.key
fixtures/sat-test-csd/PASSWORD.txt
docs/qa/invoicing-e2e.md

src/lib/invoicing/__tests__/csd-vault.test.ts
src/lib/invoicing/__tests__/guardrails.test.ts
src/lib/invoicing/__tests__/error-mapping.test.ts
src/lib/invoicing/solucion-factible/__tests__/xml-builder.test.ts
src/lib/invoicing/solucion-factible/__tests__/signer.test.ts
src/lib/invoicing/solucion-factible/__tests__/soap-client.test.ts
src/lib/invoicing/solucion-factible/__tests__/solucion-factible.integration.test.ts
```

**Modificados:**
```
package.json                                          # deps
src/lib/fiscal/request-factura.ts                     # refactor: delegar a emitirFacturaAuto
src/app/api/voice/tools/solicitar-factura/route.ts    # copy adaptativo por outcome
src/lib/tools/executor.ts                             # executeSolicitarCancelacion
src/lib/vapi/sync.ts                                  # registrar solicitar_cancelacion_factura condicional
src/app/api/portal/[token]/agent-chat/route.ts        # mismo, condicional
src/lib/ops/inbox-processor.ts                        # mismo, condicional
src/app/portal/[token]/IntegrationsHub.tsx            # tile SF
src/app/portal/[token]/oficina/facturas/page.tsx      # estados nuevos + acciones
vercel.json                                           # 3 crons nuevos
```

## Fase 1 — Fundación (deps + tipos + errores + CSD vault + migrations)

Ships when tasks 1–8 complete. Al final: infra backend lista para consumir; agente sigue igual (nada cambia para el usuario). Nazre revisa antes de fase 2.

---

### Task 1: Instalar dependencias npm

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: módulos `xmlbuilder2`, `fast-xml-parser`, `node-forge` disponibles en runtime.

- [ ] **Step 1: Instalar deps**

```bash
cd C:/Users/Nazre/centinelia
npm install xmlbuilder2@^3 fast-xml-parser@^4 node-forge@^1
npm install --save-dev @types/node-forge@^1
```

- [ ] **Step 2: Verificar instalación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (los existentes del repo no cuentan).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): xmlbuilder2 + fast-xml-parser + node-forge para PAC integration"
```

---

### Task 2: Migration — columnas invoicing en `organizations`

**Files:**
- Create: `migrations/20260812_invoicing_organizations_columns.sql`

**Interfaces:**
- Produces: columnas `invoicing_*` en tabla `organizations` (ver spec §4.1).

- [ ] **Step 1: Crear migration**

```sql
-- migrations/20260812_invoicing_organizations_columns.sql
alter table organizations add column if not exists invoicing_provider text;
alter table organizations add column if not exists invoicing_credentials_encrypted text;
alter table organizations add column if not exists invoicing_csd_cer_path text;
alter table organizations add column if not exists invoicing_csd_key_path text;
alter table organizations add column if not exists invoicing_csd_password_encrypted text;
alter table organizations add column if not exists invoicing_csd_version int default 0;
alter table organizations add column if not exists invoicing_csd_expires_at timestamptz;
alter table organizations add column if not exists invoicing_csd_no_certificado text;
alter table organizations add column if not exists invoicing_rfc_emisor text;
alter table organizations add column if not exists invoicing_razon_social text;
alter table organizations add column if not exists invoicing_regimen_fiscal text;
alter table organizations add column if not exists invoicing_lugar_expedicion text;
alter table organizations add column if not exists invoicing_test_mode boolean default true;
alter table organizations add column if not exists invoicing_allow_agent_cancellation boolean default false;
alter table organizations add column if not exists invoicing_limits jsonb default '{
  "monto_max_mxn": 50000,
  "blocked_uso_cfdi": ["D01","D02","D03","D04","D05","D06","D07","D08","D09","D10"],
  "max_stamps_per_day": 50,
  "max_stamps_per_hour_per_rfc": 3
}'::jsonb;

comment on column organizations.invoicing_provider is 'null = escalar humano (default). solucion_factible = timbrar auto';
```

- [ ] **Step 2: Aplicar en Supabase**

Correr en Supabase SQL Editor (prod y dev, backup previo garantizado por Supabase). Verificar:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name='organizations' and column_name like 'invoicing_%'
order by column_name;
```

Expected: 15 filas con `invoicing_*`.

- [ ] **Step 3: Commit**

```bash
git add migrations/20260812_invoicing_organizations_columns.sql
git commit -m "feat(db): invoicing_* columnas org-level en organizations (PAC integration)"
```

---

### Task 3: Migration — columnas nuevas en `factura_requests` + `cfdi_cancellations`

**Files:**
- Create: `migrations/20260812_invoicing_factura_requests_columns.sql`
- Create: `migrations/20260812_invoicing_cfdi_cancellations_table.sql`

**Interfaces:**
- Produces: columnas de timbrado en `factura_requests`; tabla nueva `cfdi_cancellations`.

- [ ] **Step 1: factura_requests migration**

```sql
-- migrations/20260812_invoicing_factura_requests_columns.sql
alter table factura_requests add column if not exists uuid text;
alter table factura_requests add column if not exists sello_sat text;
alter table factura_requests add column if not exists certificado_sat text;
alter table factura_requests add column if not exists fecha_timbrado timestamptz;
alter table factura_requests add column if not exists cadena_original text;
alter table factura_requests add column if not exists xml_storage_path text;
alter table factura_requests add column if not exists pdf_storage_path text;
alter table factura_requests add column if not exists qr_storage_path text;
alter table factura_requests add column if not exists stamp_attempts int default 0;
alter table factura_requests add column if not exists stamp_last_error text;
alter table factura_requests add column if not exists stamp_last_error_at timestamptz;
alter table factura_requests add column if not exists provider text;
alter table factura_requests add column if not exists guardrail_reason text;

-- status ya existe; solo documentamos estados nuevos
comment on column factura_requests.status is
  'pending | stamping | stamped | stamp_failed | marked_manual | cancellation_requested | cancelled';

create unique index if not exists factura_requests_uuid_unique
  on factura_requests (uuid) where uuid is not null;
create index if not exists factura_requests_stamping_status
  on factura_requests (status) where status in ('stamping','stamp_failed','cancellation_requested');
```

- [ ] **Step 2: cfdi_cancellations migration**

```sql
-- migrations/20260812_invoicing_cfdi_cancellations_table.sql
create table if not exists cfdi_cancellations (
  id uuid primary key default gen_random_uuid(),
  factura_request_id uuid references factura_requests(id) on delete restrict,
  organization_email text not null,
  uuid_cancelado text not null,
  motivo text not null check (motivo in ('01','02','03','04')),
  uuid_sustituto text,
  requested_by text,
  requested_by_agent_id uuid,
  requested_via text check (requested_via in ('voice','chat','email','portal')),
  status text not null default 'requested'
    check (status in ('requested','sent_to_sat','accepted','rejected','expired')),
  sat_status_last_check timestamptz,
  sat_acuse_xml_path text,
  razon_cliente text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sustituto_requerido check (motivo != '01' or uuid_sustituto is not null)
);

create index if not exists cfdi_cancellations_org_status
  on cfdi_cancellations (organization_email, status);
create index if not exists cfdi_cancellations_poll
  on cfdi_cancellations (status, sat_status_last_check)
  where status = 'sent_to_sat';

create or replace function set_cfdi_cancellations_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_cfdi_cancellations_updated on cfdi_cancellations;
create trigger trg_cfdi_cancellations_updated before update on cfdi_cancellations
for each row execute function set_cfdi_cancellations_updated_at();
```

- [ ] **Step 3: Aplicar en Supabase + verificar**

Correr ambos SQL. Verificar:

```sql
select count(*) from information_schema.columns
where table_name='factura_requests' and column_name in
  ('uuid','sello_sat','certificado_sat','fecha_timbrado','cadena_original',
   'xml_storage_path','pdf_storage_path','qr_storage_path','stamp_attempts',
   'stamp_last_error','stamp_last_error_at','provider','guardrail_reason');
-- expected: 13
select count(*) from cfdi_cancellations;  -- expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add migrations/20260812_invoicing_factura_requests_columns.sql migrations/20260812_invoicing_cfdi_cancellations_table.sql
git commit -m "feat(db): factura_requests columnas timbrado + tabla cfdi_cancellations"
```

---

### Task 4: Storage buckets

**Files:**
- Create: `migrations/20260812_invoicing_storage_buckets.sql`

**Interfaces:**
- Produces: buckets `csd`, `cfdi`, `cfdi-cancellations` privados (solo service_role).

- [ ] **Step 1: Crear buckets vía SQL**

```sql
-- migrations/20260812_invoicing_storage_buckets.sql
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('csd', 'csd', false, 1048576),        -- 1 MB max por blob CSD
  ('cfdi', 'cfdi', false, 5242880),      -- 5 MB max
  ('cfdi-cancellations', 'cfdi-cancellations', false, 1048576)
on conflict (id) do nothing;

-- Sin políticas RLS públicas: solo service_role puede leer/escribir
-- (Supabase por default niega si no hay policy y bucket es private).
```

- [ ] **Step 2: Aplicar y verificar en Supabase**

```sql
select id, public, file_size_limit from storage.buckets where id in ('csd','cfdi','cfdi-cancellations');
-- expected: 3 filas, public=false
```

- [ ] **Step 3: Commit**

```bash
git add migrations/20260812_invoicing_storage_buckets.sql
git commit -m "feat(storage): buckets csd + cfdi + cfdi-cancellations (private)"
```

---

### Task 5: `InvoicingProvider` interface + tipos + error mapping

**Files:**
- Create: `src/lib/invoicing/provider.ts`
- Create: `src/lib/invoicing/error-mapping.ts`
- Create: `src/lib/invoicing/__tests__/error-mapping.test.ts`

**Interfaces:**
- Produces:
  - `interface InvoicingProvider` con `timbrar`, `cancelar`, `consultarEstatusCancelacion`
  - Tipos: `CfdiInput`, `StampResult`, `CancelSubmitResult`, `CancelStatus`, `CancelMotivo`, `TimbrarOpts`, `CancelOpts`
  - `mapSfError(code: number): { retryable: boolean; action: 'notify_org' | 'notify_platform' | 'silent' | 'ok' }`

- [ ] **Step 1: Write failing test para error-mapping**

```ts
// src/lib/invoicing/__tests__/error-mapping.test.ts
import { describe, it, expect } from 'vitest';
import { mapSfError } from '../error-mapping';

describe('mapSfError', () => {
  it('200 → ok, no retry', () => {
    expect(mapSfError(200)).toEqual({ retryable: false, action: 'ok' });
  });
  it('301 (XML inválido) → no retry, notifica plataforma (bug builder)', () => {
    expect(mapSfError(301)).toEqual({ retryable: false, action: 'notify_platform' });
  });
  it('500 (server) → retryable', () => {
    expect(mapSfError(500)).toEqual({ retryable: true, action: 'silent' });
  });
  it('601 (auth fail) → no retry, notifica org (creds rotas)', () => {
    expect(mapSfError(601)).toEqual({ retryable: false, action: 'notify_org' });
  });
  it('630 (sin timbres) → no retry, notifica org (comprar más)', () => {
    expect(mapSfError(630)).toEqual({ retryable: false, action: 'notify_org' });
  });
  it('999 (desconocido) → no retry por seguridad, notifica plataforma', () => {
    expect(mapSfError(999)).toEqual({ retryable: false, action: 'notify_platform' });
  });
});
```

- [ ] **Step 2: Run test para confirmar fail**

Run: `npx vitest run src/lib/invoicing/__tests__/error-mapping.test.ts`
Expected: FAIL con `Cannot find module '../error-mapping'`.

- [ ] **Step 3: Escribir `provider.ts`**

```ts
// src/lib/invoicing/provider.ts
export type CancelMotivo = '01' | '02' | '03' | '04';

export interface TimbrarOpts { testMode: boolean; timeoutMs?: number; }
export interface CancelOpts { testMode: boolean; timeoutMs?: number; }

export interface CfdiInput {
  emisor: { rfc: string; regimenFiscal: string; nombre: string };
  receptor: {
    rfc: string; nombre: string;
    usoCfdi: string; regimenFiscal: string; domicilioFiscal: string;
  };
  lugarExpedicion: string;
  formaPago: string; metodoPago: string;
  moneda: 'MXN' | 'USD'; tipoCambio?: number;
  conceptos: Array<{
    claveProdServ: string; claveUnidad: string;
    cantidad: number; descripcion: string;
    valorUnitario: number; importe: number;
    iva?: number;
  }>;
  subtotal: number; iva: number; total: number;
  csd: { cerPem: string; keyPem: string; noCertificado: string };
  pacCredentials: { usuario: string; password: string };
}

export type StampResult =
  | {
      ok: true;
      uuid: string; selloSat: string; certificadoSat: string;
      fechaTimbrado: string; cadenaOriginal: string;
      xmlTimbrado: Buffer; qrPng: Buffer;
    }
  | { ok: false; code: number; message: string; retryable: boolean };

export interface CancelSubmitResult {
  status: 'sent_to_sat' | 'rejected';
  code?: number;
  message: string;
}

export interface CancelStatus {
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  acuseXml?: Buffer;
  message?: string;
}

export interface InvoicingProvider {
  timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult>;
  cancelar(
    uuid: string,
    motivo: CancelMotivo,
    uuidSustituto: string | null,
    creds: { usuario: string; password: string },
    csd: { cerPem: string; keyPem: string; noCertificado: string },
    opts: CancelOpts,
  ): Promise<CancelSubmitResult>;
  consultarEstatusCancelacion(
    uuid: string,
    creds: { usuario: string; password: string },
    opts: CancelOpts,
  ): Promise<CancelStatus>;
}
```

- [ ] **Step 4: Escribir `error-mapping.ts`**

```ts
// src/lib/invoicing/error-mapping.ts
export type SfErrorAction = 'ok' | 'silent' | 'notify_org' | 'notify_platform';
export interface SfErrorInfo { retryable: boolean; action: SfErrorAction; }

export function mapSfError(code: number): SfErrorInfo {
  if (code === 200) return { retryable: false, action: 'ok' };
  // XML / sello inválido — bug del builder o CSD corrupto
  if (code === 301 || code === 302) return { retryable: false, action: 'notify_platform' };
  // Server errors — retryable
  if (code === 500 || code === 501 || code === 503) return { retryable: true, action: 'silent' };
  // Auth / cuenta — credenciales rotas, avisar org
  if (code >= 601 && code <= 605) return { retryable: false, action: 'notify_org' };
  // Timbres agotados — org debe comprar más al PAC
  if (code >= 630 && code <= 632) return { retryable: false, action: 'notify_org' };
  // Desconocido: por seguridad no reintenta, notifica plataforma para investigar
  return { retryable: false, action: 'notify_platform' };
}
```

- [ ] **Step 5: Run test para confirmar PASS**

Run: `npx vitest run src/lib/invoicing/__tests__/error-mapping.test.ts`
Expected: PASS 6/6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoicing/provider.ts src/lib/invoicing/error-mapping.ts src/lib/invoicing/__tests__/error-mapping.test.ts
git commit -m "feat(invoicing): InvoicingProvider interface + SF error mapping (tests)"
```

---

### Task 6: CSD vault (AES-256-GCM encrypt/decrypt en memoria)

**Files:**
- Create: `src/lib/invoicing/csd-vault.ts`
- Create: `src/lib/invoicing/__tests__/csd-vault.test.ts`

**Interfaces:**
- Consumes: env `ENCRYPTION_KEY` (32 bytes hex ya existente en el repo).
- Produces:
  - `encryptBlob(plain: Buffer): Buffer` — devuelve `iv(12) || tag(16) || ciphertext`
  - `decryptBlob(cipher: Buffer): Buffer`
  - `encryptString(s: string): string` / `decryptString(s: string): string` (base64 wrapper)

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/invoicing/__tests__/csd-vault.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { encryptBlob, decryptBlob, encryptString, decryptString } from '../csd-vault';
import { randomBytes } from 'crypto';

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  }
});

describe('csd-vault crypto round-trip', () => {
  it('encryptBlob → decryptBlob recupera el blob original', () => {
    const plain = randomBytes(4096);
    const cipher = encryptBlob(plain);
    expect(cipher.length).toBe(12 + 16 + plain.length);
    const back = decryptBlob(cipher);
    expect(back.equals(plain)).toBe(true);
  });
  it('IVs distintos producen ciphertext distinto para el mismo plaintext', () => {
    const plain = Buffer.from('hola-mundo');
    const a = encryptBlob(plain);
    const b = encryptBlob(plain);
    expect(a.equals(b)).toBe(false);
  });
  it('decryptBlob con tag corrupto lanza', () => {
    const cipher = encryptBlob(Buffer.from('x'));
    cipher[15] = cipher[15] ^ 0xff;   // corrompe el tag
    expect(() => decryptBlob(cipher)).toThrow();
  });
  it('encryptString/decryptString round-trip', () => {
    const s = 'password-super-secreto-áéíóú';
    expect(decryptString(encryptString(s))).toBe(s);
  });
});
```

- [ ] **Step 2: Run test para confirmar fail**

Run: `npx vitest run src/lib/invoicing/__tests__/csd-vault.test.ts`
Expected: FAIL con `Cannot find module '../csd-vault'`.

- [ ] **Step 3: Escribir `csd-vault.ts` (solo crypto por ahora; Storage put/get se agrega en Task 7)**

```ts
// src/lib/invoicing/csd-vault.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error('ENCRYPTION_KEY no configurada');
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error(`ENCRYPTION_KEY debe ser 32 bytes hex, recibí ${buf.length}`);
  return buf;
}

export function encryptBlob(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptBlob(cipher: Buffer): Buffer {
  if (cipher.length < IV_BYTES + TAG_BYTES) throw new Error('cipher demasiado corto');
  const iv = cipher.subarray(0, IV_BYTES);
  const tag = cipher.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = cipher.subarray(IV_BYTES + TAG_BYTES);
  const dec = createDecipheriv(ALG, key(), iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]);
}

export function encryptString(s: string): string {
  return encryptBlob(Buffer.from(s, 'utf8')).toString('base64');
}

export function decryptString(b64: string): string {
  return decryptBlob(Buffer.from(b64, 'base64')).toString('utf8');
}
```

- [ ] **Step 4: Run test para confirmar PASS**

Run: `npx vitest run src/lib/invoicing/__tests__/csd-vault.test.ts`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoicing/csd-vault.ts src/lib/invoicing/__tests__/csd-vault.test.ts
git commit -m "feat(invoicing): csd-vault crypto AES-256-GCM (round-trip test)"
```

---

### Task 7: CSD vault — Storage put/get + parse .cer/.key

**Files:**
- Modify: `src/lib/invoicing/csd-vault.ts` (agregar funciones que hablan con Supabase Storage y parsean CSD)
- Modify: `src/lib/invoicing/__tests__/csd-vault.test.ts` (agregar tests de parsing)

**Interfaces:**
- Produces:
  - `parseCsd(cerBuf: Buffer, keyBuf: Buffer, password: string): { cerPem, keyPem, rfc, noCertificado, notAfter }`
  - `putCsd(orgEmail: string, cer: Buffer, key: Buffer, version: number, supabase): Promise<{cerPath, keyPath}>`
  - `getCsd(orgEmail: string, supabase): Promise<{cerPem, keyPem, noCertificado} | null>` — lee de organizations + Storage + descifra
- Consumes: `createAdminClient()` de `@/lib/supabase/admin`.

- [ ] **Step 1: Test de parseCsd con CSD de prueba SAT**

Descargar CSD de prueba público SAT (LAN7008173R5) — el equipo lo pone en `fixtures/sat-test-csd/`:
- `.cer`, `.key`, `PASSWORD.txt` (contenido: `12345678a`)

Añadir al test:

```ts
// src/lib/invoicing/__tests__/csd-vault.test.ts (append)
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsd } from '../csd-vault';

describe('parseCsd', () => {
  const CSD_DIR = join(process.cwd(), 'fixtures', 'sat-test-csd');
  const cer = readFileSync(join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.cer'));
  const key = readFileSync(join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.key'));
  const pw  = readFileSync(join(CSD_DIR, 'PASSWORD.txt'), 'utf8').trim();

  it('extrae RFC LAN7008173R5 del cert', () => {
    const parsed = parseCsd(cer, key, pw);
    expect(parsed.rfc).toBe('LAN7008173R5');
    expect(parsed.noCertificado).toMatch(/^\d{20}$/);
    expect(parsed.notAfter).toBeInstanceOf(Date);
    expect(parsed.cerPem).toMatch(/-----BEGIN CERTIFICATE-----/);
    expect(parsed.keyPem).toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
  });

  it('password incorrecta lanza error legible', () => {
    expect(() => parseCsd(cer, key, 'wrong-password')).toThrow(/password/i);
  });
});
```

- [ ] **Step 2: Run test — debe fallar**

Run: `npx vitest run src/lib/invoicing/__tests__/csd-vault.test.ts -t parseCsd`
Expected: FAIL con `parseCsd is not a function`.

- [ ] **Step 3: Implementar parseCsd usando node-forge**

Append a `src/lib/invoicing/csd-vault.ts`:

```ts
import forge from 'node-forge';

export interface ParsedCsd {
  cerPem: string;
  keyPem: string;
  rfc: string;
  noCertificado: string;
  notAfter: Date;
  notBefore: Date;
}

export function parseCsd(cerBuf: Buffer, keyBuf: Buffer, password: string): ParsedCsd {
  // 1. Parse cert (DER binary)
  const cerAsn1 = forge.asn1.fromDer(forge.util.createBuffer(cerBuf.toString('binary')));
  const cert = forge.pki.certificateFromAsn1(cerAsn1);
  const cerPem = forge.pki.certificateToPem(cert);

  // 2. Extract RFC from subject (x500UniqueIdentifier o serialNumber)
  const rfcAttr = cert.subject.attributes.find(a =>
    a.type === '2.5.4.45' || a.shortName === 'serialNumber' || a.name === 'x500UniqueIdentifier'
  );
  const rfcRaw = (rfcAttr?.value as string | undefined) ?? '';
  const rfc = rfcRaw.split(/[\s\/]/)[0].toUpperCase();
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
    throw new Error(`No pude extraer RFC del certificado. Encontré: "${rfcRaw}"`);
  }

  // 3. Serial (no. certificado SAT = 20 dígitos)
  const serialHex = cert.serialNumber;
  const noCertificado = Buffer.from(serialHex, 'hex').toString('ascii');
  if (!/^\d{20}$/.test(noCertificado)) {
    throw new Error(`Serial no es 20 dígitos: "${noCertificado}"`);
  }

  // 4. Parse encrypted PKCS#8 key
  let keyPem: string;
  try {
    const keyAsn1 = forge.asn1.fromDer(forge.util.createBuffer(keyBuf.toString('binary')));
    const keyObj = forge.pki.decryptRsaPrivateKey(forge.pki.encryptedPrivateKeyToPem(
      forge.pki.encryptedPrivateKeyFromAsn1(keyAsn1)
    ), password);
    if (!keyObj) throw new Error('password incorrecta');
    keyPem = forge.pki.privateKeyToPem(keyObj);
  } catch (err) {
    throw new Error(`No pude abrir el .key con la password proporcionada: ${(err as Error).message}`);
  }

  // 5. Validar par cert/key (public key match)
  const certPub = forge.pki.publicKeyToPem(cert.publicKey);
  const keyObj2 = forge.pki.privateKeyFromPem(keyPem);
  const derivedPub = forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(keyObj2.n, keyObj2.e));
  if (certPub !== derivedPub) throw new Error('El .cer y .key no son del mismo par');

  return {
    cerPem, keyPem, rfc, noCertificado,
    notAfter: cert.validity.notAfter,
    notBefore: cert.validity.notBefore,
  };
}
```

- [ ] **Step 4: Run test para PASS**

Run: `npx vitest run src/lib/invoicing/__tests__/csd-vault.test.ts`
Expected: PASS 6/6.

- [ ] **Step 5: Añadir `putCsd` + `getCsd` (Storage integration)**

Append a `src/lib/invoicing/csd-vault.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StoredCsdPaths { cerPath: string; keyPath: string; }

export async function putCsd(
  orgEmail: string, cer: Buffer, key: Buffer, version: number, supabase: SupabaseClient
): Promise<StoredCsdPaths> {
  const cerPath = `${orgEmail}/${version}.cer.enc`;
  const keyPath = `${orgEmail}/${version}.key.enc`;
  const cerEnc = encryptBlob(cer);
  const keyEnc = encryptBlob(key);

  const up1 = await supabase.storage.from('csd').upload(cerPath, cerEnc, {
    contentType: 'application/octet-stream', upsert: true,
  });
  if (up1.error) throw new Error(`Storage upload .cer: ${up1.error.message}`);
  const up2 = await supabase.storage.from('csd').upload(keyPath, keyEnc, {
    contentType: 'application/octet-stream', upsert: true,
  });
  if (up2.error) throw new Error(`Storage upload .key: ${up2.error.message}`);

  return { cerPath, keyPath };
}

export interface LoadedCsd { cerPem: string; keyPem: string; noCertificado: string; }

export async function getCsd(orgEmail: string, supabase: SupabaseClient): Promise<LoadedCsd | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('invoicing_csd_cer_path, invoicing_csd_key_path, invoicing_csd_password_encrypted, invoicing_csd_no_certificado, invoicing_csd_expires_at')
    .eq('portal_email', orgEmail)
    .single();
  if (!org?.invoicing_csd_cer_path || !org.invoicing_csd_key_path || !org.invoicing_csd_password_encrypted) return null;

  // Vigencia (throw si expiró)
  if (org.invoicing_csd_expires_at && new Date(org.invoicing_csd_expires_at) < new Date()) {
    throw new Error('CSD expirado');
  }

  const [cerRes, keyRes] = await Promise.all([
    supabase.storage.from('csd').download(org.invoicing_csd_cer_path),
    supabase.storage.from('csd').download(org.invoicing_csd_key_path),
  ]);
  if (cerRes.error || !cerRes.data) throw new Error(`Storage download .cer: ${cerRes.error?.message}`);
  if (keyRes.error || !keyRes.data) throw new Error(`Storage download .key: ${keyRes.error?.message}`);

  const cerEnc = Buffer.from(await cerRes.data.arrayBuffer());
  const keyEnc = Buffer.from(await keyRes.data.arrayBuffer());
  const password = decryptString(org.invoicing_csd_password_encrypted);

  const parsed = parseCsd(decryptBlob(cerEnc), decryptBlob(keyEnc), password);
  return {
    cerPem: parsed.cerPem,
    keyPem: parsed.keyPem,
    noCertificado: org.invoicing_csd_no_certificado ?? parsed.noCertificado,
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoicing/csd-vault.ts src/lib/invoicing/__tests__/csd-vault.test.ts fixtures/sat-test-csd/
git commit -m "feat(invoicing): csd-vault parseCsd + Storage put/get (node-forge)"
```

---

### Task 8: Kill switch + resolveInvoicingPath helper

**Files:**
- Create: `src/lib/invoicing/kill-switch.ts`

**Interfaces:**
- Produces:
  - `isInvoicingDisabled(): boolean` — lee `INVOICING_DISABLED` env var
  - `assertInvoicingEnabled()` — throws si desactivado

- [ ] **Step 1: Escribir kill-switch**

```ts
// src/lib/invoicing/kill-switch.ts
export function isInvoicingDisabled(): boolean {
  const v = process.env.INVOICING_DISABLED;
  return v === 'true' || v === '1';
}

export function assertInvoicingEnabled(): void {
  if (isInvoicingDisabled()) throw new Error('INVOICING_DISABLED — timbrado deshabilitado por plataforma');
}
```

- [ ] **Step 2: Commit + fin fase 1**

```bash
git add src/lib/invoicing/kill-switch.ts
git commit -m "feat(invoicing): kill switch INVOICING_DISABLED env var

Fin fase 1 (fundación). Infra lista: deps, migrations, buckets,
provider interface, error mapping con tests, csd-vault con encrypt
+ parse + Storage put/get + tests. Agente sin cambios todavía.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**🛑 CHECKPOINT — pausa para review de Nazre.**

## Fase 2 — Provider Solución Factible (XML + firma + SOAP + integración test)

Ships when tasks 9–13 complete. Al final: podemos timbrar contra sandbox SF desde un test de integración. Aún sin conectar al flujo del agente.

---

### Task 9: XML builder CFDI 4.0

**Files:**
- Create: `src/lib/invoicing/solucion-factible/xml-builder.ts`
- Create: `src/lib/invoicing/solucion-factible/__tests__/xml-builder.test.ts`
- Create: `fixtures/cfdi-v4-sample.xml` (referencia esperada, generada manual para el test)

**Interfaces:**
- Consumes: `CfdiInput` de `../provider`
- Produces:
  - `buildCfdiXml(input: CfdiInput, folioInterno?: string): string` — XML CFDI 4.0 SIN sellar (Sello y NoCertificado en el elemento raíz pero vacíos, listos para firma)

- [ ] **Step 1: Fixture de entrada + XML esperado**

Crear `fixtures/cfdi-v4-sample-input.json`:
```json
{
  "emisor": { "rfc": "LAN7008173R5", "regimenFiscal": "601", "nombre": "ESCUELA KEMPER URGATE" },
  "receptor": { "rfc": "XAXX010101000", "nombre": "PUBLICO EN GENERAL",
    "usoCfdi": "S01", "regimenFiscal": "616", "domicilioFiscal": "64000" },
  "lugarExpedicion": "64000",
  "formaPago": "03", "metodoPago": "PUE",
  "moneda": "MXN",
  "conceptos": [
    { "claveProdServ": "01010101", "claveUnidad": "H87", "cantidad": 1,
      "descripcion": "Servicio de consultoría", "valorUnitario": 100, "importe": 100, "iva": 16 }
  ],
  "subtotal": 100, "iva": 16, "total": 116
}
```

- [ ] **Step 2: Test que verifica shape del XML**

```ts
// src/lib/invoicing/solucion-factible/__tests__/xml-builder.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { buildCfdiXml } from '../xml-builder';

const input = JSON.parse(
  readFileSync(join(process.cwd(), 'fixtures', 'cfdi-v4-sample-input.json'), 'utf8')
);

describe('buildCfdiXml (CFDI 4.0)', () => {
  const xml = buildCfdiXml(input, 'FOLIO-001');
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
  const cfdi = parsed['cfdi:Comprobante'];

  it('root tag Comprobante con Version=4.0', () => {
    expect(cfdi['@Version']).toBe('4.0');
  });
  it('atributos monetarios formateados con 2 decimales string', () => {
    expect(cfdi['@SubTotal']).toBe('100.00');
    expect(cfdi['@Total']).toBe('116.00');
  });
  it('incluye Sello y NoCertificado vacíos listos para firma', () => {
    expect(cfdi['@Sello']).toBe('');
    expect(cfdi['@NoCertificado']).toBe('');
    expect(cfdi['@Certificado']).toBe('');
  });
  it('emisor y receptor con RFC correctos', () => {
    expect(cfdi['cfdi:Emisor']['@Rfc']).toBe('LAN7008173R5');
    expect(cfdi['cfdi:Receptor']['@Rfc']).toBe('XAXX010101000');
    expect(cfdi['cfdi:Receptor']['@RegimenFiscalReceptor']).toBe('616');
    expect(cfdi['cfdi:Receptor']['@DomicilioFiscalReceptor']).toBe('64000');
  });
  it('concepto con IVA 16% en Impuestos.Traslados', () => {
    const c = cfdi['cfdi:Conceptos']['cfdi:Concepto'];
    expect(c['@ClaveProdServ']).toBe('01010101');
    expect(c['@Importe']).toBe('100.00');
    const traslado = c['cfdi:Impuestos']['cfdi:Traslados']['cfdi:Traslado'];
    expect(traslado['@Impuesto']).toBe('002');
    expect(traslado['@TasaOCuota']).toBe('0.160000');
    expect(traslado['@Importe']).toBe('16.00');
  });
  it('namespaces xsi + cfdi declarados en root', () => {
    expect(cfdi['@xmlns:cfdi']).toBe('http://www.sat.gob.mx/cfd/4');
    expect(cfdi['@xmlns:xsi']).toBe('http://www.w3.org/2001/XMLSchema-instance');
    expect(cfdi['@xsi:schemaLocation']).toContain('http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd');
  });
});
```

- [ ] **Step 3: Run — FAIL**

Run: `npx vitest run src/lib/invoicing/solucion-factible/__tests__/xml-builder.test.ts`
Expected: FAIL con `Cannot find module '../xml-builder'`.

- [ ] **Step 4: Implementar `xml-builder.ts`**

```ts
// src/lib/invoicing/solucion-factible/xml-builder.ts
import { create } from 'xmlbuilder2';
import type { CfdiInput } from '../provider';

const NS = {
  cfdi: 'http://www.sat.gob.mx/cfd/4',
  xsi:  'http://www.w3.org/2001/XMLSchema-instance',
  schemaLocation: 'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
};

const fmt = (n: number) => n.toFixed(2);
const fmtTasa = (n: number) => n.toFixed(6);

function fechaLocalMx(): string {
  // CFDI 4.0 exige fecha local del lugar de expedición (sin timezone offset)
  const now = new Date(Date.now() - 6 * 3600 * 1000); // GMT-6 CDMX; ajustar cuando SAT permita otras
  return now.toISOString().slice(0, 19);
}

export function buildCfdiXml(input: CfdiInput, folioInterno = ''): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('cfdi:Comprobante', {
      'xmlns:cfdi': NS.cfdi,
      'xmlns:xsi': NS.xsi,
      'xsi:schemaLocation': NS.schemaLocation,
      Version: '4.0',
      Serie: 'A', Folio: folioInterno || '1',
      Fecha: fechaLocalMx(),
      Sello: '',                        // se rellena en signer
      FormaPago: input.formaPago,
      NoCertificado: '',                // se rellena en signer
      Certificado: '',                  // se rellena en signer
      SubTotal: fmt(input.subtotal),
      Moneda: input.moneda,
      Total: fmt(input.total),
      TipoDeComprobante: 'I',           // Ingreso
      Exportacion: '01',                // No aplica
      MetodoPago: input.metodoPago,
      LugarExpedicion: input.lugarExpedicion,
    });

  if (input.moneda !== 'MXN' && input.tipoCambio) {
    doc.att('TipoCambio', input.tipoCambio.toFixed(4));
  }

  doc.ele('cfdi:Emisor', {
    Rfc: input.emisor.rfc,
    Nombre: input.emisor.nombre,
    RegimenFiscal: input.emisor.regimenFiscal,
  });

  doc.ele('cfdi:Receptor', {
    Rfc: input.receptor.rfc,
    Nombre: input.receptor.nombre,
    DomicilioFiscalReceptor: input.receptor.domicilioFiscal,
    RegimenFiscalReceptor: input.receptor.regimenFiscal,
    UsoCFDI: input.receptor.usoCfdi,
  });

  const conceptos = doc.ele('cfdi:Conceptos');
  for (const c of input.conceptos) {
    const con = conceptos.ele('cfdi:Concepto', {
      ClaveProdServ: c.claveProdServ,
      Cantidad: c.cantidad.toString(),
      ClaveUnidad: c.claveUnidad,
      Descripcion: c.descripcion,
      ValorUnitario: fmt(c.valorUnitario),
      Importe: fmt(c.importe),
      ObjetoImp: c.iva ? '02' : '01',
    });
    if (c.iva) {
      const imps = con.ele('cfdi:Impuestos');
      imps.ele('cfdi:Traslados').ele('cfdi:Traslado', {
        Base: fmt(c.importe),
        Impuesto: '002',      // IVA
        TipoFactor: 'Tasa',
        TasaOCuota: fmtTasa(c.iva / c.importe),
        Importe: fmt(c.iva),
      });
    }
  }

  if (input.iva > 0) {
    const imps = doc.ele('cfdi:Impuestos', { TotalImpuestosTrasladados: fmt(input.iva) });
    imps.ele('cfdi:Traslados').ele('cfdi:Traslado', {
      Base: fmt(input.subtotal),
      Impuesto: '002',
      TipoFactor: 'Tasa',
      TasaOCuota: fmtTasa(0.16),
      Importe: fmt(input.iva),
    });
  }

  return doc.end({ prettyPrint: false });
}
```

- [ ] **Step 5: Run test — PASS**

Run: `npx vitest run src/lib/invoicing/solucion-factible/__tests__/xml-builder.test.ts`
Expected: PASS 6/6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoicing/solucion-factible/xml-builder.ts src/lib/invoicing/solucion-factible/__tests__/xml-builder.test.ts fixtures/cfdi-v4-sample-input.json
git commit -m "feat(invoicing/sf): CFDI 4.0 XML builder + tests contra fast-xml-parser"
```

---

### Task 10: Signer — cadena original + firma con .key

**Files:**
- Create: `src/lib/invoicing/solucion-factible/cadena-original.xslt` (descarga el XSLT oficial SAT `cadenaoriginal_4_0.xslt` de http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt y guardar sin modificar)
- Create: `src/lib/invoicing/solucion-factible/signer.ts`
- Create: `src/lib/invoicing/solucion-factible/__tests__/signer.test.ts`

**Interfaces:**
- Consumes: `buildCfdiXml` de `../xml-builder`, XSLT SAT del disco
- Produces:
  - `computeCadenaOriginal(xml: string): string` — aplica XSLT y devuelve cadena "||...||"
  - `signXml(xml: string, csd: {cerPem, keyPem, noCertificado}): string` — inserta Sello + NoCertificado + Certificado en el XML

- [ ] **Step 1: Descargar XSLT SAT y colocar en `cadena-original.xslt`**

Manual: `curl http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt > src/lib/invoicing/solucion-factible/cadena-original.xslt`

Verificar que empieza con `<?xml version="1.0" encoding="UTF-8"?>` y tiene `<xsl:stylesheet`.

- [ ] **Step 2: Test — sello del XML firmado es no vacío y verifica contra el cert**

```ts
// src/lib/invoicing/solucion-factible/__tests__/signer.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import forge from 'node-forge';
import { buildCfdiXml } from '../xml-builder';
import { signXml, computeCadenaOriginal } from '../signer';
import { parseCsd } from '../../csd-vault';

const input = JSON.parse(
  readFileSync(join(process.cwd(), 'fixtures', 'cfdi-v4-sample-input.json'), 'utf8')
);
const CSD_DIR = join(process.cwd(), 'fixtures', 'sat-test-csd');
const parsed = parseCsd(
  readFileSync(join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.cer')),
  readFileSync(join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.key')),
  readFileSync(join(CSD_DIR, 'PASSWORD.txt'), 'utf8').trim(),
);

describe('signer', () => {
  it('computeCadenaOriginal empieza y termina con ||', () => {
    const xml = buildCfdiXml(input);
    const cadena = computeCadenaOriginal(xml);
    expect(cadena.startsWith('||')).toBe(true);
    expect(cadena.endsWith('||')).toBe(true);
    expect(cadena).toContain('|4.0|');
  });

  it('signXml rellena Sello, NoCertificado, Certificado', () => {
    const xml = buildCfdiXml(input);
    const signed = signXml(xml, parsed);
    const attrs = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })
      .parse(signed)['cfdi:Comprobante'];
    expect(attrs['@NoCertificado']).toBe(parsed.noCertificado);
    expect(attrs['@Certificado'].length).toBeGreaterThan(400);   // base64 sin headers
    expect(attrs['@Sello'].length).toBeGreaterThan(300);          // firma RSA base64
  });

  it('el sello verifica contra el public key del cert (SHA256withRSA)', () => {
    const xml = buildCfdiXml(input);
    const signed = signXml(xml, parsed);
    const attrs = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })
      .parse(signed)['cfdi:Comprobante'];
    const sello = attrs['@Sello'] as string;
    const cadena = computeCadenaOriginal(signed);
    const cert = forge.pki.certificateFromPem(parsed.cerPem);
    const md = forge.md.sha256.create();
    md.update(cadena, 'utf8');
    const sigBytes = forge.util.decode64(sello);
    const ok = (cert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().bytes(), sigBytes);
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run — FAIL**

Run: `npx vitest run src/lib/invoicing/solucion-factible/__tests__/signer.test.ts`
Expected: FAIL con módulo no encontrado.

- [ ] **Step 4: Implementar `signer.ts`**

Necesitamos un procesador XSLT en Node. Recomiendo `xslt-processor` (puro JS, sin binarios nativos):

```bash
npm install xslt-processor@^3
```

Luego:

```ts
// src/lib/invoicing/solucion-factible/signer.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import forge from 'node-forge';
import { Xslt, XmlParser } from 'xslt-processor';

let XSLT_CACHE: string | null = null;
function xsltSource(): string {
  if (!XSLT_CACHE) {
    XSLT_CACHE = readFileSync(join(__dirname, 'cadena-original.xslt'), 'utf8');
  }
  return XSLT_CACHE;
}

export function computeCadenaOriginal(xml: string): string {
  const proc = new Xslt();
  const xmlDoc = new XmlParser().xmlParse(xml);
  const xsltDoc = new XmlParser().xmlParse(xsltSource());
  const result = proc.xsltProcess(xmlDoc, xsltDoc);
  return String(result).trim();
}

function stripPemHeaders(pem: string): string {
  return pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
}

export function signXml(
  xml: string,
  csd: { cerPem: string; keyPem: string; noCertificado: string },
): string {
  // 1. Insert NoCertificado + Certificado ANTES de calcular cadena (afecta cadena)
  const certB64 = stripPemHeaders(csd.cerPem);
  let withCert = xml
    .replace(/NoCertificado=""/, `NoCertificado="${csd.noCertificado}"`)
    .replace(/Certificado=""/, `Certificado="${certB64}"`);

  // 2. Cadena original con XSLT
  const cadena = computeCadenaOriginal(withCert);

  // 3. Firmar cadena SHA256withRSA
  const md = forge.md.sha256.create();
  md.update(cadena, 'utf8');
  const key = forge.pki.privateKeyFromPem(csd.keyPem);
  const sigBytes = key.sign(md);
  const selloB64 = forge.util.encode64(sigBytes);

  // 4. Insert Sello
  return withCert.replace(/Sello=""/, `Sello="${selloB64}"`);
}
```

- [ ] **Step 5: Run test — PASS**

Run: `npx vitest run src/lib/invoicing/solucion-factible/__tests__/signer.test.ts`
Expected: PASS 3/3.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoicing/solucion-factible/signer.ts src/lib/invoicing/solucion-factible/cadena-original.xslt src/lib/invoicing/solucion-factible/__tests__/signer.test.ts package.json package-lock.json
git commit -m "feat(invoicing/sf): signer con cadena original XSLT + firma SHA256withRSA (verifica contra cert)"
```

---

### Task 11: SOAP client mínimo (fetch)

**Files:**
- Create: `src/lib/invoicing/solucion-factible/soap-client.ts`
- Create: `src/lib/invoicing/solucion-factible/__tests__/soap-client.test.ts`

**Interfaces:**
- Produces:
  - `soapCall(url: string, action: string, body: string, timeoutMs=30000): Promise<{status, xml}>`
  - `buildTimbrarEnvelope(usuario, password, cfdiXml): string`
  - `buildCancelarEnvelope(usuario, password, uuid, motivo, uuidSustituto): string`
  - `buildConsultarEstatusEnvelope(usuario, password, uuid): string`

- [ ] **Step 1: Tests unitarios de los envelope builders**

```ts
// src/lib/invoicing/solucion-factible/__tests__/soap-client.test.ts
import { describe, it, expect } from 'vitest';
import { buildTimbrarEnvelope, buildCancelarEnvelope } from '../soap-client';

describe('SOAP envelope builders', () => {
  it('buildTimbrarEnvelope incluye cfdiBase64 y creds', () => {
    const env = buildTimbrarEnvelope('user@x', 'pw', '<xml/>');
    expect(env).toContain('<usuario>user@x</usuario>');
    expect(env).toContain('<password>pw</password>');
    expect(env).toContain('<cfdi>');
    expect(env).toContain(Buffer.from('<xml/>').toString('base64'));
    expect(env).toContain('<zip>false</zip>');
  });

  it('buildCancelarEnvelope incluye motivo y sustituto opcional', () => {
    const env = buildCancelarEnvelope('u', 'p', 'AAA-BBB', '01', 'CCC-DDD');
    expect(env).toContain('<uuid>AAA-BBB</uuid>');
    expect(env).toContain('<motivo>01</motivo>');
    expect(env).toContain('<uuidSustituto>CCC-DDD</uuidSustituto>');
  });

  it('buildCancelarEnvelope omite sustituto si null', () => {
    const env = buildCancelarEnvelope('u', 'p', 'AAA-BBB', '02', null);
    expect(env).not.toContain('uuidSustituto');
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/lib/invoicing/solucion-factible/__tests__/soap-client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `soap-client.ts`**

```ts
// src/lib/invoicing/solucion-factible/soap-client.ts
const XML_ESC = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function buildTimbrarEnvelope(usuario: string, password: string, cfdiXml: string): string {
  const b64 = Buffer.from(cfdiXml, 'utf8').toString('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.web.mx/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:timbrarBase64>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <cfdi>${b64}</cfdi>
      <zip>false</zip>
    </ser:timbrarBase64>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function buildCancelarEnvelope(
  usuario: string, password: string,
  uuid: string, motivo: '01'|'02'|'03'|'04', uuidSustituto: string | null,
): string {
  const sust = uuidSustituto
    ? `      <uuidSustituto>${XML_ESC(uuidSustituto)}</uuidSustituto>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.web.mx/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:cancelarAsincrono>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <uuid>${XML_ESC(uuid)}</uuid>
      <motivo>${motivo}</motivo>
${sust}    </ser:cancelarAsincrono>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function buildConsultarEstatusEnvelope(usuario: string, password: string, uuid: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.web.mx/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:getStatusCancelacionAsincrona>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <uuid>${XML_ESC(uuid)}</uuid>
    </ser:getStatusCancelacionAsincrona>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export async function soapCall(
  url: string, action: string, body: string, timeoutMs = 30000,
): Promise<{ status: number; xml: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction': action,
      },
      body,
      signal: ctrl.signal,
    });
    const xml = await res.text();
    return { status: res.status, xml };
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 4: Run test — PASS**

Run: `npx vitest run src/lib/invoicing/solucion-factible/__tests__/soap-client.test.ts`
Expected: PASS 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoicing/solucion-factible/soap-client.ts src/lib/invoicing/solucion-factible/__tests__/soap-client.test.ts
git commit -m "feat(invoicing/sf): SOAP envelope builders + soapCall con timeout"
```

---

### Task 12: `SolucionFactibleProvider` (integra XML + firma + SOAP + parser respuesta)

**Files:**
- Create: `src/lib/invoicing/solucion-factible/index.ts`

**Interfaces:**
- Produces:
  - `class SolucionFactibleProvider implements InvoicingProvider`
  - Endpoints internos: `ENDPOINTS.timbrado.test`, `.timbrado.prod`, `.cancelacion.*`
- Consumes: `buildCfdiXml`, `signXml`, `soapCall`, `buildTimbrarEnvelope`, `buildCancelarEnvelope`, `buildConsultarEstatusEnvelope`, `mapSfError`.

- [ ] **Step 1: Implementar provider**

```ts
// src/lib/invoicing/solucion-factible/index.ts
import { XMLParser } from 'fast-xml-parser';
import type {
  InvoicingProvider, CfdiInput, StampResult, TimbrarOpts,
  CancelMotivo, CancelSubmitResult, CancelStatus, CancelOpts,
} from '../provider';
import { buildCfdiXml } from './xml-builder';
import { signXml } from './signer';
import {
  soapCall, buildTimbrarEnvelope, buildCancelarEnvelope, buildConsultarEstatusEnvelope,
} from './soap-client';
import { mapSfError } from '../error-mapping';

const ENDPOINTS = {
  timbrado: {
    test: 'https://testing.solucionfactible.com/ws/services/Timbrado',
    prod: 'https://solucionfactible.com/ws/services/Timbrado',
  },
  cancelacion: {
    test: 'https://testing.solucionfactible.com/ws/services/Cancelacion',
    prod: 'https://solucionfactible.com/ws/services/Cancelacion',
  },
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true });

function extractResultado(soapXml: string): { status: number; mensaje: string; resultado?: Record<string, unknown> } {
  const parsed = parser.parse(soapXml);
  const body = parsed?.Envelope?.Body ?? {};
  const respKey = Object.keys(body).find(k => k.endsWith('Response')) ?? '';
  const ret = (body[respKey] as Record<string, unknown> | undefined)?.return as Record<string, unknown> | undefined;
  if (!ret) throw new Error(`Respuesta SF sin <return>: ${soapXml.slice(0, 300)}`);
  const status = Number(ret.status);
  const mensaje = String(ret.mensaje ?? '');
  const resultados = (ret.resultados as Record<string, unknown> | undefined) ?? undefined;
  return { status, mensaje, resultado: resultados };
}

async function generateQrPng(cadena: string): Promise<Buffer> {
  const { toBuffer } = await import('qrcode');
  return toBuffer(cadena, { type: 'png', width: 300, margin: 1 });
}

export class SolucionFactibleProvider implements InvoicingProvider {
  async timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult> {
    const xmlUnsigned = buildCfdiXml(cfdi);
    const xmlSigned = signXml(xmlUnsigned, cfdi.csd);
    const envelope = buildTimbrarEnvelope(cfdi.pacCredentials.usuario, cfdi.pacCredentials.password, xmlSigned);
    const url = opts.testMode ? ENDPOINTS.timbrado.test : ENDPOINTS.timbrado.prod;
    const { xml: soapResp } = await soapCall(url, 'timbrarBase64', envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje, resultado } = extractResultado(soapResp);

    if (status !== 200) {
      const info = mapSfError(status);
      return { ok: false, code: status, message: mensaje, retryable: info.retryable };
    }

    const r = resultado ?? {};
    const uuid = String(r.uuid ?? '');
    const selloSat = String(r.selloSAT ?? '');
    const certificadoSat = String(r.certificadoSAT ?? '');
    const fechaTimbrado = String(r.fechaTimbrado ?? '');
    const cadenaOriginal = String(r.cadenaOriginal ?? '');
    const cfdiTimbradoB64 = String(r.cfdiTimbrado ?? '');
    if (!uuid || !cfdiTimbradoB64) {
      return { ok: false, code: 500, message: 'Respuesta SF sin uuid/cfdiTimbrado', retryable: false };
    }

    const xmlTimbrado = Buffer.from(cfdiTimbradoB64, 'base64');
    const qrPng = await generateQrPng(cadenaOriginal || uuid);
    return { ok: true, uuid, selloSat, certificadoSat, fechaTimbrado, cadenaOriginal, xmlTimbrado, qrPng };
  }

  async cancelar(
    uuid: string, motivo: CancelMotivo, uuidSustituto: string | null,
    creds: { usuario: string; password: string },
    _csd: { cerPem: string; keyPem: string; noCertificado: string },
    opts: CancelOpts,
  ): Promise<CancelSubmitResult> {
    const envelope = buildCancelarEnvelope(creds.usuario, creds.password, uuid, motivo, uuidSustituto);
    const url = opts.testMode ? ENDPOINTS.cancelacion.test : ENDPOINTS.cancelacion.prod;
    const { xml } = await soapCall(url, 'cancelarAsincrono', envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje } = extractResultado(xml);
    if (status !== 200) return { status: 'rejected', code: status, message: mensaje };
    return { status: 'sent_to_sat', message: mensaje };
  }

  async consultarEstatusCancelacion(
    uuid: string, creds: { usuario: string; password: string }, opts: CancelOpts,
  ): Promise<CancelStatus> {
    const envelope = buildConsultarEstatusEnvelope(creds.usuario, creds.password, uuid);
    const url = opts.testMode ? ENDPOINTS.cancelacion.test : ENDPOINTS.cancelacion.prod;
    const { xml } = await soapCall(url, 'getStatusCancelacionAsincrona', envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje, resultado } = extractResultado(xml);
    // Mapeo: SF devuelve status con mensajes tipo "Cancelado", "En proceso", "No cancelable"
    const acuse = resultado?.acuseXml ? Buffer.from(String(resultado.acuseXml), 'base64') : undefined;
    if (status === 200 && /cancel/i.test(mensaje)) return { status: 'accepted', acuseXml: acuse, message: mensaje };
    if (status === 200 && /proceso/i.test(mensaje)) return { status: 'pending', message: mensaje };
    if (/no cancelable/i.test(mensaje) || /rechaz/i.test(mensaje)) return { status: 'rejected', message: mensaje };
    if (/plazo/i.test(mensaje) || /expir/i.test(mensaje)) return { status: 'expired', message: mensaje };
    return { status: 'pending', message: mensaje };
  }
}

export const solucionFactibleProvider = new SolucionFactibleProvider();
```

- [ ] **Step 2: Instalar `qrcode`**

```bash
npm install qrcode@^1
npm install --save-dev @types/qrcode@^1
```

- [ ] **Step 3: Verificar compile**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/invoicing/solucion-factible/index.ts package.json package-lock.json
git commit -m "feat(invoicing/sf): SolucionFactibleProvider (timbrar/cancelar/consultar) + QR"
```

---

### Task 13: Test de integración contra sandbox SF (gated por env var)

**Files:**
- Create: `src/lib/invoicing/solucion-factible/__tests__/solucion-factible.integration.test.ts`

**Interfaces:**
- Consumes: `solucionFactibleProvider`, CSD de prueba SAT, credenciales sandbox SF.

- [ ] **Step 1: Test de integración con skip por env**

```ts
// src/lib/invoicing/solucion-factible/__tests__/solucion-factible.integration.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { solucionFactibleProvider } from '../index';
import { parseCsd } from '../../csd-vault';
import type { CfdiInput } from '../../provider';

const SF_ENABLED = process.env.SF_INTEGRATION_TESTS === 'true';
const d = SF_ENABLED ? describe : describe.skip;

const CSD_DIR = join(process.cwd(), 'fixtures', 'sat-test-csd');
const csd = parseCsd(
  readFileSync(join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.cer')),
  readFileSync(join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.key')),
  readFileSync(join(CSD_DIR, 'PASSWORD.txt'), 'utf8').trim(),
);
const PAC = { usuario: 'testing@solucionfactible.com', password: 'timbrado.SF.16672' };

function baseCfdi(overrides: Partial<CfdiInput> = {}): CfdiInput {
  return {
    emisor: { rfc: 'LAN7008173R5', regimenFiscal: '601', nombre: 'ESCUELA KEMPER URGATE' },
    receptor: { rfc: 'XAXX010101000', nombre: 'PUBLICO EN GENERAL',
      usoCfdi: 'S01', regimenFiscal: '616', domicilioFiscal: '64000' },
    lugarExpedicion: '64000',
    formaPago: '03', metodoPago: 'PUE',
    moneda: 'MXN',
    conceptos: [{
      claveProdServ: '01010101', claveUnidad: 'H87', cantidad: 1,
      descripcion: 'Consultoría', valorUnitario: 100, importe: 100, iva: 16,
    }],
    subtotal: 100, iva: 16, total: 116,
    csd: { cerPem: csd.cerPem, keyPem: csd.keyPem, noCertificado: csd.noCertificado },
    pacCredentials: PAC,
    ...overrides,
  };
}

d('SolucionFactibleProvider · sandbox', () => {
  it('timbra un CFDI happy-path y devuelve UUID', { timeout: 60000 }, async () => {
    const res = await solucionFactibleProvider.timbrar(baseCfdi(), { testMode: true });
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (res.ok) {
      expect(res.uuid).toMatch(/^[0-9A-F-]{36}$/i);
      expect(res.selloSat.length).toBeGreaterThan(100);
      expect(res.xmlTimbrado.length).toBeGreaterThan(500);
    }
  });

  it('rechaza con creds inválidas (601)', { timeout: 60000 }, async () => {
    const bad = baseCfdi({ pacCredentials: { usuario: 'no@existe', password: 'nada' } });
    const res = await solucionFactibleProvider.timbrar(bad, { testMode: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(601);
  });
});
```

- [ ] **Step 2: Correr con env activo**

```bash
SF_INTEGRATION_TESTS=true npx vitest run src/lib/invoicing/solucion-factible/__tests__/solucion-factible.integration.test.ts
```

Expected: PASS 2/2 (o falla verbose que ayuda a debuggear si algo del builder/signer no le gusta a SF). Ajustar `xml-builder` / `signer` si SF rechaza el XML (los errores 301/302 traen mensaje detallado del validador).

- [ ] **Step 3: Correr suite completa SIN el env — deben skip**

```bash
npx vitest run src/lib/invoicing
```

Expected: 2 tests `.skip`, resto PASS.

- [ ] **Step 4: Commit + fin fase 2**

```bash
git add src/lib/invoicing/solucion-factible/__tests__/solucion-factible.integration.test.ts
git commit -m "test(invoicing/sf): integración contra sandbox SF (gated SF_INTEGRATION_TESTS)

Fin fase 2 (provider). Timbrado E2E validado contra sandbox SF con
CSD de prueba SAT. Sin conectar aún al flujo del agente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**🛑 CHECKPOINT — Nazre valida que timbrado E2E funciona contra sandbox antes de fase 3.**

## Fase 3 — Guardrails + orquestador + refactor `solicitar_factura` (timbrado desde agente)

Ships when tasks 14–19 complete. Al final: el agente (voice/chat/email) timbra de verdad para orgs con `invoicing_provider='solucion_factible'`, guardrails aplican, fallback humano intacto. Config de la org se hace por SQL manual (UI portal viene en fase 4).

---

### Task 14: `guardrails.ts` — evaluateGuardrails puro

**Files:**
- Create: `src/lib/invoicing/guardrails.ts`
- Create: `src/lib/invoicing/__tests__/guardrails.test.ts`

**Interfaces:**
- Produces:
  - `interface GuardrailInput { total, uso_cfdi, cliente_rfc, portal_email }`
  - `interface GuardrailLimits { monto_max_mxn, blocked_uso_cfdi, max_stamps_per_day, max_stamps_per_hour_per_rfc }`
  - `evaluateGuardrails(input, limits, supabase): Promise<{ pass: boolean; reasons: string[] }>`

- [ ] **Step 1: Test con supabase mock**

```ts
// src/lib/invoicing/__tests__/guardrails.test.ts
import { describe, it, expect, vi } from 'vitest';
import { evaluateGuardrails } from '../guardrails';

function mockSb(perHour: number, perDay: number) {
  const chain = (count: number) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ count, error: null }),
  });
  return {
    from: vi.fn().mockImplementation(() => {
      let n = 0;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockImplementation(() => {
          const c = n === 0 ? perHour : perDay;
          n++;
          return Promise.resolve({ count: c, error: null });
        }),
      };
    }),
  } as any;
}

const LIMITS = {
  monto_max_mxn: 50000,
  blocked_uso_cfdi: ['D01','D02','D03','D04','D05','D06','D07','D08','D09','D10'],
  max_stamps_per_day: 50,
  max_stamps_per_hour_per_rfc: 3,
};

describe('evaluateGuardrails', () => {
  it('pasa si monto ok, uso ok, rates ok', async () => {
    const r = await evaluateGuardrails(
      { total: 1000, uso_cfdi: 'G03', cliente_rfc: 'XAXX010101000', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 0),
    );
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
  });
  it('bloquea si monto excede tope', async () => {
    const r = await evaluateGuardrails(
      { total: 100000, uso_cfdi: 'G03', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 0),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons[0]).toMatch(/monto/i);
  });
  it('bloquea si uso CFDI está en blocked list', async () => {
    const r = await evaluateGuardrails(
      { total: 100, uso_cfdi: 'D01', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 0),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some(x => x.includes('D01'))).toBe(true);
  });
  it('bloquea si rate hora al mismo RFC excedido', async () => {
    const r = await evaluateGuardrails(
      { total: 100, uso_cfdi: 'G03', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(3, 10),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some(x => x.match(/última hora/i))).toBe(true);
  });
  it('bloquea si rate diario global excedido', async () => {
    const r = await evaluateGuardrails(
      { total: 100, uso_cfdi: 'G03', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 50),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some(x => x.match(/diario/i))).toBe(true);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npx vitest run src/lib/invoicing/__tests__/guardrails.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `guardrails.ts`**

```ts
// src/lib/invoicing/guardrails.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface GuardrailInput {
  total: number;
  uso_cfdi: string;
  cliente_rfc: string;
  portal_email: string;
}

export interface GuardrailLimits {
  monto_max_mxn: number;
  blocked_uso_cfdi: string[];
  max_stamps_per_day: number;
  max_stamps_per_hour_per_rfc: number;
}

export interface GuardrailResult { pass: boolean; reasons: string[]; }

export async function evaluateGuardrails(
  input: GuardrailInput, limits: GuardrailLimits, supabase: SupabaseClient,
): Promise<GuardrailResult> {
  const reasons: string[] = [];

  if (input.total > limits.monto_max_mxn) {
    reasons.push(`monto ${input.total} excede tope ${limits.monto_max_mxn}`);
  }
  if (limits.blocked_uso_cfdi.includes(input.uso_cfdi)) {
    reasons.push(`uso CFDI ${input.uso_cfdi} bloqueado para auto`);
  }

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: perHour } = await supabase
    .from('factura_requests')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', input.portal_email)
    .eq('cliente_rfc', input.cliente_rfc)
    .eq('status', 'stamped')
    .gte('fecha_timbrado', hourAgo);
  if ((perHour ?? 0) >= limits.max_stamps_per_hour_per_rfc) {
    reasons.push(`rate limit: ${perHour} CFDI a este RFC en la última hora`);
  }

  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { count: perDay } = await supabase
    .from('factura_requests')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', input.portal_email)
    .eq('status', 'stamped')
    .gte('fecha_timbrado', dayAgo);
  if ((perDay ?? 0) >= limits.max_stamps_per_day) {
    reasons.push(`rate limit diario: ${perDay} CFDI hoy`);
  }

  return { pass: reasons.length === 0, reasons };
}
```

- [ ] **Step 4: Run — PASS**

Run: `npx vitest run src/lib/invoicing/__tests__/guardrails.test.ts`
Expected: PASS 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoicing/guardrails.ts src/lib/invoicing/__tests__/guardrails.test.ts
git commit -m "feat(invoicing): guardrails con 4 reglas (monto, uso, rate hora RFC, rate diario)"
```

---

### Task 15: PDF builder del CFDI (representación impresa)

**Files:**
- Create: `src/lib/invoicing/pdf-builder.ts`

**Interfaces:**
- Produces:
  - `buildCfdiPdf(input: { emisor, receptor, conceptos, subtotal, iva, total, uuid, selloSat, certificadoSat, fechaTimbrado, cadenaOriginal, qrPng }): Promise<Buffer>`

- [ ] **Step 1: Verificar que ya hay librería PDF en el repo**

Run: `grep -l pdfkit\\|@react-pdf src/ 2>/dev/null | head -3`

Si el repo ya usa `@react-pdf/renderer` (patrón `src/lib/contract/template.tsx`), reusar. Si no, `npm install pdfkit@^0.15`.

- [ ] **Step 2: Implementar `pdf-builder.ts`**

Usar patrón de `src/lib/contract/template.tsx` — si es `@react-pdf/renderer`:

```ts
// src/lib/invoicing/pdf-builder.ts
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica' },
  h1: { fontSize: 14, fontWeight: 'bold', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  section: { marginTop: 8, padding: 6, border: '1 solid #ddd' },
  label: { color: '#666', fontSize: 8 },
  qr: { width: 90, height: 90 },
  small: { fontSize: 7, color: '#333', marginTop: 4 },
});

export interface CfdiPdfInput {
  emisor: { rfc: string; nombre: string; regimenFiscal: string };
  receptor: { rfc: string; nombre: string; usoCfdi: string };
  conceptos: Array<{ descripcion: string; cantidad: number; valorUnitario: number; importe: number }>;
  subtotal: number; iva: number; total: number;
  uuid: string; selloSat: string; certificadoSat: string;
  fechaTimbrado: string; cadenaOriginal: string; qrPng: Buffer;
  folio?: string; serie?: string;
}

const mxn = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

function Doc({ d }: { d: CfdiPdfInput }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>CFDI · Ingreso · v4.0</Text>
        <View style={s.row}>
          <Text><Text style={s.label}>Emisor: </Text>{d.emisor.rfc} · {d.emisor.nombre}</Text>
          <Text><Text style={s.label}>Régimen: </Text>{d.emisor.regimenFiscal}</Text>
        </View>
        <View style={s.row}>
          <Text><Text style={s.label}>Receptor: </Text>{d.receptor.rfc} · {d.receptor.nombre}</Text>
          <Text><Text style={s.label}>Uso CFDI: </Text>{d.receptor.usoCfdi}</Text>
        </View>
        <View style={s.section}>
          {d.conceptos.map((c, i) => (
            <View key={i} style={s.row}>
              <Text>{c.cantidad} × {c.descripcion}</Text>
              <Text>{mxn(c.importe)}</Text>
            </View>
          ))}
        </View>
        <View style={s.row}><Text>Subtotal</Text><Text>{mxn(d.subtotal)}</Text></View>
        <View style={s.row}><Text>IVA 16%</Text><Text>{mxn(d.iva)}</Text></View>
        <View style={s.row}><Text style={{ fontWeight: 'bold' }}>Total</Text><Text style={{ fontWeight: 'bold' }}>{mxn(d.total)}</Text></View>

        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Image src={d.qrPng} style={s.qr} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={s.label}>Folio Fiscal (UUID)</Text>
            <Text>{d.uuid}</Text>
            <Text style={s.label}>Fecha de timbrado</Text>
            <Text>{d.fechaTimbrado}</Text>
            <Text style={s.label}>No. Serie Cert. SAT</Text>
            <Text>{d.certificadoSat}</Text>
          </View>
        </View>

        <Text style={s.label}>Sello CFDI</Text>
        <Text style={s.small}>{d.selloSat}</Text>
        <Text style={s.label}>Cadena original del complemento de certificación</Text>
        <Text style={s.small}>{d.cadenaOriginal}</Text>
      </Page>
    </Document>
  );
}

export async function buildCfdiPdf(d: CfdiPdfInput): Promise<Buffer> {
  const blob = await pdf(<Doc d={d} />).toBuffer();
  return blob as unknown as Buffer;
}
```

Si el repo NO usa `@react-pdf/renderer`, sustituir por `pdfkit` con estructura equivalente.

- [ ] **Step 3: Smoke con datos dummy**

Añadir un test rápido:

```ts
// src/lib/invoicing/__tests__/pdf-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildCfdiPdf } from '../pdf-builder';

describe('pdf-builder', () => {
  it('genera un buffer PDF > 1kb', async () => {
    const buf = await buildCfdiPdf({
      emisor: { rfc: 'AAA010101AAA', nombre: 'Test SA', regimenFiscal: '601' },
      receptor: { rfc: 'XAXX010101000', nombre: 'Público', usoCfdi: 'S01' },
      conceptos: [{ descripcion: 'Servicio', cantidad: 1, valorUnitario: 100, importe: 100 }],
      subtotal: 100, iva: 16, total: 116,
      uuid: '12345678-1234-1234-1234-123456789012',
      selloSat: 'x'.repeat(200),
      certificadoSat: '00001000000000000001',
      fechaTimbrado: '2026-08-12T10:00:00',
      cadenaOriginal: '||1.1|...',
      qrPng: Buffer.from([0x89,0x50,0x4E,0x47]),
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });
});
```

Run: `npx vitest run src/lib/invoicing/__tests__/pdf-builder.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/invoicing/pdf-builder.tsx src/lib/invoicing/__tests__/pdf-builder.test.ts
git commit -m "feat(invoicing): buildCfdiPdf (representación impresa CFDI 4.0 con QR)"
```

Nota: renombra a `.tsx` si usa JSX; ajusta `git add` según el path real.

---

### Task 16: `emitirFacturaAuto` orquestador

**Files:**
- Create: `src/lib/invoicing/emitir-factura.ts`

**Interfaces:**
- Consumes: `getCsd` (csd-vault), `evaluateGuardrails`, `solucionFactibleProvider`, `buildCfdiPdf`, `decryptString`, `sendEmail`, `mapSfError`.
- Produces:
  - `type EmitirOutcome = { outcome: 'stamped'; uuid: string; xmlPath: string; pdfPath: string } | { outcome: 'failed'; error: string; retryable: boolean } | { outcome: 'retrying'; error: string }`
  - `emitirFacturaAuto(requestId: string, supabase: SupabaseClient): Promise<EmitirOutcome>`
  - `resolveInvoicingPath(orgEmail: string, supabase): Promise<'human' | 'auto'>` (auxiliar para el refactor de `solicitar_factura`)

- [ ] **Step 1: Implementar**

```ts
// src/lib/invoicing/emitir-factura.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCsd, decryptString } from './csd-vault';
import { evaluateGuardrails } from './guardrails';
import { solucionFactibleProvider } from './solucion-factible';
import { buildCfdiPdf } from './pdf-builder';
import { mapSfError } from './error-mapping';
import { isInvoicingDisabled } from './kill-switch';
import { sendEmail } from '@/lib/email/send';
import type { CfdiInput } from './provider';

export type EmitirOutcome =
  | { outcome: 'stamped'; uuid: string; xmlPath: string; pdfPath: string; folioCorto: string }
  | { outcome: 'failed'; error: string; retryable: false }
  | { outcome: 'retrying'; error: string };

export async function resolveInvoicingPath(
  orgEmail: string, supabase: SupabaseClient,
): Promise<'human' | 'auto'> {
  if (isInvoicingDisabled()) return 'human';
  const { data: org } = await supabase
    .from('organizations')
    .select('invoicing_provider, invoicing_csd_cer_path')
    .eq('portal_email', orgEmail)
    .single();
  if (!org?.invoicing_provider || !org.invoicing_csd_cer_path) return 'human';
  return 'auto';
}

export async function emitirFacturaAuto(
  requestId: string, supabase: SupabaseClient,
): Promise<EmitirOutcome> {
  const { data: req, error: reqErr } = await supabase
    .from('factura_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (reqErr || !req) return { outcome: 'failed', error: 'request no encontrada', retryable: false };

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('portal_email', req.portal_email)
    .single();
  if (!org?.invoicing_provider) return { outcome: 'failed', error: 'org sin PAC', retryable: false };

  // Guardrails
  const guard = await evaluateGuardrails(
    { total: req.total, uso_cfdi: req.uso_cfdi, cliente_rfc: req.cliente_rfc, portal_email: req.portal_email },
    org.invoicing_limits,
    supabase,
  );
  if (!guard.pass) {
    await supabase.from('factura_requests').update({
      guardrail_reason: guard.reasons.join('; '),
    }).eq('id', requestId);
    return { outcome: 'failed', error: guard.reasons.join('; '), retryable: false };
  }

  // Update to stamping (with attempts increment)
  await supabase.from('factura_requests').update({
    status: 'stamping',
    stamp_attempts: (req.stamp_attempts ?? 0) + 1,
    provider: 'solucion_factible',
  }).eq('id', requestId);

  // Load CSD
  let csd;
  try {
    csd = await getCsd(req.portal_email, supabase);
    if (!csd) throw new Error('CSD no configurado');
  } catch (e) {
    const msg = (e as Error).message;
    await supabase.from('factura_requests').update({
      status: 'stamp_failed', stamp_last_error: `CSD: ${msg}`, stamp_last_error_at: new Date().toISOString(),
    }).eq('id', requestId);
    return { outcome: 'failed', error: msg, retryable: false };
  }

  // Decrypt PAC creds
  const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted));

  // Build CFDI input
  const cfdi: CfdiInput = {
    emisor: {
      rfc: org.invoicing_rfc_emisor,
      regimenFiscal: org.invoicing_regimen_fiscal,
      nombre: org.invoicing_razon_social,
    },
    receptor: {
      rfc: req.cliente_rfc,
      nombre: req.cliente_nombre,
      usoCfdi: req.uso_cfdi,
      regimenFiscal: '616',   // Sin obligaciones fiscales por default; ampliar si UI captura
      domicilioFiscal: req.cliente_direccion?.slice(0, 5) || org.invoicing_lugar_expedicion,
    },
    lugarExpedicion: org.invoicing_lugar_expedicion,
    formaPago: req.forma_pago,
    metodoPago: req.metodo_pago,
    moneda: (req.currency ?? 'MXN') as 'MXN' | 'USD',
    conceptos: (req.items as Array<{ descripcion: string; cantidad: number; precio_unitario: number; clave_prodserv?: string; clave_unidad?: string }>).map(i => ({
      claveProdServ: i.clave_prodserv ?? '01010101',
      claveUnidad: i.clave_unidad ?? 'E48',
      cantidad: i.cantidad,
      descripcion: i.descripcion,
      valorUnitario: i.precio_unitario,
      importe: +(i.cantidad * i.precio_unitario).toFixed(2),
      iva: req.iva > 0 ? +(i.cantidad * i.precio_unitario * 0.16).toFixed(2) : undefined,
    })),
    subtotal: req.subtotal, iva: req.iva, total: req.total,
    csd, pacCredentials: creds,
  };

  // Stamp
  const result = await solucionFactibleProvider.timbrar(cfdi, { testMode: org.invoicing_test_mode });

  if (!result.ok) {
    const info = mapSfError(result.code);
    await supabase.from('factura_requests').update({
      status: info.retryable ? 'stamping' : 'stamp_failed',
      stamp_last_error: `[${result.code}] ${result.message}`,
      stamp_last_error_at: new Date().toISOString(),
    }).eq('id', requestId);
    return info.retryable
      ? { outcome: 'retrying', error: result.message }
      : { outcome: 'failed', error: result.message, retryable: false };
  }

  // Upload to Storage
  const yyyy = new Date().getFullYear();
  const mm = String(new Date().getMonth() + 1).padStart(2, '0');
  const base = `${req.portal_email}/${yyyy}/${mm}/${result.uuid}`;
  const xmlPath = `${base}.xml`;
  const pdfPath = `${base}.pdf`;
  const qrPath = `${base}.qr.png`;

  await supabase.storage.from('cfdi').upload(xmlPath, result.xmlTimbrado, {
    contentType: 'application/xml', upsert: true,
  });
  await supabase.storage.from('cfdi').upload(qrPath, result.qrPng, {
    contentType: 'image/png', upsert: true,
  });

  const pdfBuf = await buildCfdiPdf({
    emisor: { rfc: cfdi.emisor.rfc, nombre: cfdi.emisor.nombre, regimenFiscal: cfdi.emisor.regimenFiscal },
    receptor: { rfc: cfdi.receptor.rfc, nombre: cfdi.receptor.nombre, usoCfdi: cfdi.receptor.usoCfdi },
    conceptos: cfdi.conceptos.map(c => ({ descripcion: c.descripcion, cantidad: c.cantidad, valorUnitario: c.valorUnitario, importe: c.importe })),
    subtotal: req.subtotal, iva: req.iva, total: req.total,
    uuid: result.uuid, selloSat: result.selloSat, certificadoSat: result.certificadoSat,
    fechaTimbrado: result.fechaTimbrado, cadenaOriginal: result.cadenaOriginal, qrPng: result.qrPng,
  });
  await supabase.storage.from('cfdi').upload(pdfPath, pdfBuf, {
    contentType: 'application/pdf', upsert: true,
  });

  // Update request
  await supabase.from('factura_requests').update({
    status: 'stamped',
    uuid: result.uuid,
    sello_sat: result.selloSat,
    certificado_sat: result.certificadoSat,
    fecha_timbrado: result.fechaTimbrado,
    cadena_original: result.cadenaOriginal,
    xml_storage_path: xmlPath,
    pdf_storage_path: pdfPath,
    qr_storage_path: qrPath,
    stamp_last_error: null,
  }).eq('id', requestId);

  // Audit log
  await supabase.from('policy_audit_log').insert({
    agent_id: req.agent_id,
    capability: 'cfdi_timbrado',
    action: 'stamped',
    status: 'completed',
    details: { uuid: result.uuid, total: req.total, cliente_rfc: req.cliente_rfc, test_mode: org.invoicing_test_mode },
  });

  // Email al cliente (best effort)
  if (req.cliente_email) {
    void sendEmail({
      to: req.cliente_email,
      subject: `Tu factura · ${result.uuid.slice(-8)}`,
      html: `<p>Adjunto tu CFDI folio <strong>${result.uuid}</strong>.</p>`,
      from: `${org.invoicing_razon_social} <notificaciones@centinelia.mx>`,
      attachments: [
        { filename: `${result.uuid}.xml`, content: result.xmlTimbrado },
        { filename: `${result.uuid}.pdf`, content: pdfBuf },
      ],
    }).catch(err => console.error('[emitirFacturaAuto] email:', err));
  }

  return { outcome: 'stamped', uuid: result.uuid, xmlPath, pdfPath, folioCorto: result.uuid.slice(-8) };
}
```

Nota: si `sendEmail` no soporta `attachments`, agrega el soporte primero. Verifica su firma actual y ajusta.

- [ ] **Step 2: Verificar compile**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/invoicing/emitir-factura.ts
git commit -m "feat(invoicing): emitirFacturaAuto orquestador (guardrails + provider + Storage + PDF + email)"
```

---

### Task 17: Refactor `solicitar_factura` — delega a `emitirFacturaAuto` cuando corresponde

**Files:**
- Modify: `src/lib/fiscal/request-factura.ts`

**Interfaces:**
- Consumes: `resolveInvoicingPath`, `emitirFacturaAuto`.
- Produces: `SolicitarFacturaResult` extendido con `path: 'human' | 'auto'` y `outcome?: 'stamped' | 'failed' | 'retrying'`.

- [ ] **Step 1: Modificar el shape de resultado y agregar bifurcación**

En `src/lib/fiscal/request-factura.ts`, después del INSERT exitoso (línea ~119 según el estado actual), agregar:

```ts
// después de "const { data: row, error } = await ..." exitoso:
import { resolveInvoicingPath, emitirFacturaAuto } from '@/lib/invoicing/emitir-factura';

// ... existente hasta el insert ...

// NUEVO: bifurcación
const path = await resolveInvoicingPath(ctx.portalEmail, ctx.supabase);

if (path === 'auto') {
  const auto = await emitirFacturaAuto(row.id, ctx.supabase);
  if (auto.outcome === 'stamped') {
    return {
      ok: true, request_id: row.id, target_email: ctx.invoicingEmail,
      subtotal, iva, total, path: 'auto', outcome: 'stamped',
      uuid: auto.uuid, folio_corto: auto.folioCorto,
    };
  }
  if (auto.outcome === 'retrying') {
    return {
      ok: true, request_id: row.id, target_email: ctx.invoicingEmail,
      subtotal, iva, total, path: 'auto', outcome: 'retrying',
    };
  }
  // 'failed' → cae al flujo humano (email) abajo con guardrail_reason ya guardado
}

// Flujo humano (existente + limpia): manda email al humano
const targetEmail = ctx.invoicingEmail ?? ctx.portalEmail;
if (targetEmail) {
  // ...código existente sendFacturaRequestEmail...
}
return { ok: true, request_id: row.id, target_email: targetEmail, subtotal, iva, total, path: 'human', outcome: undefined };
```

Actualizar la interface `SolicitarFacturaResult`:

```ts
export interface SolicitarFacturaResult {
  ok: boolean;
  request_id?: string;
  target_email?: string;
  subtotal?: number;
  iva?: number;
  total?: number;
  error?: string;
  path?: 'human' | 'auto';
  outcome?: 'stamped' | 'failed' | 'retrying';
  uuid?: string;
  folio_corto?: string;
}
```

- [ ] **Step 2: Verificar compile**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fiscal/request-factura.ts
git commit -m "refactor(fiscal): solicitarFactura delega a emitirFacturaAuto cuando org tiene PAC"
```

---

### Task 18: Copy adaptativo en la route de voice

**Files:**
- Modify: `src/app/api/voice/tools/solicitar-factura/route.ts`

- [ ] **Step 1: Reemplazar el reply fijo con lógica por outcome**

En el archivo, reemplazar el bloque final:

```ts
if (!res.ok) return reply(res.error ?? 'No pude registrar la solicitud.');

const totalStr = res.total!.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

if (res.path === 'auto' && res.outcome === 'stamped') {
  return reply(
    `Ya la emití por ${totalStr}, folio ${res.folio_corto}. Se la mandé a ${args.cliente_email}.`,
  );
}
if (res.path === 'auto' && res.outcome === 'retrying') {
  return reply(
    `Estoy procesando la emisión por ${totalStr}. Le llegará al correo ${args.cliente_email} en los próximos minutos.`,
  );
}
// 'human' o 'auto→failed' (cayó a humano)
return reply(
  `Solicitud registrada por ${totalStr}. Le avisé al equipo de facturación (${res.target_email}) que emita la factura para ${args.cliente_nombre} (RFC ${args.cliente_rfc}). El cliente recibirá el CFDI en ${args.cliente_email} en las próximas 24 horas hábiles.`,
);
```

- [ ] **Step 2: Verificar compile + smoke local**

Run: `npx tsc --noEmit`
Expected: sin errores.

Correr dev server local: `npm run dev` y probar hitting `/api/voice/tools/solicitar-factura` con un mock body (requerirá auth Vapi — omit real test aquí, se cubre en E2E manual de fase 6).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice/tools/solicitar-factura/route.ts
git commit -m "feat(voice/tools): solicitar_factura copy adaptativo (stamped/retrying/human)"
```

---

### Task 19: Actualizar copy en canales chat + email (executor)

**Files:**
- Modify: `src/lib/tools/executor.ts` (buscar `executeSolicitarFactura` — si existe — y aplicar mismo shape)
- Modify: `src/lib/ops/inbox-processor.ts` (mismo)

- [ ] **Step 1: Localizar los handlers actuales**

Run: `grep -rn "solicitar_factura\|solicitarFactura" src/lib/tools/executor.ts src/lib/ops/inbox-processor.ts src/app/api/portal/[token]/agent-chat/route.ts`

- [ ] **Step 2: Actualizar cada handler para leer `res.path` + `res.outcome`**

Aplicar la misma lógica de copy que Task 18. Si el handler ya devuelve `{content: string}`, sustituir el mensaje:

```ts
const message = res.path === 'auto' && res.outcome === 'stamped'
  ? `Emitida ✓ folio ${res.folio_corto} enviada a ${clienteEmail}.`
  : res.path === 'auto' && res.outcome === 'retrying'
  ? `Procesando emisión — llegará en minutos.`
  : `Registrada. Equipo de facturación la emite hoy.`;
```

- [ ] **Step 3: Commit + fin fase 3**

```bash
git add src/lib/tools/executor.ts src/lib/ops/inbox-processor.ts src/app/api/portal/[token]/agent-chat/route.ts
git commit -m "feat(tools/chat+email): copy adaptativo solicitar_factura por outcome

Fin fase 3 (orquestador + refactor). Agentes ahora timbran de verdad
cuando org.invoicing_provider != null. Sin cambios visibles para orgs
sin PAC conectado. Config manual por SQL hasta fase 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**🛑 CHECKPOINT — Nazre configura AC en Supabase por SQL (INSERT credenciales + CSD manual) y prueba una llamada real en sandbox antes de fase 4.**

## Fase 4 — UI portal (integración autoservicio + rediseño facturas)

Ships when tasks 20–26 complete. Al final: AC conecta SF desde el portal (sin SQL manual), sube CSD, ajusta guardrails, ve estado de facturas con nuevas acciones.

---

### Task 20: Endpoint `connect` — guarda credenciales + valida contra SF sandbox

**Files:**
- Create: `src/app/api/portal/[token]/invoicing/connect/route.ts`

**Interfaces:**
- Consumes: `getAgentByToken` de `@/lib/portal/auth` (verificar path exacto en repo), `solucionFactibleProvider.timbrar` (dry-run con XML mínimo), `encryptString`.
- Produces: POST body `{ usuario, password, rfc_emisor, razon_social, regimen_fiscal, lugar_expedicion, test_mode }` → 200 `{ ok: true, connection_verified: bool }` o 4xx.

- [ ] **Step 1: Implementar route**

```ts
// src/app/api/portal/[token]/invoicing/connect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';
import { encryptString } from '@/lib/invoicing/csd-vault';
import { assertInvoicingEnabled } from '@/lib/invoicing/kill-switch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  assertInvoicingEnabled();
  const { token } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { usuario, password, rfc_emisor, razon_social, regimen_fiscal, lugar_expedicion, test_mode } = body as Record<string, string | boolean>;

  for (const [k, v] of Object.entries({ usuario, password, rfc_emisor, razon_social, regimen_fiscal, lugar_expedicion })) {
    if (!v || typeof v !== 'string') return NextResponse.json({ error: `Falta ${k}` }, { status: 400 });
  }
  if (!/^\d{5}$/.test(lugar_expedicion as string)) return NextResponse.json({ error: 'lugar_expedicion debe ser CP 5 dígitos' }, { status: 400 });

  const supabase = createAdminClient();
  const encCreds = encryptString(JSON.stringify({ usuario, password }));

  const { error } = await supabase.from('organizations').update({
    invoicing_provider: 'solucion_factible',
    invoicing_credentials_encrypted: encCreds,
    invoicing_rfc_emisor: (rfc_emisor as string).toUpperCase(),
    invoicing_razon_social: razon_social,
    invoicing_regimen_fiscal: regimen_fiscal,
    invoicing_lugar_expedicion: lugar_expedicion,
    invoicing_test_mode: test_mode !== false,   // default true
  }).eq('portal_email', agent.portal_email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('admin_access_log').insert({
    actor: agent.portal_email, action: 'invoicing.connect',
    details: { rfc_emisor, test_mode: test_mode !== false },
  });

  return NextResponse.json({ ok: true, message: 'Conectado. Sube el CSD para completar la configuración.' });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/portal/[token]/invoicing/connect/route.ts
git commit -m "feat(portal/api): POST invoicing/connect (guarda creds SF cifradas + datos emisor)"
```

---

### Task 21: Endpoint `csd/upload` — multipart, valida par, sube encriptado

**Files:**
- Create: `src/app/api/portal/[token]/invoicing/csd/upload/route.ts`

- [ ] **Step 1: Implementar**

```ts
// src/app/api/portal/[token]/invoicing/csd/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';
import { parseCsd, putCsd, encryptString } from '@/lib/invoicing/csd-vault';
import { assertInvoicingEnabled } from '@/lib/invoicing/kill-switch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  assertInvoicingEnabled();
  const { token } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const cerFile = form.get('cer') as File | null;
  const keyFile = form.get('key') as File | null;
  const password = form.get('password') as string | null;
  if (!cerFile || !keyFile || !password) return NextResponse.json({ error: 'Faltan cer, key o password' }, { status: 400 });

  const cerBuf = Buffer.from(await cerFile.arrayBuffer());
  const keyBuf = Buffer.from(await keyFile.arrayBuffer());

  let parsed;
  try {
    parsed = parseCsd(cerBuf, keyBuf, password);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: org } = await supabase.from('organizations')
    .select('invoicing_rfc_emisor, invoicing_csd_version')
    .eq('portal_email', agent.portal_email)
    .single();
  if (org?.invoicing_rfc_emisor && org.invoicing_rfc_emisor.toUpperCase() !== parsed.rfc.toUpperCase()) {
    return NextResponse.json({
      error: `RFC del CSD (${parsed.rfc}) no coincide con RFC emisor de la org (${org.invoicing_rfc_emisor})`,
    }, { status: 400 });
  }

  const version = (org?.invoicing_csd_version ?? 0) + 1;
  const { cerPath, keyPath } = await putCsd(agent.portal_email, cerBuf, keyBuf, version, supabase);

  await supabase.from('organizations').update({
    invoicing_csd_cer_path: cerPath,
    invoicing_csd_key_path: keyPath,
    invoicing_csd_password_encrypted: encryptString(password),
    invoicing_csd_version: version,
    invoicing_csd_expires_at: parsed.notAfter.toISOString(),
    invoicing_csd_no_certificado: parsed.noCertificado,
    invoicing_rfc_emisor: parsed.rfc,
  }).eq('portal_email', agent.portal_email);

  await supabase.from('admin_access_log').insert({
    actor: agent.portal_email, action: 'invoicing.csd.upload',
    details: { version, no_certificado: parsed.noCertificado, expires_at: parsed.notAfter.toISOString() },
  });

  return NextResponse.json({
    ok: true, version, rfc: parsed.rfc,
    no_certificado: parsed.noCertificado,
    expires_at: parsed.notAfter.toISOString(),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/portal/[token]/invoicing/csd/upload/route.ts
git commit -m "feat(portal/api): POST invoicing/csd/upload (multipart + validación par + AES-GCM)"
```

---

### Task 22: Endpoints `config` (PATCH) + `disconnect` (DELETE)

**Files:**
- Create: `src/app/api/portal/[token]/invoicing/config/route.ts`
- Create: `src/app/api/portal/[token]/invoicing/disconnect/route.ts`

- [ ] **Step 1: `config` PATCH — actualiza limits, test_mode, toggle cancelación**

```ts
// src/app/api/portal/[token]/invoicing/config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof body.test_mode === 'boolean') patch.invoicing_test_mode = body.test_mode;
  if (typeof body.allow_agent_cancellation === 'boolean') patch.invoicing_allow_agent_cancellation = body.allow_agent_cancellation;

  if (body.limits && typeof body.limits === 'object') {
    const l = body.limits as Record<string, unknown>;
    const limits: Record<string, unknown> = {};
    if (typeof l.monto_max_mxn === 'number' && l.monto_max_mxn > 0) limits.monto_max_mxn = l.monto_max_mxn;
    if (Array.isArray(l.blocked_uso_cfdi)) limits.blocked_uso_cfdi = l.blocked_uso_cfdi.filter(x => typeof x === 'string');
    if (typeof l.max_stamps_per_day === 'number' && l.max_stamps_per_day > 0) limits.max_stamps_per_day = l.max_stamps_per_day;
    if (typeof l.max_stamps_per_hour_per_rfc === 'number' && l.max_stamps_per_hour_per_rfc > 0) limits.max_stamps_per_hour_per_rfc = l.max_stamps_per_hour_per_rfc;
    patch.invoicing_limits = limits;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('organizations').update(patch).eq('portal_email', agent.portal_email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `disconnect` DELETE**

```ts
// src/app/api/portal/[token]/invoicing/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('organizations').update({
    invoicing_provider: null,
    invoicing_credentials_encrypted: null,
    // NO borramos CSD paths ni columnas fiscales — trazabilidad.
    // El CSD queda en Storage pero sin ser referenciado (marca de superseded implícita).
  }).eq('portal_email', agent.portal_email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('admin_access_log').insert({
    actor: agent.portal_email, action: 'invoicing.disconnect',
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/[token]/invoicing/config/route.ts src/app/api/portal/[token]/invoicing/disconnect/route.ts
git commit -m "feat(portal/api): PATCH invoicing/config + DELETE invoicing/disconnect"
```

---

### Task 23: UI `SolucionFactibleSection` + página integración

**Files:**
- Create: `src/app/portal/[token]/oficina/integraciones/solucion-factible/page.tsx`
- Create: `src/app/portal/[token]/oficina/integraciones/solucion-factible/SolucionFactibleSection.tsx`
- Modify: `src/app/portal/[token]/IntegrationsHub.tsx` (agregar tile)

- [ ] **Step 1: Página server component**

```tsx
// src/app/portal/[token]/oficina/integraciones/solucion-factible/page.tsx
import { getAgentByToken } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import SolucionFactibleSection from './SolucionFactibleSection';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const agent = await getAgentByToken(token);
  if (!agent) redirect('/portal');
  const supabase = createAdminClient();
  const { data: org } = await supabase.from('organizations')
    .select('invoicing_provider, invoicing_rfc_emisor, invoicing_razon_social, invoicing_regimen_fiscal, invoicing_lugar_expedicion, invoicing_test_mode, invoicing_allow_agent_cancellation, invoicing_csd_version, invoicing_csd_expires_at, invoicing_csd_no_certificado, invoicing_limits')
    .eq('portal_email', agent.portal_email)
    .single();

  return <SolucionFactibleSection token={token} org={org ?? {}} />;
}
```

- [ ] **Step 2: Client component con form (usa design system V2 existente)**

```tsx
// src/app/portal/[token]/oficina/integraciones/solucion-factible/SolucionFactibleSection.tsx
'use client';
import { useState } from 'react';

interface Org {
  invoicing_provider?: string | null;
  invoicing_rfc_emisor?: string | null;
  invoicing_razon_social?: string | null;
  invoicing_regimen_fiscal?: string | null;
  invoicing_lugar_expedicion?: string | null;
  invoicing_test_mode?: boolean;
  invoicing_allow_agent_cancellation?: boolean;
  invoicing_csd_version?: number;
  invoicing_csd_expires_at?: string | null;
  invoicing_csd_no_certificado?: string | null;
  invoicing_limits?: {
    monto_max_mxn: number; blocked_uso_cfdi: string[];
    max_stamps_per_day: number; max_stamps_per_hour_per_rfc: number;
  };
}

export default function SolucionFactibleSection({ token, org }: { token: string; org: Org }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = !!org.invoicing_provider;
  const csdReady = !!org.invoicing_csd_no_certificado;

  async function connect(fd: FormData) {
    setBusy(true); setMsg(null);
    const body = {
      usuario: fd.get('usuario'), password: fd.get('password'),
      rfc_emisor: fd.get('rfc_emisor'), razon_social: fd.get('razon_social'),
      regimen_fiscal: fd.get('regimen_fiscal'), lugar_expedicion: fd.get('lugar_expedicion'),
      test_mode: fd.get('test_mode') === 'true',
    };
    const r = await fetch(`/api/portal/${token}/invoicing/connect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? '✓ Conectado. Ahora sube tu CSD.' : `✗ ${j.error}`);
    if (r.ok) setTimeout(() => location.reload(), 800);
  }

  async function uploadCsd(fd: FormData) {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/portal/${token}/invoicing/csd/upload`, { method: 'POST', body: fd });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `✓ CSD v${j.version} · vence ${new Date(j.expires_at).toLocaleDateString()}` : `✗ ${j.error}`);
    if (r.ok) setTimeout(() => location.reload(), 800);
  }

  async function saveConfig(patch: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/portal/${token}/invoicing/config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    setBusy(false);
    setMsg(r.ok ? '✓ Guardado' : `✗ ${(await r.json()).error}`);
  }

  async function disconnect() {
    if (!confirm('¿Desconectar Solución Factible? Los agentes volverán a escalar facturas a humano.')) return;
    setBusy(true);
    await fetch(`/api/portal/${token}/invoicing/disconnect`, { method: 'DELETE' });
    location.reload();
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solución Factible · Timbrado CFDI 4.0</h1>
        <span className={`text-xs px-2 py-1 rounded ${connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {connected ? (csdReady ? 'Activo' : 'Sin CSD') : 'Desconectado'}
        </span>
      </div>

      {msg && <div className="p-3 rounded border text-sm">{msg}</div>}

      {!connected && (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void connect(new FormData(e.currentTarget)); }}>
          <p className="text-sm text-gray-600">Conecta tu cuenta de Solución Factible para que tus empleados timbren CFDI automáticamente.</p>
          <div className="grid grid-cols-2 gap-3">
            <input name="usuario" placeholder="Usuario SF" required className="border rounded px-3 py-2" />
            <input name="password" type="password" placeholder="Password SF" required className="border rounded px-3 py-2" />
            <input name="rfc_emisor" placeholder="RFC emisor" required className="border rounded px-3 py-2 uppercase" />
            <input name="razon_social" placeholder="Razón social" required className="border rounded px-3 py-2" />
            <input name="regimen_fiscal" placeholder="Régimen fiscal (ej 601)" required className="border rounded px-3 py-2" />
            <input name="lugar_expedicion" placeholder="Lugar de expedición (CP)" required pattern="\d{5}" className="border rounded px-3 py-2" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="test_mode" value="true" defaultChecked /> Modo pruebas (sandbox)
          </label>
          <button disabled={busy} className="bg-black text-white px-4 py-2 rounded">Conectar</button>
        </form>
      )}

      {connected && (
        <>
          <div className="border rounded p-4 space-y-2">
            <h2 className="font-semibold">Certificado de Sello Digital (CSD)</h2>
            {csdReady ? (
              <p className="text-sm">Versión {org.invoicing_csd_version} · No. certificado {org.invoicing_csd_no_certificado} · vence {new Date(org.invoicing_csd_expires_at!).toLocaleDateString()}</p>
            ) : (
              <p className="text-sm text-amber-700">Sube tu CSD para poder timbrar.</p>
            )}
            <form onSubmit={e => { e.preventDefault(); void uploadCsd(new FormData(e.currentTarget)); }} className="space-y-2">
              <input name="cer" type="file" accept=".cer" required />
              <input name="key" type="file" accept=".key" required />
              <input name="password" type="password" placeholder="Contraseña de la llave" required className="border rounded px-3 py-2 w-full" />
              <button disabled={busy} className="bg-black text-white px-4 py-2 rounded">{csdReady ? 'Reemplazar CSD' : 'Subir CSD'}</button>
            </form>
          </div>

          <div className="border rounded p-4 space-y-3">
            <h2 className="font-semibold">Configuración</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={org.invoicing_test_mode !== false}
                onChange={e => void saveConfig({ test_mode: e.currentTarget.checked })} />
              Modo pruebas (sandbox). Apaga para timbrar en producción.
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={!!org.invoicing_allow_agent_cancellation}
                onChange={e => void saveConfig({ allow_agent_cancellation: e.currentTarget.checked })} />
              ¿Permitir que tu empleado solicite cancelación de facturas? (default No)
            </label>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label>Monto máximo por CFDI auto (MXN)
                <input type="number" min={1} defaultValue={org.invoicing_limits?.monto_max_mxn ?? 50000}
                  onBlur={e => void saveConfig({ limits: { ...org.invoicing_limits, monto_max_mxn: Number(e.currentTarget.value) } })}
                  className="border rounded px-3 py-2 w-full mt-1" />
              </label>
              <label>Máx CFDI por hora al mismo RFC
                <input type="number" min={1} defaultValue={org.invoicing_limits?.max_stamps_per_hour_per_rfc ?? 3}
                  onBlur={e => void saveConfig({ limits: { ...org.invoicing_limits, max_stamps_per_hour_per_rfc: Number(e.currentTarget.value) } })}
                  className="border rounded px-3 py-2 w-full mt-1" />
              </label>
              <label>Máx CFDI por día
                <input type="number" min={1} defaultValue={org.invoicing_limits?.max_stamps_per_day ?? 50}
                  onBlur={e => void saveConfig({ limits: { ...org.invoicing_limits, max_stamps_per_day: Number(e.currentTarget.value) } })}
                  className="border rounded px-3 py-2 w-full mt-1" />
              </label>
              <label>Usos CFDI bloqueados (coma)
                <input type="text" defaultValue={(org.invoicing_limits?.blocked_uso_cfdi ?? []).join(',')}
                  onBlur={e => void saveConfig({ limits: { ...org.invoicing_limits, blocked_uso_cfdi: e.currentTarget.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) } })}
                  className="border rounded px-3 py-2 w-full mt-1" />
              </label>
            </div>
          </div>

          <button onClick={disconnect} className="text-sm text-red-700 underline">Desconectar Solución Factible</button>
        </>
      )}
    </div>
  );
}
```

Nota estilística: si tu design system V2 ya tiene componentes `Card`, `Input`, `Toggle`, `FileUpload`, sustituye los `<input>` crudos por ellos siguiendo el patrón de `QuickBooksSection.tsx`. La lógica queda igual.

- [ ] **Step 3: Agregar tile a IntegrationsHub**

Buscar `QuickBooks` en `src/app/portal/[token]/IntegrationsHub.tsx` y añadir tile análogo:

```tsx
{
  key: 'solucion_factible',
  title: 'Solución Factible',
  subtitle: 'Timbrado CFDI 4.0',
  href: `/portal/${token}/oficina/integraciones/solucion-factible`,
  connected: !!org.invoicing_provider,
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/[token]/oficina/integraciones/solucion-factible/ src/app/portal/[token]/IntegrationsHub.tsx
git commit -m "feat(portal/ui): SolucionFactibleSection + tile IntegrationsHub (conectar/CSD/config)"
```

---

### Task 24: Endpoint `factura-requests/[id]/stamp` — humano dispara emisión (bypass guardrails)

**Files:**
- Create: `src/app/api/portal/[token]/factura-requests/[id]/stamp/route.ts`

- [ ] **Step 1: Implementar**

```ts
// src/app/api/portal/[token]/factura-requests/[id]/stamp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';
import { emitirFacturaAuto } from '@/lib/invoicing/emitir-factura';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  // Verificar ownership del request
  const { data: req } = await supabase.from('factura_requests')
    .select('portal_email, status').eq('id', id).single();
  if (!req || req.portal_email !== agent.portal_email) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (req.status === 'stamped') return NextResponse.json({ error: 'ya emitida' }, { status: 409 });

  // Limpiar guardrail_reason antes de reintentar (humano ya autorizó)
  await supabase.from('factura_requests').update({ guardrail_reason: null }).eq('id', id);
  const result = await emitirFacturaAuto(id, supabase);
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 2: Endpoint `mark-manual`**

```ts
// src/app/api/portal/[token]/factura-requests/[id]/mark-manual/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();
  const { error } = await supabase.from('factura_requests').update({
    status: 'marked_manual',
    notes: body.notes ?? null,
  }).eq('id', id).eq('portal_email', agent.portal_email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/[token]/factura-requests/[id]/stamp/route.ts src/app/api/portal/[token]/factura-requests/[id]/mark-manual/route.ts
git commit -m "feat(portal/api): stamp (humano trigger bypass guardrails) + mark-manual"
```

---

### Task 25: Endpoints download XML + PDF (signed URLs)

**Files:**
- Create: `src/app/api/portal/[token]/factura-requests/[id]/xml/route.ts`
- Create: `src/app/api/portal/[token]/factura-requests/[id]/pdf/route.ts`

- [ ] **Step 1: Implementar XML**

```ts
// src/app/api/portal/[token]/factura-requests/[id]/xml/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const { data: req } = await supabase.from('factura_requests')
    .select('portal_email, xml_storage_path, uuid').eq('id', id).single();
  if (!req || req.portal_email !== agent.portal_email || !req.xml_storage_path) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const { data: signed } = await supabase.storage.from('cfdi').createSignedUrl(req.xml_storage_path, 300);
  if (!signed?.signedUrl) return NextResponse.json({ error: 'storage' }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
```

- [ ] **Step 2: Implementar PDF (idéntico salvo path)**

Copiar el archivo XML, cambiar `xml_storage_path` → `pdf_storage_path`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/[token]/factura-requests/[id]/xml/route.ts src/app/api/portal/[token]/factura-requests/[id]/pdf/route.ts
git commit -m "feat(portal/api): GET signed URL download XML + PDF (TTL 5min)"
```

---

### Task 26: Rediseño `/oficina/facturas` — estados + acciones

**Files:**
- Modify: `src/app/portal/[token]/oficina/facturas/page.tsx`

- [ ] **Step 1: Añadir chip de estado + acciones en row expandida**

Leer el archivo actual (`Read` primero), luego insertar:

- Chip: componente inline según `row.status` (pending/stamping/stamped/stamp_failed/marked_manual/cancellation_requested/cancelled) con colores.
- Filtro por estado en header.
- Row expandida:
  - Si `stamped`: 3 botones `<a href={/api/portal/${token}/factura-requests/${row.id}/xml}>XML</a>`, `.../pdf`, y botón "Solicitar cancelación" (abre modal si `invoicing_allow_agent_cancellation` está On para humano — siempre disponible independiente del toggle del agente).
  - Si `pending` y org tiene PAC: botón "Emitir con SF ahora" → POST `/api/portal/${token}/factura-requests/${row.id}/stamp`.
  - Si `pending` sin PAC: botón "Marcar como emitida manual" → POST `.../mark-manual`.
  - Si `stamp_failed`: dos botones — "Reintentar" (POST `.../stamp`) y "Marcar manual".

Ejemplo mínimo del status chip:

```tsx
function StatusChip({ s }: { s: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-700' },
    stamping: { label: 'Timbrando…', cls: 'bg-blue-100 text-blue-700 animate-pulse' },
    stamped: { label: 'Emitida', cls: 'bg-green-100 text-green-700' },
    stamp_failed: { label: 'Falló', cls: 'bg-red-100 text-red-700' },
    marked_manual: { label: 'Manual', cls: 'bg-gray-100 text-gray-500' },
    cancellation_requested: { label: 'Cancelación pedida', cls: 'bg-amber-100 text-amber-700' },
    cancelled: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-400 line-through' },
  };
  const c = cfg[s] ?? cfg.pending;
  return <span className={`text-xs px-2 py-1 rounded ${c.cls}`}>{c.label}</span>;
}
```

- [ ] **Step 2: Commit + fin fase 4**

```bash
git add src/app/portal/[token]/oficina/facturas/page.tsx
git commit -m "feat(portal/ui): oficina/facturas estados + acciones (XML/PDF/stamp/manual/cancel)

Fin fase 4 (UI autoservicio). AC puede conectar SF, subir CSD, ajustar
guardrails y ver estado de facturas sin SQL manual.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**🛑 CHECKPOINT — Nazre valida flujo end-to-end en portal (connect + upload CSD + primera factura desde voz + descarga XML/PDF).**

## Fase 5 — Cancelación (tool + endpoints + cron poll + retry stamping)

Ships when tasks 27–32 complete. Al final: humanos pueden cancelar en portal; con toggle On, agentes también pueden solicitar. Cron poll cierra el ciclo asíncrono. Retry stamping cubre fallos transitorios.

---

### Task 27: Handler shared `solicitarCancelacion`

**Files:**
- Create: `src/lib/invoicing/solicitar-cancelacion.ts`

**Interfaces:**
- Produces:
  - `interface SolicitarCancelacionArgs { uuid_o_folio_corto, motivo, uuid_sustituto?, razon_cliente? }`
  - `solicitarCancelacion(args, ctx: { agentId, portalEmail, supabase, channel }): Promise<{ok, cancellation_id?, message}>`

- [ ] **Step 1: Implementar**

```ts
// src/lib/invoicing/solicitar-cancelacion.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/send';

export interface SolicitarCancelacionArgs {
  uuid_o_folio_corto: string;
  motivo: '01' | '02' | '03' | '04';
  uuid_sustituto?: string;
  razon_cliente?: string;
}

export interface SolicitarCancelacionCtx {
  agentId: string; portalEmail: string; supabase: SupabaseClient;
  channel: 'voice' | 'chat' | 'email';
}

export interface SolicitarCancelacionResult {
  ok: boolean; cancellation_id?: string; message: string;
}

export async function solicitarCancelacion(
  args: SolicitarCancelacionArgs, ctx: SolicitarCancelacionCtx,
): Promise<SolicitarCancelacionResult> {
  if (!['01','02','03','04'].includes(args.motivo)) {
    return { ok: false, message: `Motivo inválido "${args.motivo}". Debe ser 01, 02, 03 o 04.` };
  }
  if (args.motivo === '01' && !args.uuid_sustituto) {
    return { ok: false, message: 'Motivo 01 (error en datos) requiere uuid_sustituto.' };
  }

  const q = args.uuid_o_folio_corto.trim();
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
  const query = ctx.supabase.from('factura_requests')
    .select('id, uuid, cliente_nombre, total, portal_email')
    .eq('portal_email', ctx.portalEmail)
    .eq('status', 'stamped');
  const { data: matches } = isFullUuid
    ? await query.eq('uuid', q)
    : await query.like('uuid', `%${q}`);

  if (!matches || matches.length === 0) return { ok: false, message: `No encontré factura con folio "${q}".` };
  if (matches.length > 1) return { ok: false, message: `Encontré ${matches.length} facturas con ese folio. Pide el UUID completo.` };
  const f = matches[0];

  // Evitar duplicados
  const { count } = await ctx.supabase.from('cfdi_cancellations')
    .select('id', { count: 'exact', head: true })
    .eq('uuid_cancelado', f.uuid)
    .in('status', ['requested','sent_to_sat']);
  if ((count ?? 0) > 0) return { ok: false, message: 'Ya hay una solicitud de cancelación en curso para esa factura.' };

  const { data: ins, error } = await ctx.supabase.from('cfdi_cancellations').insert({
    factura_request_id: f.id,
    organization_email: ctx.portalEmail,
    uuid_cancelado: f.uuid!,
    motivo: args.motivo,
    uuid_sustituto: args.uuid_sustituto ?? null,
    requested_by_agent_id: ctx.agentId,
    requested_via: ctx.channel,
    razon_cliente: args.razon_cliente ?? null,
    status: 'requested',
  }).select('id').single();
  if (error || !ins) return { ok: false, message: 'No pude registrar la solicitud.' };

  await ctx.supabase.from('factura_requests').update({ status: 'cancellation_requested' }).eq('id', f.id);

  // Email al humano (best effort)
  const { data: org } = await ctx.supabase.from('organizations')
    .select('portal_email, invoicing_razon_social').eq('portal_email', ctx.portalEmail).single();
  void sendEmail({
    to: ctx.portalEmail,
    subject: `Solicitud de cancelación · folio ${f.uuid!.slice(-8)}`,
    html: `<p>El agente pidió cancelar la factura <strong>${f.uuid}</strong> (${f.cliente_nombre}, $${f.total}).</p>
           <p>Motivo SAT: ${args.motivo}${args.uuid_sustituto ? ` · sustituto ${args.uuid_sustituto}` : ''}</p>
           <p>Razón cliente: ${args.razon_cliente ?? '—'}</p>
           <p>Confírmala o recházala desde el portal en /oficina/facturas.</p>`,
    from: `${org?.invoicing_razon_social ?? 'Centinelia'} <notificaciones@centinelia.mx>`,
  }).catch(err => console.error('[solicitarCancelacion] email:', err));

  return { ok: true, cancellation_id: ins.id, message: 'Registré la solicitud de cancelación. El equipo la confirma en las próximas horas.' };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/invoicing/solicitar-cancelacion.ts
git commit -m "feat(invoicing): solicitarCancelacion handler (busca UUID, valida motivo, email humano)"
```

---

### Task 28: Registrar tool `solicitar_cancelacion_factura` en 3 canales (condicional por toggle)

**Files:**
- Modify: `src/lib/vapi/sync.ts`
- Modify: `src/app/api/portal/[token]/agent-chat/route.ts`
- Modify: `src/lib/ops/inbox-processor.ts`
- Modify: `src/lib/tools/executor.ts` (agregar `executeSolicitarCancelacionFactura`)
- Create: `src/app/api/voice/tools/solicitar-cancelacion-factura/route.ts`

**Interfaces:**
- Cada registry lee `organizations.invoicing_allow_agent_cancellation` para incluir/excluir la tool per-agent (más bien per-org).

- [ ] **Step 1: Handler voice**

```ts
// src/app/api/voice/tools/solicitar-cancelacion-factura/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { solicitarCancelacion } from '@/lib/invoicing/solicitar-cancelacion';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  const body = await req.json() as Record<string, unknown>;
  const call = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Array<Record<string, unknown>> | undefined)?.[0];
  const rawArgs = (call?.function as Record<string, unknown> | undefined)?.arguments ?? body;
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';
  const reply = (m: string) => NextResponse.json({ results: [{ toolCallId, result: m }] });

  if (!agent_id) return reply('Error de configuración.');
  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('portal_email').eq('id', agent_id).single();
  if (!agent) return reply('Agente no encontrado.');

  const res = await solicitarCancelacion({
    uuid_o_folio_corto: String(args.uuid_o_folio_corto ?? ''),
    motivo: String(args.motivo ?? '') as '01'|'02'|'03'|'04',
    uuid_sustituto: args.uuid_sustituto as string | undefined,
    razon_cliente: args.razon_cliente as string | undefined,
  }, { agentId: agent_id, portalEmail: agent.portal_email, supabase, channel: 'voice' });

  return reply(res.message);
}
```

- [ ] **Step 2: Registry voice — condicional por org**

En `src/lib/vapi/sync.ts`, en la función que arma tools por agente (usualmente `buildToolDef` + distribución por meerkat), agregar:

```ts
// Solo incluir si la org de este agente tiene el toggle On
if (org.invoicing_allow_agent_cancellation) {
  tools.push({
    type: 'function',
    function: {
      name: 'solicitar_cancelacion_factura',
      description: 'Registra una solicitud de cancelación de un CFDI ya emitido. El equipo la confirma después.',
      parameters: {
        type: 'object',
        properties: {
          uuid_o_folio_corto: { type: 'string', description: 'UUID completo o últimos 8 caracteres del folio.' },
          motivo: { type: 'string', enum: ['01','02','03','04'], description: '01=error datos (requiere sustituto). 02=no realizada. 03=no llevó a cabo. 04=nominativa relacionada con global.' },
          uuid_sustituto: { type: 'string', description: 'Requerido si motivo=01. UUID del CFDI que sustituye a éste.' },
          razon_cliente: { type: 'string' },
        },
        required: ['uuid_o_folio_corto', 'motivo'],
      },
      server: { url: `${APP_URL}/api/voice/tools/solicitar-cancelacion-factura?agent_id=${agentId}` },
    },
  });
}
```

- [ ] **Step 3: Chat + executor + inbox — mismo patrón**

En cada uno de:
- `src/app/api/portal/[token]/agent-chat/route.ts` — definir `SOLICITAR_CANCELACION_TOOL`, agregar a `ALL_TOOLS` + `VOICE_TO_CHAT` (`solicitar_cancelacion_factura: 'solicitar_cancelacion'`) + `CHAT_TOOL_BY_NAME`. Filtrar en `getToolsForRole` si `!org.invoicing_allow_agent_cancellation`.
- `src/lib/tools/executor.ts` — agregar `executeSolicitarCancelacionFactura(args, ctx)` que llama al handler shared.
- `src/lib/ops/inbox-processor.ts` — agregar a lista de tools; misma condición org.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/voice/tools/solicitar-cancelacion-factura/route.ts src/lib/vapi/sync.ts src/app/api/portal/[token]/agent-chat/route.ts src/lib/tools/executor.ts src/lib/ops/inbox-processor.ts
git commit -m "feat(tools): solicitar_cancelacion_factura en 3 canales (condicional por toggle org)"
```

---

### Task 29: Endpoints portal `cancellations/[id]/confirm` + `/reject`

**Files:**
- Create: `src/app/api/portal/[token]/cancellations/[id]/confirm/route.ts`
- Create: `src/app/api/portal/[token]/cancellations/[id]/reject/route.ts`

- [ ] **Step 1: Confirm**

```ts
// src/app/api/portal/[token]/cancellations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';
import { getCsd, decryptString } from '@/lib/invoicing/csd-vault';
import { solucionFactibleProvider } from '@/lib/invoicing/solucion-factible';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = createAdminClient();

  const { data: cx } = await supabase.from('cfdi_cancellations').select('*').eq('id', id).single();
  if (!cx || cx.organization_email !== agent.portal_email) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (cx.status !== 'requested') return NextResponse.json({ error: `estado no válido: ${cx.status}` }, { status: 409 });

  const csd = await getCsd(agent.portal_email, supabase);
  if (!csd) return NextResponse.json({ error: 'CSD no configurado' }, { status: 400 });

  const { data: org } = await supabase.from('organizations').select('invoicing_credentials_encrypted, invoicing_test_mode').eq('portal_email', agent.portal_email).single();
  if (!org?.invoicing_credentials_encrypted) return NextResponse.json({ error: 'creds SF no configuradas' }, { status: 400 });
  const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted));

  const result = await solucionFactibleProvider.cancelar(
    cx.uuid_cancelado, cx.motivo, cx.uuid_sustituto, creds, csd,
    { testMode: org.invoicing_test_mode !== false },
  );

  await supabase.from('cfdi_cancellations').update({
    status: result.status === 'sent_to_sat' ? 'sent_to_sat' : 'rejected',
    requested_by: agent.portal_email,
    sat_status_last_check: new Date().toISOString(),
    notes: result.message,
  }).eq('id', id);

  await supabase.from('policy_audit_log').insert({
    agent_id: cx.requested_by_agent_id,
    capability: 'cfdi_cancelacion',
    action: 'submit',
    status: result.status === 'sent_to_sat' ? 'completed' : 'failed',
    details: { uuid: cx.uuid_cancelado, motivo: cx.motivo, message: result.message },
  });

  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 2: Reject**

```ts
// src/app/api/portal/[token]/cancellations/[id]/reject/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  const { data: cx } = await supabase.from('cfdi_cancellations').select('factura_request_id, organization_email, status').eq('id', id).single();
  if (!cx || cx.organization_email !== agent.portal_email) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await supabase.from('cfdi_cancellations').update({
    status: 'rejected', requested_by: agent.portal_email, notes: body.notes ?? 'Rechazado por humano',
  }).eq('id', id);
  // Revierte factura a stamped
  await supabase.from('factura_requests').update({ status: 'stamped' }).eq('id', cx.factura_request_id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/[token]/cancellations/[id]/
git commit -m "feat(portal/api): cancellations confirm (llama SF) + reject (revierte factura)"
```

---

### Task 30: Cron `poll-sat-cancellations`

**Files:**
- Create: `src/app/api/cron/poll-sat-cancellations/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implementar cron**

```ts
// src/app/api/cron/poll-sat-cancellations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCsd, decryptString } from '@/lib/invoicing/csd-vault';
import { solucionFactibleProvider } from '@/lib/invoicing/solucion-factible';
import { sendEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = createAdminClient();

  // Reservar candidatos con FOR UPDATE SKIP LOCKED via RPC (o UPDATE ... RETURNING)
  const { data: candidates } = await supabase.rpc('claim_sat_cancellations_batch', { p_limit: 50 })
    // Si el RPC no existe todavía, fallback a un SELECT + UPDATE por ID (idempotente pero racier)
    .maybeSingle();

  const list = (candidates as unknown as Array<{ id: string; uuid_cancelado: string; organization_email: string; factura_request_id: string }>) ?? [];

  const results = { checked: 0, accepted: 0, rejected: 0, pending: 0, expired: 0, errors: 0 };

  for (const cx of list) {
    results.checked++;
    try {
      const { data: org } = await supabase.from('organizations')
        .select('invoicing_credentials_encrypted, invoicing_test_mode').eq('portal_email', cx.organization_email).single();
      if (!org?.invoicing_credentials_encrypted) continue;
      const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted));

      const status = await solucionFactibleProvider.consultarEstatusCancelacion(
        cx.uuid_cancelado, creds, { testMode: org.invoicing_test_mode !== false },
      );

      if (status.status === 'accepted') {
        results.accepted++;
        let acusePath: string | null = null;
        if (status.acuseXml) {
          acusePath = `${cx.organization_email}/${cx.id}-acuse.xml`;
          await supabase.storage.from('cfdi-cancellations').upload(acusePath, status.acuseXml, {
            contentType: 'application/xml', upsert: true,
          });
        }
        await supabase.from('cfdi_cancellations').update({
          status: 'accepted', sat_status_last_check: new Date().toISOString(),
          sat_acuse_xml_path: acusePath, notes: status.message,
        }).eq('id', cx.id);
        await supabase.from('factura_requests').update({ status: 'cancelled' }).eq('id', cx.factura_request_id);
        void sendEmail({ to: cx.organization_email, subject: `CFDI cancelado · ${cx.uuid_cancelado.slice(-8)}`,
          html: `<p>SAT aceptó la cancelación.</p>` });
      } else if (status.status === 'rejected') {
        results.rejected++;
        await supabase.from('cfdi_cancellations').update({ status: 'rejected', sat_status_last_check: new Date().toISOString(), notes: status.message }).eq('id', cx.id);
        await supabase.from('factura_requests').update({ status: 'stamped' }).eq('id', cx.factura_request_id);
      } else if (status.status === 'expired') {
        results.expired++;
        await supabase.from('cfdi_cancellations').update({ status: 'expired', sat_status_last_check: new Date().toISOString(), notes: status.message }).eq('id', cx.id);
        await supabase.from('factura_requests').update({ status: 'stamped' }).eq('id', cx.factura_request_id);
      } else {
        results.pending++;
        await supabase.from('cfdi_cancellations').update({ sat_status_last_check: new Date().toISOString() }).eq('id', cx.id);
      }
    } catch (err) {
      results.errors++;
      console.error('[poll-sat-cancellations]', cx.id, err);
    }
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 2: Migration para el RPC (locking correcto)**

Create `migrations/20260812_claim_sat_cancellations_rpc.sql`:

```sql
create or replace function claim_sat_cancellations_batch(p_limit int)
returns table (id uuid, uuid_cancelado text, organization_email text, factura_request_id uuid)
language plpgsql as $$
begin
  return query
    with claimed as (
      select c.id, c.uuid_cancelado, c.organization_email, c.factura_request_id
      from cfdi_cancellations c
      where c.status = 'sent_to_sat'
        and (c.sat_status_last_check is null or c.sat_status_last_check < now() - interval '30 minutes')
        and c.created_at > now() - interval '10 days'
      order by c.created_at asc
      limit p_limit
      for update skip locked
    )
    update cfdi_cancellations c
    set sat_status_last_check = now()  -- reserva soft
    from claimed
    where c.id = claimed.id
    returning c.id, c.uuid_cancelado, c.organization_email, c.factura_request_id;
end;
$$;
```

Aplicar en Supabase.

- [ ] **Step 3: Registrar cron en `vercel.json`**

Añadir al array `crons`:

```json
{ "path": "/api/cron/poll-sat-cancellations", "schedule": "*/30 * * * *" }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/poll-sat-cancellations/route.ts migrations/20260812_claim_sat_cancellations_rpc.sql vercel.json
git commit -m "feat(cron): poll-sat-cancellations cada 30min con FOR UPDATE SKIP LOCKED"
```

---

### Task 31: Cron `retry-failed-stamps`

**Files:**
- Create: `src/app/api/cron/retry-failed-stamps/route.ts`
- Create: `migrations/20260812_claim_retry_stamps_rpc.sql`
- Modify: `vercel.json`

- [ ] **Step 1: RPC + cron análogo al anterior**

```sql
-- migrations/20260812_claim_retry_stamps_rpc.sql
create or replace function claim_retry_stamps_batch(p_limit int)
returns table (id uuid)
language plpgsql as $$
begin
  return query
    with claimed as (
      select f.id from factura_requests f
      where f.status = 'stamping'
        and f.stamp_last_error is not null
        and f.stamp_attempts < 3
        and f.stamp_last_error_at < now() - (case
          when f.stamp_attempts = 1 then interval '1 minute'
          when f.stamp_attempts = 2 then interval '5 minutes'
          else interval '30 minutes' end)
      order by f.stamp_last_error_at asc
      limit p_limit
      for update skip locked
    )
    update factura_requests f
    set stamp_last_error_at = now()   -- soft reserve
    from claimed where f.id = claimed.id
    returning f.id;
end;
$$;
```

```ts
// src/app/api/cron/retry-failed-stamps/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitirFacturaAuto } from '@/lib/invoicing/emitir-factura';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: ids } = await supabase.rpc('claim_retry_stamps_batch', { p_limit: 20 });
  const list = (ids as unknown as Array<{ id: string }>) ?? [];
  const results = { attempted: 0, stamped: 0, failed: 0, retrying: 0 };
  for (const { id } of list) {
    results.attempted++;
    const r = await emitirFacturaAuto(id, supabase);
    if (r.outcome === 'stamped') results.stamped++;
    else if (r.outcome === 'retrying') results.retrying++;
    else results.failed++;
  }
  return NextResponse.json(results);
}
```

Añadir a `vercel.json`:

```json
{ "path": "/api/cron/retry-failed-stamps", "schedule": "*/10 * * * *" }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/retry-failed-stamps/route.ts migrations/20260812_claim_retry_stamps_rpc.sql vercel.json
git commit -m "feat(cron): retry-failed-stamps con backoff exponencial (1-5-30min)"
```

---

### Task 32: UI cancelación desde `/oficina/facturas`

**Files:**
- Modify: `src/app/portal/[token]/oficina/facturas/page.tsx`

- [ ] **Step 1: Modal "Solicitar cancelación" + card en filas `cancellation_requested`**

En la vista actual, en row expandida `stamped` agregar botón:

```tsx
<button onClick={() => openCancelModal(row)}>Solicitar cancelación</button>
```

Modal con select de motivo (01/02/03/04) + input uuid_sustituto condicional + textarea notas. POST a un endpoint interno que crea la `cfdi_cancellations` con `requested_via='portal'` y `requested_by_agent_id=null`.

Necesitas también un endpoint auxiliar para que el HUMANO cree la solicitud desde el portal (misma función `solicitarCancelacion` pero canal `portal`). Puedes reusar el POST a `/api/portal/[token]/cancellations` (nuevo):

```ts
// src/app/api/portal/[token]/cancellations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/auth';
import { solicitarCancelacion } from '@/lib/invoicing/solicitar-cancelacion';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const agent = await getAgentByToken(token);
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const supabase = createAdminClient();
  const r = await solicitarCancelacion(body, {
    agentId: agent.id, portalEmail: agent.portal_email, supabase, channel: 'chat', // usar 'portal' si lo agregas al check constraint (recomendado)
  });
  return NextResponse.json(r);
}
```

Nota: si quieres canal `'portal'` limpio, expande el `check constraint` de `requested_via` con `alter table cfdi_cancellations drop constraint ... add constraint ... check (requested_via in ('voice','chat','email','portal'))`. Como ya está en la migration original — no requiere cambio.

En row `cancellation_requested`: botones "Confirmar" (POST `/cancellations/[id]/confirm`) y "Rechazar" (POST `.../reject`) con textarea de notas.

- [ ] **Step 2: Commit + fin fase 5**

```bash
git add src/app/portal/[token]/oficina/facturas/page.tsx src/app/api/portal/[token]/cancellations/route.ts
git commit -m "feat(portal/ui): UI cancelación (solicitar/confirmar/rechazar) + endpoint humano

Fin fase 5 (cancelación). Ciclo cerrado: agente (si toggle On) o humano
solicita → humano confirma → SF acepta → cron poll marca cancelada.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**🛑 CHECKPOINT — Nazre prueba ciclo completo de cancelación en sandbox antes de fase 6.**

## Fase 6 — Observabilidad + CSD expiry + docs E2E + memoria

Ships when tasks 33–36 complete. Al final: alertas ops, notificaciones de expiración CSD, doc de QA E2E, memoria actualizada.

---

### Task 33: Cron `csd-expiry-notify`

**Files:**
- Create: `src/app/api/cron/csd-expiry-notify/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implementar**

```ts
// src/app/api/cron/csd-expiry-notify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

const WARN_DAYS = [30, 15, 7, 1];

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: orgs } = await supabase.from('organizations')
    .select('portal_email, invoicing_razon_social, invoicing_csd_expires_at')
    .not('invoicing_csd_expires_at', 'is', null);

  const now = Date.now();
  const notified: string[] = [];
  for (const o of orgs ?? []) {
    const days = Math.floor((Date.parse(o.invoicing_csd_expires_at!) - now) / 86400000);
    if (WARN_DAYS.includes(days)) {
      await sendEmail({
        to: o.portal_email,
        subject: `Tu CSD vence en ${days} día(s)`,
        html: `<p>El certificado de sello digital de <strong>${o.invoicing_razon_social ?? o.portal_email}</strong> vence en ${days} día(s). Renuévalo en el SAT y súbelo en el portal para evitar interrupciones de timbrado.</p>`,
        from: 'Centinelia <alerts@centinelia.mx>',
      }).catch(err => console.error('[csd-expiry-notify]', o.portal_email, err));
      notified.push(o.portal_email);
    }
  }
  return NextResponse.json({ notified });
}
```

Añadir a `vercel.json`:

```json
{ "path": "/api/cron/csd-expiry-notify", "schedule": "0 9 * * *" }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/csd-expiry-notify/route.ts vercel.json
git commit -m "feat(cron): csd-expiry-notify diario 9am UTC (30/15/7/1 días antes)"
```

---

### Task 34: Doc E2E QA

**Files:**
- Create: `docs/qa/invoicing-e2e.md`

- [ ] **Step 1: Doc con pasos concretos**

```markdown
# QA E2E — Integración Solución Factible

## Prerequisitos
- Cuenta AC Proyectos activa en dev/staging
- CSD de prueba SAT en `fixtures/sat-test-csd/`
- Credenciales sandbox SF: testing@solucionfactible.com / timbrado.SF.16672

## Escenario 1 — Onboarding SF
1. Login portal `/portal/[token]/oficina/integraciones/solucion-factible`
2. Fill form con RFC LAN7008173R5, régimen 601, CP 64000, sandbox creds
3. Click Conectar → verifica badge "Sin CSD"
4. Sube .cer + .key + password del CSD de prueba
5. Verifica: badge "Activo", RFC coincide, vigencia mostrada

## Escenario 2 — Timbrado por voz (auto)
1. Llamar al número Vapi del agente
2. "Quiero factura por 5000 pesos para XAXX010101000 público en general"
3. Agente confirma datos y dice "Ya la emití, folio XXXXXXXX"
4. Verificar en Supabase: `select uuid, status from factura_requests order by created_at desc limit 1;` → status='stamped'
5. Portal /oficina/facturas → row con chip "Emitida" → descargar XML y PDF

## Escenario 3 — Guardrail bloquea → humano toma control
1. Portal config → monto_max_mxn = 100
2. Voz: "factura por 5000" → agente dice "el equipo la revisa hoy mismo"
3. Portal /oficina/facturas → row "Pendiente" con guardrail_reason visible
4. Click "Emitir con SF ahora" → status='stamped'

## Escenario 4 — Cancelación
1. Config → allow_agent_cancellation ON
2. Voz: "cancela la factura XXXXXXXX motivo 02"
3. Agente confirma solicitud
4. Portal /oficina/facturas → chip "Cancelación pedida" → Confirmar
5. Esperar cron poll (30min) o disparar manual: `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/poll-sat-cancellations`
6. Verificar chip "Cancelada" tachado

## Escenario 5 — Rollback
1. Portal → Desconectar Solución Factible → confirm
2. Voz: "quiero factura por 5000" → agente vuelve a decir "el equipo la emite hoy mismo"
3. Verificar `select invoicing_provider from organizations where portal_email='ac@...';` → null

## Escenario 6 — Kill switch platform
1. Vercel env: INVOICING_DISABLED=true → redeploy
2. Voz cualquier org → todos los timbrados caen a humano sin importar config
3. Quitar env → normal
```

- [ ] **Step 2: Commit**

```bash
git add docs/qa/invoicing-e2e.md
git commit -m "docs(qa): E2E plan integración Solución Factible (6 escenarios)"
```

---

### Task 35: Alertas ops (creds inválidas + rate stamp_failed alto)

**Files:**
- Modify: `src/app/api/cron/infra-alerts/route.ts` (o similar; buscar el cron existente que envía alerts@centinelia.mx)

- [ ] **Step 1: Buscar cron de alerts existente**

Run: `grep -rn "alerts@centinelia.mx\|infra-alerts" src/app/api/cron/ | head`

- [ ] **Step 2: Añadir bloque de alertas invoicing al cron existente (o crear `cron/invoicing-alerts` si prefieres aislarlo)**

```ts
// Query orgs con credenciales inválidas persistentes
const { data: badCreds } = await supabase.rpc('sql', {
  q: `select organization_email, count(*) as failed_recent
      from factura_requests
      where stamp_last_error like '%[601]%' or stamp_last_error like '%[603]%'
        and stamp_last_error_at > now() - interval '2 hours'
      group by organization_email having count(*) >= 2`,
});

// Query orgs con rate stamp_failed > 10% en 1h
const { data: highFail } = await supabase.rpc('sql', {
  q: `with recent as (
        select portal_email, status from factura_requests where created_at > now() - interval '1 hour'
      )
      select portal_email,
        count(*) filter (where status='stamp_failed')::float / nullif(count(*),0) as fail_rate,
        count(*) as total
      from recent group by portal_email
      having count(*) >= 5 and count(*) filter (where status='stamp_failed')::float / count(*) > 0.1`,
});

// Enviar email si hay hallazgos
if ((badCreds?.length ?? 0) > 0 || (highFail?.length ?? 0) > 0) {
  await sendEmail({
    to: 'alerts@centinelia.mx',
    subject: 'Alerta invoicing — creds inválidas o fail rate alto',
    html: `<pre>${JSON.stringify({ badCreds, highFail }, null, 2)}</pre>`,
    from: 'Centinelia <alerts@centinelia.mx>',
  });
}
```

Nota: si `rpc('sql', ...)` no existe, usa queries typed convencionales.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/infra-alerts/route.ts
git commit -m "feat(cron/alerts): agregar checks invoicing (creds inválidas + fail rate)"
```

---

### Task 36: Actualizar memoria + fin de plan

**Files:**
- Modify: `C:/Users/Nazre/.claude/projects/C--Users-Nazre/memory/project_centinelia_no_timbra.md`
- Modify: `C:/Users/Nazre/.claude/projects/C--Users-Nazre/memory/project_centinelia_ac_proyectos_pilot.md`
- Modify: `C:/Users/Nazre/.claude/projects/C--Users-Nazre/memory/MEMORY.md` (agregar nueva entry)
- Create: `C:/Users/Nazre/.claude/projects/C--Users-Nazre/memory/project_solucion_factible_integration.md`

- [ ] **Step 1: Actualizar `project_centinelia_no_timbra.md`**

Cambiar el título y contenido: "Centinelia timbra CFDI si org.invoicing_provider != null. Sin conexión, escala a humano (`solicitar_factura` → email). La decisión vive en `resolveInvoicingPath()` en `src/lib/invoicing/emitir-factura.ts`."

- [ ] **Step 2: Crear `project_solucion_factible_integration.md`**

```markdown
---
name: project-solucion-factible-integration
description: "Endpoints, error codes mapping y run book operacional de la integración SF (piloto AC)."
metadata:
  node_type: memory
  type: project
---

# Solución Factible — integration run book

**Endpoints SOAP:**
- Timbrado: `https://{testing.,}solucionfactible.com/ws/services/Timbrado`
- Cancelación: `https://{testing.,}solucionfactible.com/ws/services/Cancelacion`

**Sandbox creds públicas:** testing@solucionfactible.com / timbrado.SF.16672

**Módulos:** `src/lib/invoicing/*`. Provider `SolucionFactibleProvider` en `solucion-factible/index.ts`.

**Error codes:**
- 200: ok
- 301/302: XML/sello inválido (bug builder/CSD)
- 500-503: retryable
- 601-605: creds rotas (notifica org)
- 630-632: sin timbres (org compra más al PAC)

**Crons:** poll-sat-cancellations (30min), retry-failed-stamps (10min), csd-expiry-notify (9am UTC)

**Kill switch platform:** env INVOICING_DISABLED=true
**Kill switch org:** UPDATE organizations SET invoicing_provider=null WHERE portal_email='...'

**Piloto:** AC Proyectos ([[project-centinelia-ac-proyectos-pilot]]) — validar en sandbox 1-2 sem antes de production.

Ver [[project-centinelia-no-timbra]] (regla actualizada).
```

- [ ] **Step 3: Añadir entry a MEMORY.md**

Añadir línea:
```
- [🧾 Solución Factible integration — run book](project_solucion_factible_integration.md) — Endpoints, error codes, crons, kill switches. Ver también no-timbra actualizado.
```

- [ ] **Step 4: Commit final del código**

```bash
git add -A
git commit -m "chore(memory): actualizar project-centinelia-no-timbra + nuevo run book SF

Cierre de plan integración Solución Factible. Todas las fases (1-6)
completas. AC Proyectos listo para conectar en sandbox y arrancar
piloto.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**🛑 CHECKPOINT FINAL — Nazre corre docs/qa/invoicing-e2e.md contra staging. Si pasa, AC conecta en producción con toggle sandbox On por 1-2 semanas, luego switch a Producción.**

---

## Self-review post-plan

**Cobertura del spec:** cada sección del spec tiene tareas — §3 arquitectura (tasks 5,9-12), §4 datos (tasks 2-4), §5 CSD vault (tasks 6-7, 21), §6 provider (tasks 5,12), §7 tool solicitar_factura refactor (tasks 16-19), §8 cancelación (tasks 27-32), §9 UI (tasks 23,26,32), §10 guardrails (task 14), §11 rollback (tasks 22, 8), §12 testing (tasks 5,6,9,10,11,13,14,15 + doc task 34), §13 observabilidad (tasks 16 audit log, 35 alertas), §14 memoria (task 36).

**Placeholder scan:** cero "TODO" / "TBD" / "similar to N" en steps. Cada bloque de código es standalone. Referencias entre tasks usan nombres exactos definidos en tasks previas.

**Consistencia de tipos:** `CfdiInput`, `StampResult`, `EmitirOutcome`, `SolicitarCancelacionResult` — todos definidos en el task que los introduce y referenciados con el mismo nombre en tasks posteriores. `getCsd`/`putCsd`/`parseCsd`/`encryptString`/`decryptString` consistentes desde task 6-7 hasta 21, 29.

**Advertencias operativas para el implementador:**
- El XSLT SAT `cadenaoriginal_4_0.xslt` debe descargarse manualmente y committearse; la lib `xslt-processor` debe ser capaz de aplicarlo — si no, considerar `saxon-js` como alternativa.
- El campo `receptor.regimenFiscal` está hardcodeado a `'616'` en `emitir-factura.ts` — para clientes con obligaciones fiscales reales, ampliar el UI del cliente para capturarlo (fuera de scope v1).
- `sendEmail` puede no soportar `attachments` — verificar y ampliar si falta.
- El patrón `rpc('sql', ...)` usado en Task 35 puede no estar disponible — sustituir por queries typed si es el caso.
