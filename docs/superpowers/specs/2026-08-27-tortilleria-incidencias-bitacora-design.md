# Tortillería — Captura de Incidencias + Bitácora Semanal Design

**Fecha:** 2026-08-27
**Contexto:** Piloto Tortillería Estrella. Después de junta con el dueño, el flow real es distinto al que Beatriz describió por WhatsApp. Reemplaza el flow "Noah toma pedidos" por "Nia captura quejas de tienditas + escala por correo al encargado + verifica a +3d".
**Autor:** Nazre + Claude Opus 4.7 (brainstorm 2026-08-27)

## Problema

Las tienditas (clientes B2B de la tortillería) marcan al número principal cuando **no reciben** su producto ya pedido. Hoy Beatriz (empleada humana) recibe la llamada, transcribe a mano un "mini-reporte" en Excel (ver `handoff_noah_flow_tortilleria_2026-08-27.md` — screenshots del formato oficial), lo manda por correo al encargado, y al final de la semana consolida todos los reportes en una bitácora semanal para visualizar quién fue atendido y quién no. El vendedor que no atendió recibe castigo.

Este trabajo consume ~4 horas/día durante días pico. Es admin repetitivo con reglas fijas — candidato perfecto para automatización real.

**Explícitamente NO estamos reemplazando 1:1 un humano por IA**. Estamos:
- Eliminando transcripción → captura estructurada durante la llamada.
- Eliminando redacción de correo → template auto desde los mismos datos.
- Eliminando agenda de callbacks → cron auto disparado al crear el reporte.
- Eliminando marcado manual de OKs → update auto desde llamada de verificación.
- Eliminando consolidación semanal → la bitácora es vista en vivo, no artefacto.

Al humano le queda solo lo estratégico: revisar bitácora del viernes, identificar vendedores que no atendieron, aplicar consecuencia.

## Objetivos

1. Nia (recepcionista) recibe llamada entrante, distingue entre queja de cliente existente vs. cliente nuevo, y para quejas captura un `client_incident` estructurado.
2. Al crear el incident, se manda correo HTML tipo tarjeta al `receives_incident_reports` del directorio de la org.
3. Al mismo tiempo se agenda callback de verificación a **T + 3 días** (no depende de que el encargado responda).
4. A los +3d, Nia llama a la tiendita: "¿ya recibió?" → marca incident como `ok` / `no_visitado` / `sin_respuesta`.
5. Vista `/portal/[token]/oficina/bitacora` muestra semana en vivo con formato de la bitácora Excel de referencia: cabecera fusionada, colores (nuevo=azul, no atendido=rojo, sin respuesta=gris), casillas OK por día de la semana, `vendedor` editable por humano.
6. Botón export a `.xlsx` que genera el archivo con el mismo formato para imprimir/enviar.
7. Swap del meerkat en Tortillería Estrella de Noah → Nia (Noah era desalineado — es de ventas, no de recepción).
8. Feature-gated por org (`features.incidencia_flow_enabled`) — solo Tortillería Estrella lo tiene ON en fase inicial. Otras orgs no ven la tool ni la vista.

## No-objetivos (YAGNI)

- **NO tomar pedidos por teléfono.** Beatriz confirmó y el dueño validó: ninguna tiendita hace pedido por teléfono, solo quejas y clientes nuevos. `registrar_pedido` no se elimina globalmente (otros meerkats lo usan) pero no se expone en Tortillería Estrella.
- **NO capturar VENDEDOR durante la llamada.** El humano lo llena manualmente en la bitácora después. Nadie sabe qué vendedor le toca a qué tienda hasta que se arma la bitácora.
- **NO esperar confirmación del encargado para agendar +3d.** El cron arranca cuando Nia envía el correo. El "recibido" del encargado se registra si llega (útil para tracking) pero no bloquea nada.
- **NO manejar clientes nuevos con este flow.** Cliente nuevo entra por `crear_lead` existente (ya shipped), no genera incident. Se muestran en la bitácora con la marca "cliente nuevo" (azul) si registraron un lead esa semana.
- **NO castigar automáticamente a un vendedor.** El único output automático es el color de la fila. El humano decide qué hacer.
- **NO integrar con QuickBooks / SF / CONTPAQi** — Tortillería Estrella no factura por este flow, solo reparte.
- **Jornada Alta Demanda combinada (minutos+tareas)** — mencionado por Nazre como cambio de producto separado. Fuera de scope de este spec, su propio spec después.

## Diseño

### 1. Tabla nueva `client_incidents`

Migración `supabase/migrations/YYYYMMDDHHMMSS_create_client_incidents.sql`:

```sql
CREATE TABLE client_incidents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email       TEXT NOT NULL,

  -- Datos capturados durante la llamada
  business_name      TEXT NOT NULL,
  contact_name       TEXT,
  contact_phone      TEXT NOT NULL,
  address            TEXT NOT NULL,
  motivo             TEXT NOT NULL,

  -- Metadata de captura
  source_channel     TEXT NOT NULL,          -- 'voice' | 'chat' | 'email'
  source_call_id     UUID REFERENCES voice_calls(id),
  is_new_client      BOOLEAN NOT NULL DEFAULT false,

  -- Escalación al encargado
  encargado_email    TEXT,                   -- snapshot del correo al que se mandó
  encargado_name     TEXT,                   -- snapshot del nombre
  email_sent_at      TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,            -- si encargado responde/click, se llena

  -- Verificación +3d
  verification_scheduled_at TIMESTAMPTZ NOT NULL,
  verification_outbound_id  UUID REFERENCES outbound_contacts(id),
  verification_called_at    TIMESTAMPTZ,
  verification_result       TEXT,            -- 'ok' | 'no_visitado' | 'sin_respuesta' | NULL (pending)
  verification_result_notes TEXT,

  -- Editable por humano en /oficina/bitacora
  vendedor           TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_incidents_agent_created ON client_incidents(agent_id, created_at DESC);
CREATE INDEX idx_client_incidents_verification_pending
  ON client_incidents(verification_scheduled_at)
  WHERE verification_result IS NULL;
```

### 2. Directory flag `receives_incident_reports`

Se agrega al `DirectoryPerson` interface (`src/lib/helpdesk/folio.ts`) — coexiste con `is_operations_contact` (no lo reemplaza, una persona puede tener ambos, uno, o ninguno).

Migración: NO requiere schema change (directory es `JSONB` en `organizations.directory`). Solo se agrega el opcional al type y a la UI del `DirectoryEditor`.

### 3. Nueva tool `registrar_incidencia`

Executor (`src/lib/tools/executors/registrar-incidencia.ts` — nuevo archivo):

Signature:
```typescript
export async function registrarIncidencia(
  ctx: ToolExecContext,
  args: {
    business_name:    string;
    contact_name?:    string;
    contact_phone:    string;
    address:          string;
    motivo:           string;
  },
): Promise<{ ok: true; incident_id: string; email_sent: boolean; verification_at: string }>
```

Comportamiento:
1. Valida `contact_phone` con `validatePhoneOrThrow` (E.164 MX).
2. INSERT en `client_incidents` con `verification_scheduled_at = NOW() + interval '3 days'`.
3. Llama a `sendIncidentEmailToEncargado(ctx.orgId, incidentRow)` — resuelve `receives_incident_reports` en directory, renderiza template HTML tarjeta, manda via `sendEmail`. Si NO hay encargado configurado, marca `email_sent_at = null` y sigue (log warning).
4. Llama a `upsertFollowupContactForIncident(supabase, { incidentId, agentId, telefono, motivo, scheduledAt, source: 'auto_incident_verification' })`. Cronjob existente que dispara outbound_contacts por `scheduled_at` recogerá esta row.
5. Retorna `{ ok, incident_id, email_sent, verification_at }`.

Registrado en `src/lib/tools/registry.ts` con:
```typescript
{
  name:           'registrar_incidencia',
  channels:       ['voice', 'chat', 'email'],
  capability:     null,
  policy:         { destructive: true, hitDBWrites: true, sideEffects: ['email', 'schedules-call'] },
  gatedByFeature: 'incidencia_flow',
  gatedByRole:    ['nia', 'noah', 'nelia'],
}
```

Endpoints canal-específicos:
- `src/app/api/voice/tools/registrar-incidencia/route.ts` — Vapi format.
- `src/lib/tools/executor.ts` — case `registrar_incidencia` que delega al executor puro.

### 4. Correo tarjeta al encargado

`src/lib/incidents/email-template.ts` — función pura `renderIncidentCardEmail(incident, agent) → { subject, html }`. HTML replica los screenshots (tabla con celdas amarillas para headers, blancas para valores):

```
| FECHA           | 27-ago-26                          |
| HORA            | 10:07                              |
| NOMBRE DEL NEG. | ABARROTES CHARRO                   |
| DIRECCIÓN       | MAYA 766 X CON ATOMI, ...          |
| MOTIVO          | IBA EL VENDEDOR 3 VECES...         |
| CONTACTO        | HECTOR CORONEL - 8126752468        |
```

Subject: `Reporte de incidencia — {business_name} ({fecha})`.

Body incluye link al portal para "marcar como recibido" (opcional, útil para tracking pero no requerido para el flow).

Send: usa `sendEmail` existente con `from = agentBrandedFrom({ agent, ... })`.

### 5. Callback +3d de verificación

Aprovecha infra existente (`upsertFollowupContactForOrder` en `src/lib/leads/dedup.ts`). Nueva variante `upsertFollowupContactForIncident` — mismo shape, distinta `source`.

Cuando el cron dispara la llamada saliente, Nia usa la tool nueva `verificar_recepcion_incidencia(args: { incident_id, resultado, notas? })`:
- `resultado: 'ok'` → cliente confirma que sí recibió.
- `resultado: 'no_visitado'` → cliente dice que sigue sin recibir.
- `resultado: 'sin_respuesta'` → auto-marcado por el cron si agotó reintentos sin contestar.

Executor `verificarRecepcionIncidencia` hace `UPDATE client_incidents SET verification_result, verification_called_at, verification_result_notes`.

El cron ya maneja retries. Al agotar (3 intentos fallidos), un helper `finalizeIncidentIfPending` marca `verification_result='sin_respuesta'`.

### 6. Vista `/portal/[token]/oficina/bitacora`

Página server component (`src/app/portal/[token]/oficina/bitacora/page.tsx`) que carga:
- Incidents de la semana actual (lunes-domingo en tz `America/Monterrey`).
- Selector de semana en la UI (default = actual, permite navegar hacia atrás).

Client component `BitacoraClient.tsx`:
- Tabla con cabecera fusionada tipo Excel (rowspan/colspan CSS grid).
- Columns: fecha llamada, fecha verificación programada, negocio, contacto, teléfono, dirección, motivo, resultado, vendedor (editable), L/M/MI/J/V/S (checkboxes OK).
- Colores por fila:
  - `is_new_client=true` → texto azul.
  - `verification_result='no_visitado'` → texto rojo.
  - `verification_result='sin_respuesta'` → texto gris.
  - Default → texto negro.
- Vendedor editable inline (input onBlur → PATCH endpoint).
- Botón "Exportar Excel" → llama a endpoint `/api/portal/[token]/oficina/bitacora/export?week=YYYY-WW`.

Feature-gated: si `!features.incidencia_flow_enabled`, la página muestra empty state "Bitácora no habilitada para esta cuenta".

### 7. Excel export

`src/app/api/portal/[token]/oficina/bitacora/export/route.ts`:
- Usa librería `exceljs` (agregar como dep si no está).
- Genera `.xlsx` con:
  - Cabecera fusionada "DATOS DEL CLIENTE" + "SEGUIMIENTO DEL CLIENTE EN SU SERVICIO"
  - Colores de celda por regla (azul/rojo/gris)
  - Casillas OK por día
- Descarga con nombre `bitacora-{business}-{week}.xlsx`.

### 8. Nia promptPersonalidad update

En `src/lib/portal/meerkat-roles.ts`, actualizar Nia's `promptPersonalidad` con bloque condicional que se activa cuando `registrar_incidencia` está disponible:

```
[Aparece solo si la tool está disponible en tu contexto:]
FLOW DE INCIDENCIAS (clientes reportando que no recibieron su producto):
- El cliente llama porque su pedido no llegó. Confirma el nombre del negocio,
  dirección exacta, y el motivo puntual ("no fueron esta semana", "ayer no
  llegaron", etc). NO preguntes por vendedor. NO tomes pedidos.
- Cuando tengas los 4 datos (negocio, dirección, contacto/tel, motivo) llama a
  registrar_incidencia. Eso automáticamente notifica al encargado y agenda
  una llamada de verificación en 3 días.
- Confirma al cliente: "Ya notifiqué al encargado, en los próximos días le hablo
  para confirmar que ya le surtieron."

Si el cliente es NUEVO (no está en el directorio ni ha llamado antes) usa
crear_lead con volumen aproximado + zona. NO uses registrar_incidencia
para clientes nuevos.
```

Como el prompt injection existente ya filtra dinamicamente por tools disponibles, esta sección solo aparece cuando la feature está activa en la org.

### 9. Swap Noah → Nia en Tortillería Estrella

Script `scripts/swap-tortilleria-to-nia.ts`:
1. Fetch de `voice_agents` row de Tortillería Estrella (agent_id `e22fbc64-c01c-4184-8365-62e423052d7a`).
2. UPDATE:
   - `features->>'meerkat_role_id'` = `'nia'`
   - `elevenlabs_voice_id` = `MEERKAT_MAP.nia.voiceId` (`9Godp7dNohUvXk6qp0gS`)
   - `agent_name` = `'Nia'`
3. UPDATE en `organizations.features`:
   - `incidencia_flow_enabled` = `true`
4. Call `updateVapiAssistant(agent.vapi_agent_id, updatedAgent)`.
5. Verificar con `getVapiAssistant(vapiId)` que la voz + prompt + tools se actualizaron.

### 10. Estados terminales y colores

| Estado | Cómo se detecta | Color en bitácora | ¿Castigo al vendedor? |
|---|---|---|---|
| **OK** | Cliente contesta callback +3d y confirma que sí recibió | "OK" en el día | No |
| **No visitado** | Cliente contesta callback +3d y dice que sigue sin recibir | Texto rojo | Sí (decisión humana) |
| **Sin respuesta** | Callback +3d agotó reintentos, cliente no contestó | Texto gris | No — inconcluso |
| **Cliente nuevo** | Row creada por `crear_lead` esa semana | Texto azul | N/A |

## E2E Happy Path

1. `+528112803360` (tiendita de prueba) marca a `+528121887969` (número real de Tortillería Estrella).
2. Nia contesta: "Tortillería Estrella, ¿en qué le puedo ayudar?"
3. Tiendita: "Habla de Abarrotes Charro, no me ha llegado el pedido esta semana."
4. Nia captura los 4 datos → llama `registrar_incidencia`.
5. Backend:
   - INSERT en `client_incidents`.
   - Manda correo tarjeta a `receives_incident_reports` del directory.
   - Agenda outbound_contact a T+3d con `source='auto_incident_verification'`.
6. Nia: "Ya notifiqué al encargado, en los próximos días le hablo para confirmar."
7. Encargado recibe correo, ve la tarjeta, actúa (manda vendedor a la tienda).
8. T+3d: Cron dispara llamada saliente a tiendita.
9. Nia: "Le llamo para confirmar si ya recibió el pedido que reportó."
10. Tiendita: "Sí, ya me surtieron el martes."
11. Nia llama `verificar_recepcion_incidencia(incident_id, 'ok', 'surtido el martes')`.
12. Row se marca en verde con casilla OK del martes.
13. Nazre entra a `/oficina/bitacora`, ve el incident cerrado con OK.

## Feature Flags

- `organizations.features.incidencia_flow_enabled: boolean` (default `false`, `true` solo en Tortillería Estrella inicialmente).
- Gate afecta: exposición de `registrar_incidencia` tool + `verificar_recepcion_incidencia` tool + página `/oficina/bitacora`.

## Migraciones DB

Solo 1 migration:
- `YYYYMMDDHHMMSS_create_client_incidents.sql` (tabla + índices).

Sin cambios a `organizations` (feature flag va en `features` JSONB existente).
Sin cambios a `voice_agents.directory` (el flag nuevo es campo opcional en el type TS del JSONB).

## Tests obligatorios

- Unit: `registrarIncidencia` con mock supabase — cubre happy path + no encargado + inválido teléfono.
- Unit: `renderIncidentCardEmail` — snapshot HTML.
- Integration: E2E script `scripts/e2e-test-incidencia-flow.ts` que ejecuta el pipeline completo contra org de test (`nazre+test-followup@centinelia.mx`) sin llamada real, mockeando el cron.

## Rollout

1. Merge migration + código → deploy Vercel.
2. Correr `scripts/swap-tortilleria-to-nia.ts` una sola vez (cambia meerkat en portal real).
3. Correr `scripts/enable-incidencia-flow.ts` para Tortillería Estrella (setea feature flag).
4. Nazre agrega manualmente en directory de la org el `receives_incident_reports` del encargado real (email real).
5. E2E manual: Nazre marca al número real desde otro cel, corre el flow completo.
6. Observar 1 semana. Iterar si Beatriz o el dueño piden ajustes.
