# Demo Meefi 15-sept — Nelia soporte hero + Niva compliance wingman

**Fecha**: 2026-09-10
**Autor**: Nazre + Claude
**Runway**: 5 días (10-sept → 15-sept)
**Estado**: aprobado en brainstorm, pendiente plan de implementación

## Contexto y motivación

La cita del 15-sept con Gerardo Guajardo (Meefi) estaba diseñada como demo de Nalú (Tesorera cartera master) + Nara + Niva sobre cartera comercial / onboarding / PLD. Guion `13a-guion-detallado-15-sept.md` y runbook `20-dry-run-runbook.md` shipped, aún no corridos.

En sesión previa (2026-09-10 tarde) Gera comunicó cambio de rumbo: **lo que Meefi realmente necesita para la demo es un chatbot inteligente con tools para resolver dudas y problemas específicos de cuenta de sus usuarios**. Hoy operan con chatbot embebido en Intercom que responde FAQ básica + rutea a personas (Ashley cuentas, Emilio/Jaime bugs plataforma). El chatbot **escala casi todo** y resuelve muy poco por su cuenta. Ejemplos textuales del pain point:

- "no puedo cambiar mi contraseña" → link genérico sin diagnóstico
- "perdí el celular con 2FA" → escala sin recolectar evidencia
- "transferí y no aparece" → escala a Emilio/Jaime sin contexto
- "la página se buggea" → escala sin diagnóstico técnico

Meefi tiene su Help Center vivo en `meefi.io` (parte de Intercom). El chatbot actual de Intercom tiene contexto básico configurado y workflows de escalamiento, pero **no tiene tools** que operen sobre la cuenta del usuario.

La demo pivotea a mostrar **Nelia (Servicio al Cliente)** como el reemplazo/complemento al chatbot Intercom, con tools reales sobre fixture data y KB ingerida del Help Center.

## Objetivos de la demo

**Primario:** Que Gera (+ Alan CEO + Emilio CTO si asisten) salgan de la cita creyendo que Nelia puede aterrizar en su plataforma en 2-4 semanas y reducir escalamientos ~60-80%.

**Secundario:** Sembrar Niva compliance como wingman aprovechando que Head of Compliance está entrando al equipo Meefi.

**No objetivo:** Cerrar contrato en la cita. Cerrar es en la 2ª cita post-demo.

## Alcance in / out

**In:**
- Página `demo.centinelia.mx/meefi` (o path equivalente en apps/centinelia) que simula meefi.io logueado con widget flotante Nelia abajo-derecha.
- Provisioning de Nelia en org Meefi (hoy tiene solo Nara + Nalú + Niva — falta agregar el meerkat de soporte con rol `servicio_al_cliente`, email dedicado per regla [[feedback-email-uniqueness-per-agent]], y KB configurada).
- 7 tools mockeadas fixture-backed para Nelia (ver §4).
- Ingesta KB: Help Center meefi.io (público) + contexto Intercom actual + docs extras de Gera.
- 4 screenshots "Intercom mock" para contraste secuencial en el guion.
- Escalamiento humano vía correo real a aliases Gmail (`nazre20+ashley@`, `+emilio@`, `+jaime@`) con resumen ejecutivo estructurado.
- Slack mock composite (1 imagen) narrado como opción alterna.
- Niva compliance recortado: 1 escenario PLD de 5 min.
- Guion nuevo `13b-guion-detallado-15-sept-nelia.md` reemplaza al `13a`.
- Runbook nuevo `21-dry-run-runbook-nelia.md`.

**Out (post-15-sept):**
- Integración real APIs Meefi (Nazre pregunta a Gera pero no bloquea).
- Integración real Slack workspace Meefi.
- Nalú tesorera cartera master (guion 13a, blockers P1.1 Sheets + P1.2 ZIP KYB quedan en pausa; el ZIP se recicla parcial si Niva escenario lo consume).
- Nara onboarding (fuera para no diluir mensaje).

## Casos de uso Nelia (4 bloques)

Los 4 seleccionados en brainstorm cubren el pain completo de Gera. Cada bloque tiene:
- **Screenshot Intercom mock (3s)** — contraste secuencial per pregunta 7.
- **Turno(s) de Nelia** — tool call(s) + respuesta.
- **Outcome visible** — resolución en chat o escalamiento con correo/ticket.

### Bloque 1 — Resolución de cuenta (password + 2FA + passkey)
Usuario reporta "no puedo cambiar mi contraseña". Nelia diagnostica con `lookup_user_account`, detecta flag `password_reset_locked` (motivo: cuenta no verificada), guía al usuario a verificar correo, luego dispara `send_password_reset_link`. Contraste: Intercom hoy manda link genérico sin diagnóstico.

### Bloque 2 — Consulta transferencia no reflejada (HERO)
Usuario "transferí $50,000 hace 2 horas y no aparece". Nelia pide monto/fecha, llama `check_transfer_status`, obtiene estado `pendiente_rieles` con ETA + explicación. Segundo turno: usuario dice "es urgente, va con proveedor" → Nelia decide escalar → `escalate_to_human('transferencia_urgente','alta',<resumen>)` → correo real a `nazre20+emilio@`. Contraste: Intercom hoy escala inmediato sin contexto.

### Bloque 3 — Consulta KB Help Center
Usuario "¿cuánto tarda una SPEI a otro banco?". Nelia llama `search_help_center`, regresa top artículo con cita literal + link a `meefi.io/help/...`. Muestra que la KB es la suya real, no inventada.

### Bloque 4 — 2FA perdido + escalamiento inteligente
Usuario "perdí el celular con Authenticator". Nelia llama `initiate_2fa_recovery`, pide evidencia (INE frente/reverso, selfie, últimos 4 dígitos cuenta), captura las 3 imágenes vía upload al chat, arma ticket estructurado, llama `escalate_to_human('recovery_2fa','media',<contexto+evidencia>)` → correo a `nazre20+ashley@` con resumen ejecutivo + adjuntos. Mock Slack narrado al final: "esto lo podemos aterrizar también en tu canal #soporte-meefi, aquí mock de cómo se vería".

## Caso de uso Niva (recortado, 5 min)

Escenario compliance nuevo cliente: alta de empresa `Comercializadora Bajio S.A. de C.V.` (reciclado parcial del ZIP KYB `16-*`), Niva corre lista negra + PEP + análisis coherencia documentos + genera memo estructurado para Head of Compliance entrante. 1 solo turno con output vistoso. No hay contraste Intercom aquí — pivote directo desde bloque 4 con línea "y esto que aplica a soporte, aplica igual en compliance".

## Diseño técnico

### Arquitectura general

```
[demo.centinelia.mx/meefi]
   │
   ├─ shell simulado meefi.io (screenshot fondo)
   │
   └─ widget chat flotante (React, colores Meefi)
        │
        └─ POST /api/agent-chat  (existente)
             │  agent_id = <nelia meefi>
             │  scenario_hint = query param
             │
             └─ Nelia runtime existente
                  │
                  ├─ KB: knowledge_base org Meefi (ingerida)
                  ├─ Tools: 7 nuevas (fixture-backed)
                  └─ Escalate: SMTP + IMAP APPEND (existente)
```

### Página `/demo/meefi`

**Ubicación código:** `apps/centinelia/src/app/demo/meefi/page.tsx` (path pendiente confirmar en plan).

**Composición visual:**
- Fondo full-viewport: screenshot HD del dashboard meefi.io logueado. Fuente: Gera nos manda o Nazre lo construye a partir de screenshots públicos + inventando vista logueada creíble. Blur ligero para que no compita con el chat.
- Widget flotante abajo-derecha con:
  - Estado cerrado: burbuja circular con avatar Nelia (crop existente) + badge "Meefi Asistente" al hover.
  - Estado abierto: panel 380x600px, header "Nelia · Asistente Meefi · en línea", body con historial de mensajes, footer input + botones rápidos.
- Botones rápidos (shortcuts guion): `Cambiar contraseña` · `No veo mi transferencia` · `Perdí mi 2FA` · `Otra duda`.
- Sin nav de la web real — solo teatro visual.

**Query params:**
- `?scenario=1|2|3|4` precarga contexto de usuario (Beat 0) — evita capturar creds cada vez en dry runs.
- `?user=<email fixture>` opcional para overrides.

**Proxy:** `POST /api/demo/meefi/chat` que wrappea `agent-chat` existente inyectando `agent_id` correcto + `user_context` del fixture correspondiente al scenario. Rate limit razonable (per skill portal-security).

### KB Nelia — ingesta

**Dos capas separadas:**

**Capa pública (Help Center meefi.io):**
- 15-25 artículos scrapeados/exportados manualmente por Nazre.
- Formato: `# Título` + cuerpo markdown + metadatos `{source_url, last_updated}`.
- Ingesta a `knowledge_base` de la org Meefi vía script `scripts/meefi/ingest-help-center.ts` (nuevo).
- Query `search_help_center` regresa top-3 con snippet + link.

**Capa operativa (contexto Intercom + reglas Nelia):**
- Docs que mande Gera del chatbot Intercom actual (config, prompts, workflows).
- Reglas de decisión Nelia:
  - Cuándo escalar a Ashley (cuentas, docs, onboarding).
  - Cuándo escalar a Emilio o Jaime (bugs plataforma, transferencias, casos técnicos).
  - Cuándo NO escalar (info pública, password reset simple, consulta KB).
  - Cuándo pedir evidencia (2FA recovery, cambios sensibles).
  - Límites: qué NO puede afirmar Nelia sobre cuentas (montos exactos si no está seguro, tiempos SLA fuera de rango, promesas de reembolso).
- Guiones específicos (2FA recovery step-by-step, verificación identidad).
- Vive en `voice_agents.role_knowledge_base` de Nelia en org Meefi.

### Tools mockeadas (7)

Todas viven en `apps/centinelia/src/tools/meefi-demo/` (namespace nuevo). Todas fixture-backed. Todas registradas en los 3 canales (voice + chat + email) per feedback `tool_3_canales`, aunque para esta demo solo se usa chat.

**Pool cost:** Nelia corre en org Meefi que está en modo demo. Cada tool call consume del pool per reglas actuales (`batched-consume` donde aplique). Dado que los dry runs pueden consumir 50-100 tool calls antes del 15-sept, el plan es: (a) alto grant inicial en el ledger del pool de Meefi (equivalente a un plan Pro artificial), (b) los correos reales de escalamiento sí cuentan como costo externo real (Resend) per regla `pool-cost-based`, (c) `search_help_center` y lookups mockeados son side-effects locales → no cobran. Nazre revisa saldo pool Meefi antes de cada dry run.

1. **`lookup_user_account(email)`**
   - Fixture: 6-8 usuarios de ejemplo con flags variados.
   - Returns: `{user_id, email, name, status, flags: {password_reset_locked, has_2fa, passkey_registered, identity_verified, kyc_status}}`.

2. **`send_password_reset_link(user_id)`**
   - Mock: si flag `password_reset_locked=true` regresa `{ok: false, reason: 'account_not_verified', suggestion: 'verify_email_first'}`. Si false, `{ok: true, delivered_to: email}`.

3. **`check_transfer_status(reference_or_query)`**
   - Fixture: 4-5 transferencias con estados distintos.
   - Returns: `{transfer_id, amount, date, status: 'pendiente_rieles'|'rechazada'|'ya_conciliada', explanation, eta_or_next_action}`.

4. **`initiate_2fa_recovery(user_id)`**
   - Mock: crea `recovery_ticket_id`, returns checklist evidencia: `['ine_frente', 'ine_reverso', 'selfie_con_ine', 'ultimos_4_cuenta']`.

5. **`capture_bug_report(user_id, description, technical_context)`**
   - Mock: guarda diagnóstico estructurado, returns `{bug_ticket_id, assignee_hint: 'emilio'|'jaime'}`.

6. **`escalate_to_human(topic, priority, context_summary)`**
   - Real (no mockeado del todo): manda correo real vía SMTP a alias correspondiente per reglas de decisión (`topic` mapea a destinatario). Aliases: `nazre20+ashley@`, `nazre20+emilio@`, `nazre20+jaime@`, `nazre20+gera@`. IMAP APPEND al Sent per regla feedback.
   - Body correo: template estructurado (§ handoff abajo).
   - También guarda en `notification_events` con kind `demo_meefi_escalation` para historial.

7. **`search_help_center(query)`**
   - Query semántica sobre KB pública. Reutiliza infra existente `knowledge_base` search.
   - Returns: top-3 con `{title, snippet, source_url}`.

### Screenshots Intercom mock (4)

4 imágenes composite que se muestran 3s antes de cada bloque de Nelia:
- Bloque 1: chat Intercom respondiendo "aquí tienes el link de reset: [link genérico]" sin diagnosticar.
- Bloque 2: chat Intercom "voy a transferirte con Emilio, un momento" con delay.
- Bloque 3: chat Intercom "revisa nuestro Help Center: [link raíz]" sin apuntar al artículo.
- Bloque 4: chat Intercom "voy a transferirte con soporte, un momento".

Se generan con herramienta simple (Figma o HTML→PNG) reproduciendo look Intercom. Nazre las revisa. Se hostean en `public/demo/meefi/intercom-mock-{1,2,3,4}.png`.

### Handoff correo

**Template body (Nelia → alias):**
```
Asunto: [Meefi Soporte · {priority}] {topic} · {user_name}

--- Contexto usuario ---
Nombre: {user_name}
Correo: {user_email}
User ID: {user_id}
Estado cuenta: {status}
Flags relevantes: {flags_subset}

--- Conversación (últimos 5 turnos) ---
{transcript}

--- Hipótesis Nelia ---
{hypothesis}

--- Evidencia adjunta ---
{attachments_list}

--- Próxima acción sugerida ---
{next_action}

--- Metadata ---
Ticket ID: {ticket_id}
Prioridad: {priority}
Timestamp: {iso_ts}
```

Adjuntos: imágenes uploaded en el chat (INE, selfie) se anexan al correo real vía nodemailer attachments.

### Slack mock

1 imagen composite `public/demo/meefi/slack-mock.png` mostrando el mismo resumen ejecutivo posteado en canal `#soporte-meefi` con thread. Se enseña 5s al final de Bloque 4 con línea narrativa: "esto también lo podemos aterrizar en tu Slack — aquí un mock, en producción vive de verdad".

## Guion narrativo (45-50 min)

Ver `demos/meefi-gac/13b-guion-detallado-15-sept-nelia.md` (a escribir en plan de implementación). Estructura:

- **Apertura (5 min)** — saludo, contexto Gera+Alan+Emilio, dolor #1 soporte (referencia a lo que Gera dijo el 10-sept sobre Intercom).
- **Bloque 1 · Resolución cuenta (8 min)**
- **Bloque 2 · Transferencia no reflejada (10 min, HERO)**
- **Bloque 3 · Consulta KB (5 min)**
- **Bloque 4 · 2FA + escalamiento + Slack mock (10 min)**
- **Bloque Niva · Compliance PLD (5 min)** — pivote desde escalamiento.
- **Cierre (5 min)** — pricing, próximos pasos, quién queda owner operativo Meefi (Gera / Alan / Emilio o los 3).

Regla dura: si al martes 11-sept en la noche el chat no está contestando end-to-end sobre fixture con al menos bloques 1+2+3, el bloque 4 (2FA recovery) se corta y se convierte en narrativa. Bloque más caro, primero en descartarse.

## Runbook dry run

Nuevo archivo `demos/meefi-gac/21-dry-run-runbook-nelia.md`. Estructura hereda de `20-*` pero adaptada a los 5 bloques nuevos. Criterios pass/fail por bloque:

- **Bloque 1:** Nelia detecta correctamente flag `password_reset_locked` y guía verificación en ≤3 turnos.
- **Bloque 2:** Nelia identifica transferencia por referencia parcial (monto+fecha aprox) y da estado + explicación coherente. Escalamiento por urgencia genera correo real visible en Gmail en ≤10s.
- **Bloque 3:** Cita artículo real del Help Center con link funcional. No inventa.
- **Bloque 4:** Recolecta 3+ evidencias correctamente, correo escalado incluye adjuntos, mock Slack se ve al final.
- **Niva:** Memo compliance estructurado sin invento de campos.

Se corren 2-3 dry runs (viernes 12, sábado 13).

## Plan de días

| Día | Nazre | Claude |
|---|---|---|
| **Mié 10-sept (hoy)** | Escribe correo a Gera pidiendo: (a) screenshot dashboard meefi.io logueado o permiso para maquetarlo, (b) contexto/config actual chatbot Intercom, (c) docs KB extras si tiene, (d) confirmar nombres exactos y correos internos de Ashley/Emilio/Jaime, (e) preguntar sobre acceso APIs sandbox como plan B post-demo. Aliases Gmail creados (P1.3). | Sesión implementación: scaffolding tools + fixture data + endpoint proxy + esqueleto UI clon meefi. Ingesta Help Center meefi.io (público) arrancada. |
| **Jue 11-sept** | Revisar respuesta Gera. Si mandó contexto Intercom → pasarlo. Screenshot dashboard listo. | Terminar tools + UI clon + widget chat + KB operativa Nelia + template correo escalamiento. |
| **Vie 12-sept** | Dry run corrida #1 con nuevo guion + runbook. Reportar gaps. | Screenshots Intercom mock (4) + Slack mock composite + calibración Nelia según gaps del jueves. |
| **Sáb 13-sept** | Dry run corrida #2 calibrada. Grabar Loom fallback 5 bloques. | Fixes finales + polish Niva compliance recortado + audit checklist. |
| **Dom 14-sept** | Correo confirmación a Gera (hora, lugar, quién opera pantalla). | Buffer / polish. |
| **Lun 15-sept** | Cita 15-sept. | — |

## Riesgos y mitigaciones

- **R1 — Gera no manda contexto Intercom en 24-48h.** Mitigación: proceder con supuestos razonables + KB pública Help Center; agregar contexto cuando llegue.
- **R2 — UI clon meefi.io no queda creíble.** Mitigación: Nazre revisa jueves 11 tarde; si no cuadra, bajamos a Portal Centinelia estilo B (menos WOW pero funcional).
- **R3 — Tools fixture se rompen en dry run.** Mitigación: 2-3 corridas planeadas viernes+sábado, tiempo de calibración incluido.
- **R4 — 2FA recovery muy ambicioso para 5 días.** Mitigación explícita: regla dura martes 11-sept, se corta si no está andando.
- **R5 — Correo escalamiento no llega o tarda.** Mitigación: SMTP + IMAP APPEND ya probado en connector actual; usar la misma ruta.
- **R6 — Slack mock se ve falso.** Mitigación: pedir a Gera screenshot real de su canal en el correo (con datos borrados) para replicar layout con precisión.
- **R7 — Pool Meefi se agota en dry runs.** Mitigación: grant artificial alto al arranque + monitor de saldo pre-dry-run + fallback a mock silencioso si escalamiento por correo no responde.

## Métricas de éxito de la demo

- Gera pide en la cita una 2ª reunión concreta para ver piloto o firma.
- Al menos 1 de los 3 (Gera/Alan/Emilio) queda como owner operativo declarado.
- Se identifica al menos 1 caso real de sus usuarios que Nelia hubiera resuelto solo.
- No hay bloqueadores técnicos visibles en vivo (los 4 bloques corren limpio).

## Decisiones tomadas en brainstorm

1. **Scope**: soporte hero (~70%) + Niva compliance (~30%). Nalú y Nara fuera del 15-sept.
2. **Realismo**: KB real (Help Center + contexto Intercom + docs Gera) + acciones tools mockeadas fixture-backed. APIs Meefi reales quedan como plan B post-demo.
3. **UI**: clon simulado meefi.io con widget flotante abajo-derecha (opción A del brainstorm).
4. **Handoff**: correo real vía aliases Gmail + Slack mock composite narrado (opciones 1+3 del brainstorm).
5. **Contraste Intercom**: secuencial (3s screenshot antes de cada bloque), 4 mocks totales.
6. **Meerkat secundario**: solo Niva (compliance), fit con Head of Compliance entrando.

## Referencias

- Intel discovery Meefi: [[project-meefi-intel-discovery-2026-09-05]]
- Handoff kickoff: [[handoff-kickoff-meefi-gac-2026-09-08]]
- Provisioning: [[project-meefi-gac-demo-provisioning]]
- Reglas activas:
  - [[feedback-email-uniqueness-per-agent]] — 1 correo por meerkat
  - [[feedback-smtp-imap-append]] — SMTP requiere IMAP APPEND al Sent
  - [[feedback-tool-3-canales]] — todas las tools en voice+chat+email registries
  - [[feedback-batched-consume-multi-io]] — pool charge en escalamientos múltiples
  - [[feedback-no-ia-visible]] — copy no dice "IA" en UI usuario final
  - [[feedback-no-em-dash]], [[feedback-no-emojis]] — copy español limpio
