# Integraciones — per-agent vs org-level

**Fecha:** 2026-09-04
**Contexto:** Sesión donde se deprecó la integración Gmail org-level (Pneuma apuntaba a nazre20@gmail.com personal). Ver [[project_centinelia_org_level_email_deprecated]]. Al eliminarla, se descubrió que Google Calendar y Google Drive dependían del mismo OAuth de Gmail (scope acoplado), lo que forzaba el combo "conectas Gmail y te dan Cal + Drive gratis". Nazre planteó desacoplarlas para permitir mix (ej. Cal.com + OneDrive + per-agent Gmail).

Debate: ¿todas per-agent o mantener algunas org-level?

## Decisión

**División Grupo A (per-agent) / Grupo B (org-level) / Grupo C (no tocar hoy).**

### Grupo A — per-agent (recurso personal del empleado digital)

Cada meerkat tiene sus propias credenciales. La regla mental es "buzón de trabajo del empleado".

| Capability | Storage | Status |
|---|---|---|
| Email (Gmail/Outlook) | `email_integrations` (agent_id) | ✅ ya per-agent |
| Google Calendar | `integration_accounts` con `agent_id` + `capability='calendar_google'` | 🚧 Fase 1 |
| Outlook Calendar | `integration_accounts` con `agent_id` + `capability='calendar_microsoft'` | 🚧 Fase 1 |
| Google Drive | `integration_accounts` con `agent_id` + `capability='storage_google'` | 🚧 Fase 1 |
| OneDrive | `integration_accounts` con `agent_id` + `capability='storage_microsoft'` | 🚧 Fase 1 |
| WhatsApp | `voice_agents.transfer_whatsapp` | ✅ ya per-agent |
| Vapi phone | `voice_agents.vapi_agent_id` | ✅ ya per-agent |
| SMTP outbound | `voice_agents.features.smtp_config` | ✅ ya per-agent |

### Grupo B — org-level (recurso compartido de la empresa)

Datos compartidos entre meerkats, o entidad única de la empresa (RFC, catálogo). Todos los meerkats leen/escriben al mismo lugar.

| Capability | Racional |
|---|---|
| Notion (CRM/knowledge base) | Records de clientes/leads son company-wide; per-agent crearía silos y rompería el "sistema nervioso central" |
| Dropbox catálogo/archivos admin | Catálogo de productos es 1 por empresa; duplicarlo por meerkat = riesgo de inconsistencia |
| Facturación CFDI (Solución Factible, Facturama) | 1 RFC emisor + 1 CSD por empresa. Legalmente no puede haber "Nala factura desde otra cuenta" |
| Cal.com | Link público de reservación de la empresa (1 por org) |
| Calendly | Mismo argumento que Cal.com |

### Grupo C — no tocar en esta ronda

Requieren análisis dedicado. Estado actual se preserva hasta que amerite decisión formal por capability.

| Capability | Estado actual | Nota |
|---|---|---|
| MercadoLibre | Hidden 2026-08-19 (0 orgs activos) | Reactivar via pack `mercado_libre` cuando exista demanda |
| QuickBooks | Hidden 2026-08-28 (piloto AC nunca conectó) | Preservado en código para reactivación |
| Teams | Org-level actual | Bajo uso, sin caso operativo urgente |

## Regla para futuras integraciones

Al agregar una nueva capability, aplicar esta pregunta:

> **¿El recurso pertenece a un empleado individual o a la empresa como entidad legal?**

- **Empleado individual** → per-agent. Ejemplos: buzón de correo personal, calendario propio, drive de archivos que el empleado maneja
- **Empresa como entidad** → org-level. Ejemplos: CRM compartido, RFC/CSD para facturación, catálogo de productos, contabilidad

Casos ambiguos (ej. cuentas de redes sociales, plataformas ecommerce): default org-level, revisar si demanda per-agent aparece.

## Beneficios del split

1. **Cero ambigüedad de "cuál cuenta usa"** para recursos personales. Cuando el LLM lee "guarda en Drive", va inequívocamente al Drive del meerkat que ejecuta la tool
2. **Sin silos innecesarios** para datos company-wide (CRM, catálogo, facturación)
3. **Cada empleado responsable de sus propios permisos** — alineado con el paradigma "empleado digital tiene sus propias credenciales como empleado humano"
4. **Facilita rotación de rol** — si un meerkat cambia (ej. Ventas → Cobranza), sus cuentas viajan con él sin afectar CRM/facturación de la empresa

## Fase 1 — alcance esta sesión

1. Migration: `agent_id UUID NULL` en `integration_accounts` + índice único compuesto `(agent_id, provider, capability)` cuando `agent_id IS NOT NULL`
2. Refactor `gmail.ts` y `outlook.ts`: scope sets separados por capability + builders unificados con scope parametrizable
3. Rutas OAuth nuevas per-agent para calendar y storage (Google + Microsoft, 6 archivos)
4. UI en `/portal/[token]/configurar/[agentId]`: sección "Cuentas del empleado" con botones "Conectar Calendar" y "Conectar Drive/OneDrive" independientes del Gmail
5. `IntegrationsHub.tsx` (portal root): rows Calendar/Storage muestran solo Grupo B (Cal.com/Calendly/Dropbox), con banner "Google Calendar/Drive y Outlook Calendar/OneDrive se configuran por empleado en su ficha"

## Fase 2 — pendiente próxima sesión

- Actualizar tools (`list_calendar_events`, `create_calendar_event`, `buscar_archivo`, `leer_archivo`, `create_file`, etc.) para preferir token per-capability sobre el token de Gmail
- Fallback: si no hay token per-capability pero sí Gmail per-agent con scope amplio, seguir usando ese (backward compat suave)
- Documentar en `agent-tools.md` cómo cada tool resuelve el token

## Riesgos y mitigación

- **Piloto Tortillería / AC Proyectos usan actualmente Dropbox y facturación org-level** → NO tocamos Grupo B, no hay riesgo de romper esos pilotos
- **Confusión de meerkats sobre cuál cuenta usar** → resolver con prompt engineering en Fase 2 (los tools tienen que ser explícitos sobre "tu Drive personal")
- **Onboarding más largo** → cada meerkat necesita OAuth propio para Cal/Storage si aplica. Documentar checklist de setup por rol
