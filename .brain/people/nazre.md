---
name: nazre
description: Fundador y owner único de Centinelia. Todas las aprobaciones de plataforma, arquitectura, y credenciales vienen de él.
type: person
owner: self
last_verified: 2026-08-26
---

# Nazre - Owner de Centinelia

**Nombre completo:** Nazre Hassam Miguel Assad Morales
**Correo:** nazre20@gmail.com
**Ubicación:** Monterrey, Nuevo León, México
**Cargo:** Fundador
**Firma en documentos formales:** "Nazre Hassam Miguel Assad Morales, Fundador"

## Contexto

Nazre es fundador de **Centinelia** (SaaS de empleados digitales para PYMEs mexicanas) y de **Pneuma Studio** (agencia MTY). Trabaja solo en Centinelia hoy. Sergio (ex-practicante) ya no está en el equipo.

## Approval boundaries

Todo lo siguiente requiere aprobación explícita de Nazre en cada instancia:

### Acceso / credenciales
Supabase, Vapi, Vercel, Stripe, GitHub, Cloudflare, dominios, cuentas de CONTPAQi, Solución Factible, QuickBooks, etc. **Ninguna otra persona ni agente puede tomar estas decisiones.**

### Cambios que afectan orgs de clientes en producción
- Activar/desactivar `features.*` per-org.
- Cambiar `account_status`.
- Tocar `voice_agents.tool_overrides` en clientes activos.
- Enviar mensajes / correos en nombre de un meerkat a clientes reales.

### Decisiones de producto
- Agregar nuevos meerkats (roles nuevos).
- Cambios de pricing.
- Nuevas integraciones (adapters).
- Cambios que rompen contrato con clientes existentes.

### Datos legales / fiscales
- Nombre legal completo, CURP, RFC, datos bancarios.
- **Regla dura**: nunca inventar apellidos, nombres legales, ni datos fiscales. Si un documento formal los necesita y no están en el brain o auto-memory → PREGUNTAR. (Error histórico: propuesta AC Proyectos 2026-08-18 donde el asistente inventó "Nazre Álvarez Villafañe".)

## Delegaciones estándar (no requieren aprobación explícita cada vez)

- Ediciones a código en `src/` cuando el objetivo está claro en la sesión.
- Cambios a docs, tests, y specs.
- Correr scripts read-only (queries, monitores, health-checks).
- Crear branches, commits, y PRs (pero no merge a main).
- Editar el propio brain via PR (Nazre revisa antes de merge).

## Cuándo preguntar aunque parezca dentro de delegación

- Cuando encuentres estado inesperado (archivos, branches, migraciones que no reconoces) → **investigar antes de tocar**, no borrar.
- Cuando una acción sea destructiva y no reversible (rm de archivos con work, force push, drop table).
- Cuando descubras que la corrección requiere tocar múltiples subsistemas - mejor confirmar scope antes.

## Preferencias de colaboración

- Respuestas cortas y directas.
- Sin "IA" en copy visible al usuario.
- **Sin em-dashes (U+2014) en NADA**: copy al usuario, docs internos, specs, comentarios de código, mensajes de commit, mensajes de PR. Usa dos puntos, coma, punto y aparte, o guion normal según corresponda. Regla ratificada 2026-08-26.
- Sin emojis en UI (skills, componentes, correos).
- Auto mode preferido cuando el plan está claro - no pedir confirmación intermedia si ya se aprobó el approach.
