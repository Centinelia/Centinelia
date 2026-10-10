---
name: billing-bypass-from-claude-code
description: Operaciones iniciadas desde Claude Code (cualquier sesión Nazre+Claude) NUNCA cobran a la org por default. Opt-in explícito solo cuando Nazre dice "esto sí cóbralo".
type: policy
owner: nazre
last_verified: 2026-10-10
---

# Policy — Claude Code opera gratis contra las orgs

## La regla

**Toda operación disparada desde una sesión Claude Code (cualquier Claude Code, cualquier sesión) debe ejecutarse sin cobrar a la organización afectada.** Si Nazre pide "corre este cron", "haz un curl al endpoint X", "chequea el inbox de Nami", "procesa manualmente este correo", "corre este smoke test contra prod", lo que sea desde esta terminal: la acción se ejecuta normal, pero la org **no pierde ni una tarea ni un minuto**.

Opt-in explícito: solo cobra cuando Nazre diga textualmente "esto sí cóbralo" / "esto es cobro real" / equivalente inequívoco. Default = NO cobrar.

Aplica a:
- Cualquier empleado de cualquier org (Nami, Nelia, Nia, Nox, Noa, Nova, y futuros).
- Cualquier canal (voz, chat, correo, tool calls, agent tasks, crons manualmente disparados).
- Cualquier sesión Claude Code presente y futura.

## Why

Lo que motiva esta policy (2026-10-10):

- **AC Proyectos**: Camila venía operando Nami con pool vacío post-Fase 1 esperando pago Mes 2. Durante 24h el inbox-processor + smoke tests + mis chequeos manuales empujaron el balance a -4 ops. El drift detector de pool provisioning disparó alerta real. Si Nazre hubiera sabido que yo le estaba quemando pool a cada curl, me pide inmediatamente parar.
- **Smoke tests contra prod**: la suite E2E hace +1/-1 pairs que netean 0, pero cada round gatilla la lógica de cobro y puede dejar restos cuando falla una revert.
- **Error humano**: si Nazre me pide "haz esta prueba" y yo hago fetch que accidentalmente cobra, el cliente paga por nuestro desarrollo. Inaceptable.
- **Principio comercial**: nunca cobrar al cliente por trabajo interno de Centinelia. El trabajo de debugging/testing/validación es nuestro costo, no suyo.

## How to apply

### Para el agente Claude Code (yo, en cualquier sesión)

1. **Cuando llame a `consumeAiOp` directamente** (en un script o función server-side): pasar `meta.bypassCharge: true` siempre, salvo instrucción explícita en contrario de Nazre en el mensaje actual.

2. **Cuando haga `fetch` a endpoints prod de Centinelia** (`www.centinelia.mx/api/...`): incluir el header `x-centinelia-claude-code-bypass: ${CRON_SECRET}`. El middleware server-side detecta el header y propaga el bypass a `consumeAiOp` via AsyncLocalStorage (ver sección "Infraestructura" abajo).

3. **Cuando corra crons manualmente** (`curl` con `Authorization: Bearer $CRON_SECRET`): es siempre bypass. El cron secret funciona también como marcador de admin.

4. **Cuando ejecute scripts helper del repo** (`scripts/*.ts`, `_smoke/*.mjs`): esos scripts deben usar helpers que injecten `bypassCharge: true` por default. Si un script no lo hace, es bug.

5. **Si tengo duda** si una acción cobraría: no la ejecutes contra prod. Pregunta a Nazre primero.

### Para endpoints server-side

- `consumeAiOp` honra 3 señales de bypass (prioridad en orden):
  1. `meta.bypassCharge: true` — per-call, lo setea el caller.
  2. `organizations.billing_paused_at IS NOT NULL` — per-org, pausa global (ej. pre-pago).
  3. **(pendiente follow-up)** AsyncLocalStorage context seteado por middleware cuando llega header `x-centinelia-claude-code-bypass` válido.

- En cualquier bypass: log a `ai_ops_log` con `count=0` + `context={bypass: '<razón>', intended_count: N}` para audit. **NO** se decrementa el pool, **NO** se gatilla el drift detector de collisions ni el de pool provisioning.

- Return value del bypass: `{ ok: true, used: 0, limit: 0 }` — downstream nunca bloquea.

### Para humanos operando desde admin dashboard

El admin dashboard (futuro trabajo UI) debe mostrar explícitamente cuando una org tiene `billing_paused_at` activo y permitir pausar/reanudar con un toggle. Nazre debe poder ver en un vistazo qué orgs están en modo gratis y por qué.

## Opt-in explícito — qué cuenta como "esto sí cóbralo"

Frases de Nazre que activan cobro normal (desactivan bypass):
- "esto sí cóbralo" / "esto es cobro real"
- "simula el cobro completo"
- "necesito que corra el flujo real incluyendo el charge"
- "quiero validar que cobre bien"

Fuera de esas frases explícitas: default = bypass.

## Precedentes técnicos

- Migración `20261010010000_add_organizations_billing_paused_at.sql` agrega la columna.
- Patch en `src/lib/ai/ops-guard.ts` lee tanto el flag per-org como `meta.bypassCharge`.
- Tests en `src/lib/ai/__tests__/ops-guard.test.ts` (describe "bypass path").
- Memoria global: `feedback_billing_bypass_from_claude_code.md`.

## Follow-up pendiente (no en este PR)

- Middleware HTTP que detecte header `x-centinelia-claude-code-bypass` + AsyncLocalStorage para propagar bypass a través de todas las layers (crítico para que `fetch` desde Claude Code auto-bypassee sin que cada endpoint tenga que threadear el flag manualmente).
- Admin UI para toggle de `billing_paused_at` con historial.
