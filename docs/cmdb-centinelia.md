# CMDB — Centinelia

> Configuration Management Database. Inventario de todos los componentes del sistema, sus configuraciones y relaciones.

---

## 1. Plataforma

| Campo | Valor |
|---|---|
| Nombre | Centinelia |
| Tipo | SaaS — Empleados digitales de voz e IA |
| Framework | Next.js 15 (App Router) |
| Lenguaje | TypeScript |
| Deployment | Vercel |
| Repo | github.com/Pneuma-Studio/CentinelIA |
| Dominio | centinelia.mx |

---

## 2. Servicios Externos

### 2.1 VAPI — Orquestador de Voz
| Campo | Valor |
|---|---|
| Rol | Gestiona la sesión de voz: conecta llamante ↔ IA ↔ tools |
| Integración | `src/lib/vapi/sync.ts`, `auth.ts`, `control.ts`, `outbound.ts`, `provision.ts` |
| Endpoints usados | `PATCH /assistant/:id`, `POST /assistant`, `GET /phone-number`, `POST /call` |
| Env var | `VAPI_API_KEY`, `VAPI_SERVER_SECRET` |
| Trigger inbound | `POST /api/voice/inbound` |
| Trigger webhook | `POST /api/voice/webhook` |
| Capacidades activas | `backchannelingEnabled`, `backgroundDenoisingEnabled`, `backgroundSound: office` |

### 2.2 Supabase — Base de Datos
| Campo | Valor |
|---|---|
| Rol | Base de datos principal + autenticación de portal |
| Cliente | `src/lib/supabase/admin.ts` (service role) |
| Env vars | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Tablas | 60+ (ver sección 5) |
| RPCs usadas | `increment_account_minutes_used()`, `increment_minutes_used()` |

### 2.3 Anthropic Claude — Motor IA
| Campo | Valor |
|---|---|
| Rol | LLM principal para todos los agentes y procesamiento post-llamada |
| Modelos usados | claude-haiku-4-5 (voz, tools), claude-sonnet-4-6 (evaluaciones, aprendizaje) |
| Env var | `ANTHROPIC_API_KEY` |
| Usos | Respuestas en llamada, CES eval, self-eval, extract learnings, team feed, delegación |

### 2.4 ElevenLabs — Text-to-Speech
| Campo | Valor |
|---|---|
| Rol | Síntesis de voz (TTS) para los empleados |
| Integración | Configurado en VAPI por `voice_id` por agente |
| Cada empleado tiene | `voiceId` único en `meerkat-roles.ts` |

### 2.5 Deepgram — Speech-to-Text
| Campo | Valor |
|---|---|
| Rol | Transcripción de voz (STT) |
| Modelo | nova-2 |
| Idioma default | es (español) |
| Idioma multilingual | multi |
| Endpointing | 300ms |
| Smart format | true |
| Integración | Configurado en VAPI vía `/inbound` |

### 2.6 Stripe — Facturación
| Campo | Valor |
|---|---|
| Rol | Cobro de planes y paquetes de minutos |
| Integración | `src/lib/stripe.ts`, `src/lib/billing/plans.ts` |
| Env vars | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Flujos | Checkout session, Customer Portal, Webhook de pago |

### 2.7 Twilio — Números de Teléfono
| Campo | Valor |
|---|---|
| Rol | Proveedor de números telefónicos asignados a cada agente |
| Estado | Configurado (deprecated directamente, ruteado vía VAPI) |
| Integración | `src/lib/twilio/configure-webhook.ts` |

### 2.8 Gmail / Google Workspace
| Campo | Valor |
|---|---|
| Rol | Email sync, envío de correos, acceso a Google Drive |
| OAuth | `src/lib/connectors/google.ts` |
| Tabla | `email_integrations` (provider: google) |
| Scopes | Gmail read/send, Drive read/write |

### 2.9 Outlook / Microsoft 365
| Campo | Valor |
|---|---|
| Rol | Email sync, envío de correos, acceso a OneDrive |
| OAuth | `src/lib/connectors/microsoft.ts` |
| Tabla | `email_integrations` (provider: microsoft) |

### 2.10 Notion
| Campo | Valor |
|---|---|
| Rol | CRM externo — registro de llamadas y datos de clientes |
| Integración | `src/lib/notion/client.ts` |
| Campo en DB | `voice_agents.notion_access_token`, `notion_db_schemas` |
| Trigger | Post-llamada (webhook, paso L) |

### 2.11 WhatsApp
| Campo | Valor |
|---|---|
| Rol | Notificaciones al dueño, follow-up a llamantes, escalación |
| Integración | `src/lib/whatsapp/send.ts` |
| Usos | Resumen de llamada, alerta de minutos, review request, escalación |

### 2.12 Cal.com
| Campo | Valor |
|---|---|
| Rol | Agenda externa — verificar disponibilidad y agendar citas |
| Herramientas | `consultar-disponibilidad`, `agendar-cita-externa` |
| Campo en DB | `voice_agents.calendar_url` |

### 2.13 Brave Search
| Campo | Valor |
|---|---|
| Rol | Búsqueda web para investigación (leads, competidores, mercado, etc.) |
| Integración | `src/lib/search/web.ts` |
| Env var | `BRAVE_SEARCH_API_KEY` |
| Herramienta | `buscar_en_web` (portal + voz) |

### 2.14 MercadoLibre
| Campo | Valor |
|---|---|
| Rol | Sincronización de pedidos del marketplace |
| OAuth | `src/lib/mercadolibre/auth.ts`, `connector.ts` |
| Tabla | `integration_accounts` (provider: mercadolibre) |

---

## 3. Empleados (Meerkats)

| ID | Nombre | Rol | Herramientas activas | Modelo IA | Voice ID |
|---|---|---|---|---|---|
| nia | Nia | Recepción | crear_lead, agendar_cita, buscar_cliente, notificar_transferencia | Haiku | jUxkp8eMgszgJX3XU2pV |
| noah | Noah | Ventas | crear_lead, agendar_cita, registrar_pedido, llamar_a | Haiku | (configurable) |
| nara | Nara | Coordinación | buscar_cliente, enviar_correo, crear_documento, delegar_tarea | Haiku | (configurable) |
| neo | Neo | Tecnología | crear_ticket, consultar_incidentes, reportar_falla | Haiku | (configurable) |
| naia | Naia | Recursos Humanos | agendar_cita, buscar_cliente, enviar_correo | Haiku | (configurable) |
| nico | Nico | Recuperación | buscar_cliente, llamar_a, enviar_whatsapp_escalacion | Haiku | (configurable) |
| nelia | Nelia | Atención al Cliente | buscar_cliente, registrar_encuesta, enviar_whatsapp_escalacion | Haiku | (configurable) |
| nova | Nova | Despacho | crear_lead, notificar_transferencia, delegar_tarea | Haiku | (configurable) |
| nox | Nox | Director | delegar_tarea (→ todos los demás) | Sonnet | (configurable) |
| niva | Niva | Directora | delegar_tarea (→ todos los demás) | Sonnet | (configurable) |
| custom | Personalizado | Definido por cliente | Configuración manual | Haiku | (configurable) |

### Capacidades por feature

> Nox y Niva no tienen features de voz — operan como coordinadores de oficina, no atienden llamadas directamente.

| Feature | Empleados que lo tienen |
|---|---|
| receptionist | Nia, Noah, Nara, Neo, Naia, Nico, Nelia, Nova, Personalizado |
| lead_qualification | Nia, Noah |
| appointment_booking | Nia, Naia |
| existing_client_support | Nara, Neo, Naia, Nico, Nelia |
| smart_transfer | Nia, Noah, Nara, Neo, Naia, Nico, Nelia, Nova |
| order_taking | Noah |
| outbound_calls | Noah, Nico, Nelia |
| helpdesk | Neo |
| is_coordinator | Nox, Niva (y cualquier empleado con el flag activado) |
| multilingual | Configurable por agente |

> **Nota:** Todos los empleados tienen `receptionist: true` porque si son el único del equipo deben poder recibir llamadas. El Personalizado arranca solo con recepción; el resto de features se configuran manualmente.

---

## 4. Herramientas de Voz (25)

| Herramienta | Función | Requiere feature |
|---|---|---|
| crear_lead | Registra prospecto en leads_voice | lead_qualification |
| agendar_cita | Agenda / modifica / cancela cita | appointment_booking |
| agendar_cita_externa | Agenda en Cal.com | appointment_booking + calendar_url |
| consultar_disponibilidad | Verifica slots en Cal.com | appointment_booking + calendar_url |
| buscar_cliente | Busca cliente por nombre/teléfono | existing_client_support |
| registrar_pedido | Registra orden | order_taking |
| notificar_transferencia | Avisa al equipo antes de transferir | smart_transfer |
| enviar_whatsapp_escalacion | Escala a WhatsApp | whatsapp_escalation |
| llamar_a | Dispara llamada saliente | outbound_calls |
| enviar_correo | Envía email (con adjuntos Drive/OneDrive) | siempre disponible |
| crear_documento | Genera PDF profesional | siempre disponible |
| buscar_archivo | Busca en Drive / OneDrive | siempre disponible |
| consultar_reporte | Recupera reportes | siempre disponible |
| crear_reporte | Genera reporte cívico/operativo | vertical: gobierno |
| crear_ticket | Abre ticket de helpdesk | helpdesk |
| consultar_incidentes | Consulta incidentes activos | helpdesk |
| buscar_directorio | Busca en directorio de contactos | siempre disponible |
| reportar_falla | Reporta falla del sistema | siempre disponible |
| registrar_documento | Registra documento en la operación | siempre disponible |
| verificar_documentos | Verifica estado de documentos | siempre disponible |
| registrar_encuesta | Captura respuestas de encuesta | surveys activos |
| generar_acta_sesion | Genera acta de cabildo | vertical: gobierno |
| generar_punto_acuerdo | Registra acuerdo de sesión | vertical: gobierno |
| consultar_agente | Consulta a cualquier compañero del equipo (IA) | peers activos — cualquier empleado |
| delegar_tarea | Delega tarea a cualquier compañero (loop agéntico) | peers activos — cualquier empleado |

---

## 5. Base de Datos Supabase

### 5.1 Core de Agentes
| Tabla | Descripción |
|---|---|
| `voice_agents` | Configuración completa de cada empleado: business_name, phone_number, vapi_agent_id, features, knowledge_base, first_message, portal_email, portal_token |
| `voice_calls` | Registro de cada llamada: transcript, summary, outcome, duration_seconds, ces_data, self_eval_data, structured (JSON con lead fields) |
| `account_minutes` | Minutos por cuenta: portal_email, minutes_used, minutes_included, minutes_reset_date |
| `minutes_ledger` | Historial de transacciones de minutos |

### 5.2 Leads y Contactos
| Tabla | Descripción |
|---|---|
| `leads_voice` | Prospectos capturados en llamadas: nombre, negocio, servicio, presupuesto, whatsapp, email |
| `customers` | Perfil consolidado de cliente: portal_email, telefono, historial |
| `customer_interactions` | Log de interacciones por cliente |
| `outbound_contacts` | Cola de llamadas salientes cross-agent |
| `outbound_campaigns` | Campañas de llamadas salientes |
| `outbound_calls` | Registro de llamadas salientes |

### 5.3 Citas y Pedidos
| Tabla | Descripción |
|---|---|
| `appointments_voice` | Citas agendadas: agent_id, fecha, hora, status, nombre_cliente |
| `orders_voice` | Pedidos tomados en llamadas |

### 5.4 IA y Aprendizaje
| Tabla | Descripción |
|---|---|
| `conversational_learnings` | Reglas generadas por CES: body, dimension, target_document (cce/hcp/mdp), status (pending/active/rejected) |
| `agent_learnings` | Aprendizajes extraídos de transcripts por agente |
| `agent_tasks` | Tareas delegadas por directores: status (in_progress/completed/failed), resultado |
| `agent_goals` | Metas de desempeño por agente: métrica, target, período |
| `agent_monthly_stats` | Métricas agregadas mensuales |
| `initiative_logs` | Patrones recurrentes detectados por el sistema |

### 5.5 Operaciones
| Tabla | Descripción |
|---|---|
| `helpdesk_tickets` | Tickets de soporte IT (folio-based) |
| `it_incidents` | Incidentes de sistema |
| `ops_inbox` | Bandeja de operaciones |
| `ops_documents` | Documentos operativos |
| `ops_contracts` | Contratos gestionados |
| `ops_meetings` | Minutas de reuniones |
| `ops_reports` | Reportes generados |
| `ops_report_runs` | Historial de ejecución de reportes |

### 5.6 Gobierno / Cívico
| Tabla | Descripción |
|---|---|
| `civic_reports` | Reportes ciudadanos con folio |
| `cabildo_documents` | Documentos de sesiones de cabildo |

### 5.7 Configuración y Cuenta
| Tabla | Descripción |
|---|---|
| `organizations` | Cuenta maestra: portal_email, account_status, kyc_data |
| `portal_users` | Sub-usuarios del portal |
| `logos` | Logos subidos por cuenta |
| `integration_accounts` | Credenciales de integraciones terceras |
| `notion_db_schemas` | Esquemas de bases de datos de Notion |
| `platform_settings` | Configuración global de la plataforma |

### 5.8 Email e Integraciones
| Tabla | Descripción |
|---|---|
| `email_integrations` | OAuth tokens de Gmail / Outlook por cuenta |
| `surveys` | Encuestas activas |
| `survey_questions` | Preguntas por encuesta |
| `survey_responses` | Respuestas capturadas en llamadas |

### 5.9 WhatsApp
| Tabla | Descripción |
|---|---|
| `whatsapp_agents` | Configuración de cuentas WhatsApp Business |
| `wa_conversations` | Hilos de conversación |
| `wa_leads` | Leads de WhatsApp |
| `wa_appointments` | Citas agendadas por WhatsApp |
| `wa_broadcasts` | Campañas de difusión |
| `wa_broadcast_recipients` | Destinatarios de campañas |

### 5.10 Auditoría y Seguridad
| Tabla | Descripción |
|---|---|
| `kyc_access_log` | Accesos a datos KYC |
| `policy_audit_log` | Cumplimiento de políticas |
| `ai_ops_log` | Auditoría de operaciones IA |
| `portal_read_receipts` | Tracking de lectura de emails |

---

## 6. Módulos de Código (`/src/lib/`)

| Módulo | Ruta | Responsabilidad |
|---|---|---|
| Prompt Builder | `voice/prompt-builder.ts` | Construye el system prompt de cada agente (AUP + identidad + features + HCP + CCE + VOICE_RULES) |
| HCP | `voice/rules.ts → HCP` | 97 patrones de conversación humana real |
| CCE | `voice/rules.ts → CCE` | Motor conversacional Centinelia |
| VOICE_RULES | `voice/rules.ts → VOICE_RULES` | Reglas técnicas de voz |
| VAPI Sync | `vapi/sync.ts` | Sincroniza estado del agente con VAPI (buildVapiAssistant + PATCH) |
| CES Eval | `ai/ces-eval.ts` | Evalúa 6 dimensiones conversacionales post-llamada |
| Self Eval | `ai/self-eval.ts` | Autoevaluación del agente contra DOD y guardrails |
| Extract Learnings | `ai/extract-learnings.ts` | Extrae aprendizajes T2 de transcripts ≥120s |
| Team Message | `ai/generate-team-message.ts` | Genera mensaje de feed para el equipo |
| Iniciativa | `initiative/detector.ts` | Detecta patrones recurrentes en operaciones |
| Account Guard | `compliance/account-guard.ts` | Verifica estado de cuenta (suspended/terminated) |
| Auto Refill | `billing/auto-refill.ts` | Recarga automática de minutos |
| Nox Coordinator | `ops/nox-coordinator.ts` | Lógica de coordinación del director Nox |
| Policy Engine | `policies/engine.ts` | Motor de políticas y cumplimiento |
| Meerkat Roles | `portal/meerkat-roles.ts` | Definiciones de los 11 empleados |
| Portal Auth | `portal/auth.ts` | Autenticación de sesiones de portal |
| Business Hours | `voice/business-hours.ts` | Validación de horario de atención |
| Connector Tools | `services/connector-tools.ts` | Herramientas de conectores (Drive, email) |

---

## 7. Rutas API

### Voz
| Ruta | Método | Función |
|---|---|---|
| `/api/voice/inbound` | POST | Recibe llamada de VAPI, devuelve config del asistente |
| `/api/voice/webhook` | POST | Procesa eventos post-llamada de VAPI |
| `/api/voice/tools/*` | POST | 25 herramientas ejecutables durante la llamada |

### Portal (`/api/portal/[token]/`)
| Categoría | Rutas destacadas |
|---|---|
| Agentes | `/agentes`, `/settings`, `/voice`, `/resync` |
| Llamadas | `/actividad`, `/leads`, `/appointments`, `/orders` |
| Operaciones | `/helpdesk`, `/incidents`, `/ops-inbox`, `/ops-documents`, `/ops-contracts` |
| IA | `/learnings`, `/generate-kb`, `/goals`, `/ranking`, `/historical-synthesis` |
| Integraciones | `/integrations`, `/email-oauth`, `/ml-oauth`, `/notion` |
| Facturación | `/buy-minutes`, `/auto-refill`, `/change-plan` |
| Equipo | `/users`, `/teams`, `/team-numbers`, `/team-feed` |
| Documentos | `/pdf/*`, `/contract-drafts`, `/ops-reports` |
| Cívico | `/civic-reports`, `/cabildo`, `/surveys` |

### Admin (`/api/admin/`)
| Ruta | Función |
|---|---|
| `/agentes`, `/agentes/[id]` | Gestión de todos los agentes |
| `/accounts/[email]` | Gestión de cuentas |
| `/accounts/[email]/enforce` | Suspensión / reactivación |
| `/analytics` | Dashboard de métricas de plataforma |
| `/demo/apply-instructions` | Actualiza instrucciones del demo (Nia) |
| `/conversacional` | Gestión de conversational_learnings |
| `/sync-voices` | Sincroniza voces desde ElevenLabs |

---

## 8. Pipeline de Aprendizaje

```
Llamada terminada (≥30s, outcome != unanswered)
    │
    ├─► CES Eval (Claude Sonnet)
    │       6 dimensiones: fluidez, comprensión, naturalidad,
    │       conducción, confianza, resolución
    │       Si score ≤ 2 → genera regla condicional
    │       target_document: cce | hcp | mdp
    │       → conversational_learnings (status: pending)
    │
    ├─► Self-Eval (si tiene DOD/guardrails)
    │       → voice_calls.self_eval_data
    │
    └─► Extract Learnings (≥2min, con portal_email)
            Aprendizajes T2 del transcript
            → agent_learnings
            → agent_messages (team feed)

Cron semanal:
    conversational_learnings (pending)
        → Claude evalúa calidad (0.0 - 1.0)
        → ≥ 0.85: auto-aprobado → status: active
        → < 0.85: revisión manual
        → Activas se inyectan en system prompt de todos los agentes
```

---

## 9. Flujo de Facturación

```
Cliente contrata plan
    → Stripe Checkout Session
    → Webhook de pago exitoso
    → Provisiona voice_agent en VAPI
    → Registra en account_minutes (portal_email)

Durante operación:
    Por cada llamada → increment_account_minutes_used()
    Si used ≥ included → pausa automática de todos los agentes
    Si configured auto-refill → compra minutos adicionales vía Stripe

Portal:
    /buy-minutes → Stripe Checkout
    /auto-refill → configura umbral y cantidad
    /change-plan → Stripe Customer Portal
```

---

## 10. Variables de Entorno Críticas

| Variable | Servicio | Uso |
|---|---|---|
| `VAPI_API_KEY` | VAPI | Autenticación para sync y control de asistentes |
| `VAPI_SERVER_SECRET` | VAPI | Valida webhooks entrantes |
| `ANTHROPIC_API_KEY` | Claude | Todas las llamadas IA |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | URL de la base de datos |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Acceso admin a DB |
| `STRIPE_SECRET_KEY` | Stripe | Facturación |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Valida webhooks de pago |
| `BRAVE_SEARCH_API_KEY` | Brave | Búsqueda web |
| `DEMO_AGENT_ID` | Interno | ID del agente demo (Nia) en voice_agents |
| `NEXT_PUBLIC_APP_URL` | Interno | URL base para webhooks y links |
| `NOX_MONTHLY_CONFIG` | Nox | Configuración mensual del coordinador |
