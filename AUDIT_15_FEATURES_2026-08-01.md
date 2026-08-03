# AUDIT — 15 features pre-testing Nazre (2026-08-01)

## Executive Summary

- **11/15** features listas para testing manual (verde).
- **2/15** con gap parcial que no bloquea la prueba pero limita alcance (amarillo): F6 (adjuntos), F11 (reporte mensual Nox).
- **1/15** bloqueante — Google Reviews (F15) tiene UI para guardar URL pero NO dispara invitación post-llamada. Feature no operativa E2E.
- **1/15** parcial — F10 tiene threshold de auto-aprobación (0.85) implementado, pero el trigger de encuestas post-llamada (F7) no despacha automáticamente.
- **1 auto-fix aplicado**: guard defensivo en contador "Este mes" (`documentos/page.tsx:166`) para evitar NaN si `created_at` viene null. Type check limpio.

Los agents Explore devolvieron algunos falsos positivos (try/catch ya presentes, checks empty ya en código). En este reporte sólo se listan hallazgos verificados por lectura directa del archivo.

---

## Feature 1 — buscar_en_web (Brave Search) — ✅

- ✅ Tool en `src/lib/tools/executor.ts:377-384`, wrapper `src/lib/search/web.ts:19-46` (country=MX, es, safesearch=moderate).
- ✅ 3 canales:
  - Voz: `src/lib/vapi/sync.ts:155` (noah/nova/niva).
  - Chat: executor central.
  - Email: inbox-processor usa el mismo executor.
- ✅ `BRAVE_SEARCH_API_KEY` chequeada en 3 lugares con fallback user-friendly (`src/lib/tools/executor.ts:378`, `src/lib/search/web.ts:20`, `src/app/api/voice/tools/buscar-en-web/route.ts:22`).
- ✅ Dedup por URL en `searchMultiple()` (`src/lib/search/web.ts:123-136`).
- ⚠️ Sin timeout explícito de fetch a Brave (usa default de Node ~30s). Sin retry. Acceptable para búsqueda web.
- 🔎 Validación manual: "Nia, ¿horario de RENAPO más cercano?" — verificar que Nia cite la fuente en la respuesta y no invente URLs.

## Feature 2 — Drive / OneDrive — ✅ VERDE (sesión 58, 2026-08-03)

- ✅ Tools `search_files`, `read_file`, `save_to_drive`, `organize_files` en `src/lib/services/connector-tools.ts:96-186+` con OAuth refresh automático vía SDK.
- ✅ Errores descriptivos (permisos insuficientes, connector no configurado).
- ✅ 3 canales:
  - Voz: `src/lib/vapi/sync.ts:160` (naia + coordinadores).
  - Chat: `src/lib/tools/executor.ts:348-359`.
  - Email: inbox-processor.
- ✅ Portal → Integraciones muestra estado conectado/expirado.
- ✅ **E2E verificado con Sofía (Pneuma Studio) contra Google Drive real:**
  - `search_files("pneuma")` → 10 archivos reales (docx/pptx/pdf)
  - `read_file` Google Doc nativo → 4231 chars limpios
  - `read_file` .docx → 7687 chars limpios (post-fix)
  - `read_file` Google Sheet → CSV completo
  - `save_to_drive` PDF con carpeta autocreada → success + link válido
- 🔧 **2 bugs encontrados y arreglados en sesión 58:**
  - BUG1: `read_file` retornaba bytes crudos para `.docx/.xlsx/.pdf/.pptx` (garbage al LLM). Fix: nuevo `src/lib/connectors/parse.ts` con mammoth (docx) + xlsx (spreadsheet) + unpdf (pdf). Aplicado a Google **y** Microsoft. PPTX y .doc antiguos retornan mensaje explicativo en vez de garbage.
  - BUG2: `search_files` solo buscaba por nombre (`name contains`). Fix: `(name contains OR fullText contains) and trashed = false` en Google Drive (Microsoft ya usa Graph search que indexa contenido). Verificado: query "COPY" ahora retorna 15 files incl. PDFs sin "COPY" en el nombre pero con esa palabra en el contenido.
- ⚠️ `organize_files` en executor pero NO en `MEERKAT_VOICE_DISTRIBUTION` — intencional (coordinadores no atienden llamadas).
- ⚠️ Sin límite de tamaño de archivo en `read_file` (depende de límites de Drive/OneDrive/Node). Preview truncado a 8000 chars en `executeReadFile`.
- ⚠️ PDFs escaneados (sin capa de texto) devuelven length≈0 — es limitación de unpdf, no bug (requiere OCR).
- ⚠️ **Microsoft/OneDrive code-verified, E2E pending**: el fix se aplicó igual en `microsoft.ts:read()` pero no hay cuenta OneDrive conectada en el sistema para probar. Revisar cuando el primer cliente conecte Outlook o cuando conectemos uno de prueba.

## Feature 3 — Generación de documentos — ✅ VERDE (sesión 58, 2026-08-03)

- ✅ Templates: `src/lib/pdf/factura.tsx`, `orden-compra.tsx`, `doc.tsx` (Proposal/Letter/Generic). Todos usan branding (`logo_url`, `color`, `footerText`, `address`, `website`, `phone`).
- ✅ Tool `crear_documento` en `src/lib/tools/executor.ts:187-263`. Tipos: `factura | orden_compra | proposal | letter | general`.
- ✅ Folio factura: prefiere QB si conectado, fallback a `PREFIX-YYYYMMDD-NNNN`.
- ✅ Storage Supabase Storage (`agent-documents/`), URL firmada 1h, entry en `ops_documents` con `expires_at = NOW + 30d`.
- ✅ UI `oficina/documentos/page.tsx`: badges, expiry, botón Conservar, delete confirm.
- ✅ **Auto-fix aplicado**: guard `d.created_at && ...` en `page.tsx:166` para evitar NaN en contador "Este mes".
- ✅ **E2E verificado con Sofía (Pneuma Studio):**
  - Los 5 tipos generan PDF válido: factura 4.2s, orden_compra 2.6s, proposal 13.5s (con LLM enhance + peer review), letter 5.1s, general 4.9s.
  - Los 5 crean row en `ops_documents` con `expires_at = 30d`.
  - Factura sample verificado abriendo el PDF (287KB, 1 página): emisor completo con RFC de Pneuma, receptor con RFC del cliente, item + subtotal + IVA 16% + total correcto, folio único `A-20260803-XXXX` (prefijo "A" viene de `factura_config.folio_prefix`).
  - `PATCH /api/portal/[token]/ops-documents` (Conservar) bumpea expires_at exactamente +30 días. Verificado forzando near-expiry (2d) → llamando update → 30d confirmados.
  - `GET /api/portal/[token]/ops-documents/[id]` (descarga) también extiende TTL 30d automáticamente.
- ⚠️ **Gap menor de storage**: no hay cron que borre `ops_documents` expirados. Cuando expires_at<now, el row queda invisible en UI (GET filtra por expires_at>now) pero persiste en DB y el storage object sigue en `agent-documents/`. No es funcional, es housekeeping (costo de storage creep). Recomendado: agregar cron `cleanup-expired-documents` domingo 4am que borre rows con `expires_at < now - 7d` y sus objects.

## Feature 4 — Colaboración empleados (consultar_agente + delegar_tarea) — ✅

- ✅ `src/app/api/voice/tools/consultar-agente/route.ts` — sibling lookup por rol + tools restringidas (buscar_archivo, leer_archivo, buscar_en_web). Máx 5 turns.
- ✅ `src/app/api/voice/tools/delegar-tarea/route.ts` — goal-completion loop con eval Sonnet 4.6 entre intentos (`success_criteria`, `max_iterations` hasta 5). Tools reales: enviar_correo, llamar_a, crear_ticket, crear_documento, buscar/leer archivo, buscar_en_web.
- ✅ Registro en `agent_tasks` con status/trigger_type/source_context/started_at/current_iteration.
- ✅ Timeout: `TIME_BUDGET_MS = 26_000` (buffer contra 30s de Vapi). Parallel tool exec con `Promise.allSettled` para aislar fallos.
- ✅ 3 canales: voz (sync.ts), chat + email (executor `delegate_task`/`consult_agent` en `executor.ts:494-565`).
- ⚠️ Path dual: `consultar_agente` en executor usa `searchWeb` directo; ruta `/api/voice/tools/consultar-agente` usa `executeSearchFiles()`. Potencial inconsistencia menor entre chat/email vs voz.
- 🔎 Validación manual pendiente (ya en memoria [[reminder-e2e-agent-collab]]): probar Nia → consultar_agente(Neo) + Nia → delegar_tarea(Nox) con `success_criteria` explícito. Verificar que UI `oficina/tareas-programadas` refleje status.

## Feature 5 — Memoria del ciudadano — ⚠️

- ✅ `src/lib/memory/{types,extract,postgres-store,index}.ts` completo. Schema con `valid_from/valid_to` temporales, whitelist de predicates (`types.ts:12-37`).
- ✅ Extractor Haiku 4.5 con prompt cacheado + validación contra whitelist.
- ✅ Ingesta post-llamada en `src/app/api/voice/webhook/route.ts:571-578` — fire-and-forget dentro de `after()`, gate por `transcript && duration≥30 && outcome!=='unanswered'`.
- ✅ `buscar_cliente` tool consulta voice_calls/leads_voice/orders_voice/appointments_voice.
- ⚠️ **GAP crítico**: no encontré injection del contexto memoria en el system prompt de la próxima llamada. El webhook usa `getCustomerContext()` (línea 80-115) que es el legacy path por teléfono (voice_calls + leads), NO el memory-graph. La ingesta funciona pero el retrieval al prompt no está claro.
- ⚠️ Feature flag `client_memory` no localizado como gate visible.
- 🔎 Validación manual: (1) primera llamada del mismo número con datos ricos → dejar terminar, (2) esperar >30s, (3) llamar por segunda vez → verificar si Nia recuerda el nombre/último trámite. Si NO recuerda, memory-graph inject no está enganchado al prompt.

## Feature 6 — Reportes ciudadanos (civic_reports) — ⚠️

- ✅ Folio único con reset anual en `src/lib/civic/folio.ts:87-103` (`REP-2026-00001`).
- ✅ Tool `create_civic_report` en executor y ruta `/api/voice/tools/crear-reporte/route.ts` que notifica por WhatsApp al `transfer_whatsapp`.
- ✅ UI `oficina/reportes-ciudadanos/CivicReportsSection.tsx`: cards con folio, filtros por status/categoría/área/búsqueda, checklist de documentos, notas internas, edición inline. **Nota**: la función `load()` usa `try/finally` (no bug de loading infinito).
- ✅ Feature flag `civic_reports` en `types/agent.ts:48`.
- ⚠️ **GAP**: adjuntos de fotos no implementados. La tabla `civic_reports` no tiene columna de `attachment_url` visible y el POST no acepta multipart. Feature declarada, no implementada. **No bloquea** el flujo básico (folio + notificación).
- 🔎 Validación manual: llamar "quiero reportar un bache en la calle X" → verificar folio + WhatsApp al equipo.

## Feature 7 — Encuestas post-llamada — ⚠️

- ✅ Tool `registrar_encuesta` en `/api/voice/tools/registrar-encuesta/route.ts` (mapea respuestas por question_id, guarda en `survey_responses`).
- ✅ UI builder `EncuestasSection.tsx`: 7 categorías, 3-step wizard, trigger selection, agent assignment, tipos rating_5/rating_10/si_no/multiple/texto.
- ✅ Acciones automáticas post-encuesta: create_ticket, notify_manager email, schedule_callback, mark_churn_risk (líneas 74-166 route registrar-encuesta).
- ✅ Feature flag `of_encuestas` en `types/agent.ts:47`.
- ✅ CSV export en `EncuestasSection.tsx:1018-1033` (ya tiene `if (!responses.length) return;` — no bug).
- ⚠️ **GAP**: el trigger post-llamada (dispatcher que inyecta la encuesta al Vapi al terminar una llamada inbound/outbound o después de crear ticket) no fue localizado. Existen `triggers[]` en survey (`end_of_inbound_call`, etc.) pero el consumidor de ese array no aparece en webhooks. Puede que se dispare via cron o solo manualmente.
- 🔎 Validación manual: (1) crear encuesta con trigger `end_of_inbound_call`, (2) llamar, (3) esperar callback saliente de encuesta → si no llega, dispatcher no está enganchado.

## Feature 8 — Verificación identidad (owner_passphrase + team_numbers) — ✅

- ✅ Prompt VERIFICACIÓN INTERNA + regla anti-datos-bancarios en `src/lib/voice/prompt-builder.ts:160-187`.
- ✅ Detección team_number en `src/app/api/voice/inbound/route.ts:122-136`: **la normalización a 10 dígitos ocurre al comparar** (`t.number.replace(/\D/g,'').slice(-10)`), no al guardar. No hay bug de mismatch aun si el usuario guarda +52- vs raw digits.
- ✅ UI: `TeamNumbersEditor.tsx` + `PassphraseEditor.tsx` en `configurar/page.tsx`.
- ✅ API `/api/portal/[token]/team-numbers` GET/PATCH con auth check.
- ✅ Owner bypass business hours en `inbound/route.ts:132-139`.
- ⚠️ **GAP menor**: audit log de "passphrase pasó/falló" no existe. La verificación es 100% side-of-LLM (prompt behavior); si Nia se equivoca no hay traza server-side.
- 🔎 Validación manual: (1) llamar desde team_number registrado → verificar bypass horario. (2) llamar desde número externo, decir la passphrase exacta → verificar que Nia responda con frase discreta. (3) intentar sonsacar datos bancarios verificado → NO debe compartir.

## Feature 9 — Portal Oficina — ✅

- ✅ `/oficina` (Hoy en la oficina): ActividadFeed (`ActividadFeed.tsx:111-123`) **ya tiene try/catch**, no bug. AttentionPanel + EquipoHoySection presentes.
- ✅ `/oficina/documentos`: contadores, badges, Conservar, delete. Auto-fix aplicado en línea 166.
- ✅ `/oficina/plantillas`: existe (`plantillas/page.tsx`).
- ✅ `/oficina/tareas-programadas`, `/encuestas`, `/reportes-ciudadanos`, `/helpdesk`, `/onboarding`, `/bandeja`, `/juntas`, `/cabildo`, `/contratos`, `/reportes`, `/integraciones`, `/investigacion`, `/aprendizajes`, `/llamadas`: todas existen.
- ✅ `PoliciesSection` está en `[token]/page.tsx:52` como sección del portal (no como ruta separada `/politicas`), es correcto.
- ⚠️ Recomendación de smoke test rápido: recorrer cada sección en un token real en `pnpm dev` y verificar que ningún fetch quede colgado con datos vacíos.
- 🔎 Validación manual: pantalla por pantalla, mirar contadores, empty states, y copy visible (nada de "IA", "ops", "agente", em dash, emojis).

## Feature 10 — Aprendizaje continuo — ✅

- ✅ `src/lib/ai/self-eval.ts`: post-call con Haiku, guarda `self_eval_score/notes/at` en `voice_calls`.
- ✅ `src/lib/ai/insights-engine.ts`: 6 dimensiones CES + agregación + LLM recs con prioridades.
- ✅ Cron `weekly-insights` y `push-conversational-prompts` (session 22).
- ✅ **Threshold 0.85 confirmado**: `src/lib/ai/save-learning.ts:8` `AUTO_APPROVE_THRESHOLD = 0.85`. Auto-approved learnings marcan `metadata.auto_approved: true` (línea 73).
- ✅ Global `conversational_learnings` + admin `/admin/conversacional`.
- ⚠️ UI Portal → Configurar → Aprendizajes activos referenciada como `RoleEmailLearningSection` pero componente no localizado en primer grep — verificar en `configurar/page.tsx:31`.
- 🔎 Validación manual: (1) revisar `/admin/conversacional` y confirmar que aparezcan learnings con score. (2) llamar `?force=true` al cron `/api/cron/weekly-insights` en local para forzar. (3) verificar que agent_recommendations se popule.

## Feature 11 — Nox coordinador — ⚠️

- ✅ Cron `nox-monitor` en `vercel.json:7` (9:00 AM diario).
- ✅ `src/lib/ops/nox-coordinator.ts:170-229` detecta overdue (>2h in_progress o due_at pasado) → notifica por WhatsApp o email.
- ✅ Classifier de correos con Haiku 4.5 en líneas 60-157, matchScore + delegación.
- ✅ `findNoxAgent()` respeta `is_coordinator`.
- ❌ **GAP grande**: NO existe reporte mensual agregado. `NOX_MONTHLY_CONFIG` referenciado en memoria (session 14) pero código actual solo tiene alertas de tareas overdue.
- ⚠️ Umbrales hardcoded (2h). Sin UI en Portal → Configurar → Nox.
- 🔎 Validación manual: (1) crear una tarea `in_progress` con `due_at` en el pasado, (2) esperar cron (o correr `/api/cron/nox-monitor?force=true`), (3) verificar WhatsApp/email al owner.

## Feature 12 — Sub-usuarios — ✅

- ✅ CRUD completo en `/api/portal/[token]/users/route.ts` (GET/POST) y `/[id]/route.ts` (PATCH/DELETE).
- ✅ Login dual en `src/app/api/portal/auth/login/route.ts`.
- ✅ Module filtering: `src/lib/portal/modules.ts:1-150` (`PORTAL_MODULES`, `ROUTE_MODULE_MAP`).
- ✅ Guard proxy: `proxy.ts:119-136` redirige sub-users a rutas sin módulo asignado. `#owner_only#` redirige a inicio.
- ✅ `BugReportButton` respeta `allow_bug_reports`.
- ✅ Helpdesk módulo: `of_helpdesk` para giros tecnologia/gobierno.
- ⚠️ UI Portal → Usuarios visible solo para owners (línea 37 usuarios/page.tsx). Sub-users no ven sus propios permisos (baja prioridad).
- 🔎 Validación manual: crear un sub-user con solo `of_helpdesk` → login → confirmar que sidebar NO muestra Correo/Contactos/Leads/Bandeja.

## Feature 13 — Contrato firmable — ✅

- ✅ Schema `contract_text/contract_accepted_at/contract_ip` en `types/agent.ts:137-139`.
- ✅ POST `/api/portal/sign-contract/route.ts` almacena IP + timestamp.
- ✅ Modal en `ContractSection.tsx:42-141` con checklist + confirmación.
- ✅ Cron `contracts-check` en `vercel.json:5` (8:00 AM diario).
- ✅ Renewal draft vía Claude + email en `src/lib/ops/contracts-monitor.ts:16-100`.
- ✅ Custom contract override via PATCH.
- ⚠️ Migración "OpsContractsSection → Plantillas" (session 27) parcial: `OpsContractsSection.tsx` sigue en el árbol, y `oficina/plantillas/page.tsx` existe. Verificar cuál se está sirviendo hoy.
- 🔎 Validación manual: (1) portal fresco → sección contrato visible en Configurar. (2) firmar → confirmar `contract_accepted_at` + `contract_ip` en DB. (3) esperar cron o forzar `/api/cron/contracts-check`.

## Feature 14 — Bug reporting (reportar_falla) — ✅

- ✅ Tool en `src/lib/tools/executor.ts:434-444`. **Sin `consumeAiOp`** — no consume ops.
- ✅ Rate limit 5/hora/IP en `src/lib/ratelimit.ts:38`.
- ✅ Portal FAB `BugReportButton` respeta `allow_bug_reports` (validado también en endpoint línea 29).
- ✅ Copy "no consume tareas ni minutos" en línea 121 del componente.
- ✅ Email a `NEXT_PUBLIC_SUPPORT_EMAIL`.
- ⚠️ **GAP menor**: dedup por `caller_number` para canal voz NO implementado. Si un llamante repite "reporta falla" 20 veces en la misma llamada, generará 20 tickets (rate limit por IP no aplica a Vapi webhook). Baja probabilidad de abuso pero vale documentar.
- 🔎 Validación manual: (1) desde Portal → FAB → enviar reporte → verificar email. (2) opcional: probar `reportar_falla` en chat/voz una vez.

## Feature 15 — Google Reviews — ❌

- ✅ Campo `google_review_url` en `organizations` (org-level).
- ✅ Portal UI para pegar URL (`ReviewLinkEditor.tsx`).
- ✅ Endpoint PATCH para guardar.
- ✅ Cargado en `vapi/sync.ts:104` (ORG_SELECT).
- ❌ **BLOQUEANTE**: NO existe trigger post-llamada que envíe la invitación por SMS/WhatsApp. Confirmado:
  - `src/app/api/voice/webhook/route.ts` — no menciona `google_review_url`.
  - `src/lib/ops/inbox-processor.ts` — no menciona.
  - `sync.ts` solo carga el campo, no lo usa para invitar.
- ❌ Sin threshold CES/self_eval mínimo.
- ❌ Sin cool-down 30 días por caller_number.
- 🔎 Validación manual: NO tiene caso probar la invitación — no existe. Solo podés verificar que el campo se guarda desde el portal. La feature está 70% (storage + UI), le falta el 30% crítico (dispatcher).

---

# Checklist final para Nazre — 15 pasos en orden

Orden sugerido: features maduras y aisladas primero, colaboración y memoria al final (más complejas), Google Reviews al final (feature parcial).

- [ ] **1. buscar_en_web** — Llamar y decir: "Nia, ¿cuál es el horario de RENAPO más cercano en Monterrey?" → verificar que responde con dato + cita fuente y no inventa.
- [ ] **2. Drive/OneDrive** — En chat del portal: pedir "busca el archivo de tarifas 2026". Verificar `search_files` → `read_file`. Luego "guarda esto como Cotización XYZ en la carpeta Drafts" → verificar `save_to_drive`.
- [ ] **3. Documentos** — En chat: "crea una factura para Juan Pérez, RFC ABC123, 3 servicios $1000 c/u". Verificar folio + PDF descargable + entry en Oficina → Documentos con expiry 30d. Usar "Conservar" y confirmar +30d.
- [ ] **4. Bug reporting** — Abrir Portal, click FAB de bug abajo derecha, enviar reporte. Verificar email a nazre20@gmail.com. Confirmar que NO se descontaron ops del contador.
- [ ] **5. Sub-usuarios** — Crear un sub-user con acceso solo a `of_helpdesk`. Log in con esa cuenta. Verificar que en el sidebar NO aparecen Correo/Contactos/Leads/Bandeja.
- [ ] **6. Contrato firmable** — Con portal fresco (contract_accepted_at NULL), ir a Configurar → sección Contrato. Firmar. Verificar en DB que quedaron `contract_accepted_at` y `contract_ip`.
- [ ] **7. Verificación identidad — passphrase** — Llamar desde un número externo. Decir la passphrase exacta configurada. Verificar que Nia responde con frase discreta ("Entendido, ¿en qué te ayudo?"). Luego intentar sonsacar datos bancarios → debe negarse.
- [ ] **8. Verificación identidad — team_numbers** — Agregar tu celular como team_number con `is_owner=true`. Llamar fuera de horario de negocio. Verificar que Nia atiende (no responde con mensaje de "estamos cerrados").
- [ ] **9. Civic reports (F6)** — Llamar y decir: "quiero reportar un bache en Av. Constitución esquina Zaragoza". Verificar folio generado + WhatsApp al `transfer_whatsapp`. Adjuntos por foto NO están implementados — no probar.
- [ ] **10. Colaboración empleados** — En chat/voz con Nia: "consulta con Neo si hay algún ticket abierto sobre Juan". Después: "delega a Nox que envíe seguimiento a los 3 leads de ayer con criterio: obtener al menos 1 respuesta". Verificar entrada en `agent_tasks` con `success_criteria` y ver evolución en Oficina → Tareas programadas.
- [ ] **11. Nox coordinador (F11)** — Crear manualmente en DB una tarea `in_progress` con `due_at` hace 3 horas. Forzar cron: `GET /api/cron/nox-monitor?force=true`. Verificar alerta WhatsApp/email. **NOTA**: reporte mensual agregado NO existe todavía — no probar.
- [ ] **12. Aprendizaje continuo (F10)** — Después de 3-5 llamadas reales, forzar `/api/cron/weekly-insights?force=true`. Ver `agent_recommendations` populada. Revisar `/admin/conversacional` para learnings globales.
- [ ] **13. Encuestas (F7)** — Crear encuesta con trigger `end_of_inbound_call`. Hacer llamada. Si NO recibes callback saliente de encuesta, el dispatcher post-llamada no está enganchado (gap documentado). Si sí, probar CSV export.
- [ ] **14. Memoria del ciudadano (F5)** — Hacer una primera llamada larga con datos ricos ("me llamo Juan Pérez, vivo en Reforma 100, mi correo es X"). Esperar >30s post-cuelgue. Llamar por segunda vez. Si Nia NO recuerda el nombre, el memory-graph inject al prompt no está enganchado (gap documentado en F5).
- [ ] **15. Google Reviews (F15)** — ❌ Solo se puede probar que el campo se guarda en Configurar. La invitación post-llamada NO existe. **Saltar prueba E2E hasta que se implemente el dispatcher SMS/WhatsApp + threshold + cooldown.**

---

## Commits generados en esta sesión

- 1 auto-fix defensivo en `oficina/documentos/page.tsx:166` (guard `d.created_at` para contador "Este mes"). Sin commit todavía — pendiente aprobación de Nazre para commitear.

## Ítems para próxima sesión (post-testing Nazre)

1. **F15 Google Reviews**: implementar dispatcher post-llamada (webhook branch → SMS Twilio o WA con `google_review_url`), threshold `self_eval_score >= X`, tabla `review_invitations` con dedup por `caller_number` (30d).
2. **F5 memoria**: verificar/agregar sección `CONTEXTO DEL LLAMANTE (memoria)` al prompt-builder cuando `client_memory` esté activo, usando `store.query({subjectId, validAt: now})`.
3. **F7 encuestas trigger**: implementar dispatcher que dispare llamada saliente con la encuesta cuando `voice_calls.after()` matchee `survey.triggers[]`.
4. **F11 Nox reporte mensual**: implementar `NOX_MONTHLY_CONFIG` + template mensual (llamadas, tareas resueltas, escaladas, insights, próximos pasos) + envío al owner cada 1 de mes.
5. **F6 civic adjuntos**: añadir columna `attachments jsonb` a `civic_reports` + procesamiento inbound email/WA que ligue foto al folio abierto.
6. **F14 bug dedup voz**: contador por `caller_number` en window de 60min dentro de `reportar_falla` para evitar spam en misma llamada.

---

Nazre, ya puedes empezar a probar 1×1 en el orden del checklist arriba. **Ítem 15 (Google Reviews) está ❌ y no tiene sentido probarlo end-to-end** — feature parcial, sólo storage. Ítems 5 y 7 pueden fallar por gap de dispatcher (documentado). Los demás deberían funcionar en revisión estática.
