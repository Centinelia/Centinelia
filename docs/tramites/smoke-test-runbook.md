# Smoke Test Runbook — External Trámites (Task 12)

## Overview

This runbook guides Nazre through the end-to-end smoke test of the external trámites feature with mock data. All API interactions are mocked via `EXTERNAL_TRAMITES_MOCK_MODE=true` in `.env.local`.

**Estimated duration:** 15–20 minutes  
**Prerequisites:**
- Node 20+ installed locally
- `.env.local` present with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for preview Supabase
- Supabase CLI installed (`supabase` command available)

---

## Step 1: Create Test Organization

Connect to Supabase and insert a test organization:

```sql
INSERT INTO organizations (business_name)
VALUES ('Gobierno de Monterrey (TEST)')
RETURNING id;
```

**Save the returned `org_id`** — you'll need it for the next steps.

---

## Step 2: Create a Voice Agent (Nia) in the Test Org

Option A (SQL — fastest):
```sql
INSERT INTO voice_agents (
  org_id,
  agent_name,
  business_name,
  meerkat_role,
  active
)
VALUES (
  <ORG_ID>,
  'Nia',
  'Gobierno de Monterrey (TEST)',
  'nia',
  true
)
RETURNING id, agent_name;
```

Option B (Portal UI):
1. Open `http://localhost:3000` (after `npm run dev` in Step 5)
2. Log in as the org owner
3. Navigate to **Agentes** → **Agregar agente**
4. Select **Nia** (meerkat_role = 'nia')
5. Fill in name and business name, activate

---

## Step 3: Seed the Mock Trámite

From the worktree root, run:

```bash
npx tsx scripts/tramites/seed-mty-utiles.ts
```

This script:
- Checks for an organization with `business_name ILIKE 'Gobierno de Monterrey%'`
- Inserts the `external_tramites` row with slug `'mty-utiles-2026'`
- Sets mock endpoints for catalogos, lookups, and submit
- Initially sets `activo=false`

**Verify the insert:**
```sql
SELECT id, slug, nombre_publico, activo, endpoint_base
FROM external_tramites
WHERE slug ILIKE 'mty-utiles%';
```

---

## Step 4: Activate the Trámite

```sql
UPDATE external_tramites
SET activo = true
WHERE slug = 'mty-utiles-2026';
```

---

## Step 5: Start Dev Server and Verify Prompt Injection

```bash
# Ensure EXTERNAL_TRAMITES_MOCK_MODE=true is set
grep EXTERNAL_TRAMITES_MOCK_MODE .env.local

# Start dev server
npm run dev
```

Visit `http://localhost:3000` and log in as the org owner. Navigate to **Agentes** → select **Nia** → **Configurar** to view the system prompt. You should see a section:

```
TRÁMITES EXTERNOS QUE PUEDES GESTIONAR:

• Programa de Pre-registro de Útiles 2026 (MTY)
  - ID: mty-utiles-2026
  - Campos requeridos: [...list of 20 fields...]
  - Orden de captura: CURP estudiante → Sede → Escuela → Grado → ...
  - Protocolo CURP: Pedir por formato, [...]
```

**If prompt not visible:** Temporarily add `console.log('SYSTEM PROMPT:', prompt)` in `src/lib/voice/prompt-builder.ts` around line 110–115, then trigger a chat message and check server console.

---

## Step 6: Execute Happy Path via Chat

Open the **Centinelia Portal** → **Agentes** → select **Nia** → **Chat** tab.

Send this opening message:

```
Hola, quiero pre-registrar a mi hija para el programa de útiles.
```

The agent should:
1. Greet and explain the process
2. Read the privacy notice and ask for consent
3. Ask for the **sede** (will invoke `consultar_catalogo_externo` under the hood)

Continue the conversation providing these values **in order**:

| Campo | Valor |
|-------|-------|
| **Sede** | Plaza Paseo La Quinta |
| **CURP estudiante** | MOAE121121MNLLDRA3 |
| **Escuela** | 11 de mayo |
| **Grado** | 5to de primaria |
| **CURP adulto (responsable)** | GOVM860614MNLNLY06 |
| **Calle** | Los Salinas 118 |
| **Número exterior** | 118 |
| **Colonia** | 1 de Mayo |
| **Código postal** | 64220 |
| **Teléfono** | 8991223191 |
| **Correo** | maygzz86@gmail.com |
| **Parentesco** | MADRE |
| **Consentimiento** | Sí / Confirmo |

**Agent should:**
- Autocomplete **Escuela** from the padrón (via `buscar_en_padron_externo`)
- Call `enviar_tramite_externo` at the end with all 20 fields
- Receive folio `MTY-2026-000056` from mock and communicate it to the user
- Example: *"Tu folio de referencia es **MTY-2026-000056**. Guárdalo para seguimiento."*

**Verification — check database:**
```sql
SELECT id, folio, status, channel, created_at
FROM external_tramites_submissions
ORDER BY created_at DESC
LIMIT 1;
```

**Expected output:**
```
 id | folio           | status  | channel | created_at
----+-----------------+---------+---------+------------------
  1 | MTY-2026-000056 | success | chat    | 2026-08-01 ...
```

---

## Step 7: Execute Error Path (Optional but Recommended)

Repeat the flow from Step 6, but when prompted for **Calle**, enter:

```
FAIL_500
```

**Agent should:**
- Detect the error from the mock endpoint
- Inform the user: *"Hubo un problema procesando tu solicitud. Déjame conectarte con un compañero."*
- Ideally invoke `pedir_a_humano` to escalate

**Verification — check database:**
```sql
SELECT id, folio, status, error_message, channel
FROM external_tramites_submissions
WHERE error_message IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;
```

**Expected output:**
```
 id | folio | status       | error_message              | channel
----+-------+--------------+----------------------------+---------
  2 |       | server_error | Mock endpoint returned 500 | chat
```

---

## Step 8: Document Findings

After completing Steps 6–7, note:

1. **Did the happy path complete?** (Y/N) — if N, list which step broke
2. **Did the agent respect the field order?** (Y/N) — log any deviations
3. **Were tools invoked correctly?** (Y/N) — watch server logs for tool calls
4. **Does the agent handle errors gracefully?** (Y/N) — check if escalation happened
5. **Any prompt adjustments needed?** — list as TODOs for golden test calibration

---

## Step 9: Cleanup (Optional)

After testing, you can deactivate and/or delete the test trámite:

```sql
-- Deactivate
UPDATE external_tramites
SET activo = false
WHERE slug = 'mty-utiles-2026';

-- Delete (if needed)
DELETE FROM external_tramites
WHERE slug = 'mty-utiles-2026';

-- Delete test org and submissions (if needed)
DELETE FROM external_tramites_submissions
WHERE tramite_id IN (
  SELECT id FROM external_tramites
  WHERE slug = 'mty-utiles-2026'
);

DELETE FROM organizations
WHERE business_name = 'Gobierno de Monterrey (TEST)';
```

---

## Troubleshooting

### Prompt section not visible

- Check `.env.local` for correct `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify `getActiveTramitesForOrg()` is being called: add temporary `console.log()` in `src/lib/voice/prompt-builder.ts` line 109
- Ensure the trámite has `activo=true` in the database
- Restart dev server (`Ctrl+C`, then `npm run dev`)

### Agent doesn't invoke tools

- Check browser DevTools **Console** for errors
- Check server logs for tool execution messages
- Verify tool definitions are exported in `src/lib/tools/executor.ts`
- Confirm `EXTERNAL_TRAMITES_MOCK_MODE=true` in `.env.local`

### Database rows not created

- Verify the agent reached the `enviar_tramite_externo` step
- Check that all required fields were provided in the chat
- Look for errors in server logs around the tool invocation
- Manually insert a test row to confirm the table is writable:
  ```sql
  INSERT INTO external_tramites_submissions (tramite_id, status, channel)
  VALUES (1, 'test', 'chat');
  ```

### Agent gets stuck in a loop

- The agent may be re-asking for a field if validation failed silently
- Provide the exact format expected (e.g., CURP in uppercase, phone with no dashes)
- Restart the chat and try again

---

## Success Criteria

All of the following must be true:

1. ✅ TypeScript compiles with zero errors (`npx tsc --noEmit`)
2. ✅ Prompt injection includes the trámite section
3. ✅ Chat flow completes end-to-end (user → tools → folio)
4. ✅ Database row created with `status='success'` and valid folio
5. ✅ Error path escalates gracefully (no crashes)

---

## Next Steps (Blocked by Municipality)

Once Nazre receives the municipality's API documentation:

1. Update `endpoint_base` in the `external_tramites` row with the real sandbox URL
2. Generate a bearer token and store it via Supabase Vault (see `scripts/tramites/README.md`)
3. Adjust `campos`, `catalogos`, `lookups`, `submit` fixtures if the real API differs
4. Run golden tests against the real sandbox
5. Pilot with Nazre + Sergio making test calls
6. Enable the trámite in production and give the number to the municipality

---

## Reference

- **Fixtures:** `fixtures/tramites/mty-utiles-2026/`
- **Tool definitions:** `src/lib/tools/executor.ts`, `src/app/api/voice/tools/*/route.ts`
- **Prompt builder:** `src/lib/voice/prompt-builder.ts` (lines 6–7, 109–110)
- **Trámite config:** `src/lib/tramites/config.ts`, `src/lib/tramites/prompt.ts`
- **Script:** `scripts/tramites/seed-mty-utiles.ts`
