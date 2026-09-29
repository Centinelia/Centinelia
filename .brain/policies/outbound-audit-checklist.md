---
name: outbound-audit-checklist
description: Cómo auditar correctamente el flow de llamadas outbound de un meerkat. Reglas duras extraídas del bug audit 2026-09-29 Nelia Tortillería donde diagnostiqué mal 22 attempts como inbound cuando eran outbound mal registrados.
type: policy
owner: nazre
last_verified: 2026-09-29
---

# Policy — Auditar outbound de un meerkat

Aplica cuando: alguien pregunta "¿cuántas llamadas hizo X?", "¿por qué no está llamando?", "¿se cobró correctamente?", o cualquier auditoría de billing/actividad de un meerkat con outbound habilitado.

## Los 6 pasos obligatorios

### 1. Dump `features` del agente ANTES de cualquier conclusión

```ts
const { data: agent } = await supabase.from('voice_agents')
  .select('id, agent_name, features, vapi_agent_id, active')
  .eq('id', AGENT_ID).single();
```

Verifica:
- `features.outbound_calls` — si es `false`, el meerkat NO puede hacer outbound. Cualquier "call" atribuido a él es inbound o error.
- `features.client_memory` — si es `false`, NO puede reconocer callers en inbound. Cualquier análisis que asuma memoria de cliente es incorrecto.
- `active` — si es `false`, no procesa nada.
- `vapi_agent_id` — sin esto no puede llamar (inbound ni outbound).

### 2. Vapi API es fuente de verdad para direction

`voice_calls` NO tiene columna `direction` o `call_type`. Consulta Vapi:

```ts
const res = await fetch(`https://api.vapi.ai/call?assistantId=${agent.vapi_agent_id}&limit=100`, {
  headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
});
const calls = await res.json();
const byType = { inbound: 0, outbound: 0 };
for (const c of calls) byType[c.type === 'outboundPhoneCall' ? 'outbound' : 'inbound']++;
```

Si Vapi dice outbound N, la DB debe reflejar N en `outbound_calls`. Si están en `voice_calls`, es el bug 2026-09-29 reincidiendo.

### 3. Match voice_calls ↔ minutes_ledger por vapi_call_id

Todo call con `outcome !== 'unanswered'` y `duration_seconds >= 3` debe tener una entry en `minutes_ledger` con `reference_id === vapi_call_id`:

```ts
const ledgerRefs = new Set(
  ledger.filter(r => r.reference_id).map(r => r.reference_id)
);
const uncharged = calls.filter(c =>
  c.vapi_call_id && !ledgerRefs.has(c.vapi_call_id) && c.outcome !== 'unanswered'
);
if (uncharged.length > 0) console.error('🚩 GAP DE COBRO', uncharged.length);
```

### 4. Match verification_attempts con voice_calls con ventana estrecha

Ventana temporal máxima: `+30s` sobre `duration_seconds`. NUNCA `+/- 10 min` u otras ventanas anchas — dan falsos positivos.

```ts
const container = calls.find(c => {
  const start = new Date(c.created_at).getTime();
  const end   = start + (c.duration_seconds * 1000);
  return attemptMs >= start - 2000 && attemptMs <= end + 30_000;
});
```

Si un `verification_attempt` NO matchea a ninguna voice_call de ese agent → la llamada probablemente pasó por Vapi pero no se registró en nuestra DB (bug 2026-09-29). Verificar Vapi API con el timestamp.

### 5. Match outbound_contacts ↔ outbound_calls

Todo outbound_contact que fue procesado debe tener un `outbound_calls` row con `contact_id`. Si un contact tiene `status='calling'` y NO tiene outbound_call → drift; el detector [`stuck-outbound`](../../../src/lib/monitoring/stuck-outbound.ts) alerta esto.

### 6. Match Vapi outbound ↔ outbound_calls por vapi_call_id

Todo `call.type === 'outboundPhoneCall'` en Vapi debe tener un `outbound_calls` row con matching `vapi_call_id`. Si aparece en `voice_calls` en su lugar → el bug 2026-09-29 volvió. El detector [`outbound-registration`](../../../src/lib/monitoring/outbound-registration.ts) alerta esto.

## Anti-patrones prohibidos

1. **Concluir "es outbound" o "es inbound" solo por caller_number o timing.** Sin `call.type` de Vapi, no sabes.
2. **Ventanas temporales anchas (±10min) para match.** Solo `±2s...end+30s` sobre `duration_seconds`.
3. **Ignorar `features` del agente.** Un análisis que asume `client_memory=true` cuando es `false` está mal por defecto.
4. **Silent `.insert()` sin verificar error.** En pipelines críticos, siempre `if (error) console.error(...)`.
5. **Trust en un solo query. Al menos 2 fuentes independientes** (Supabase + Vapi API, o count exact + head:false).

## Herramientas listas

- `scripts/audit-nelia-billing.ts` — plantilla auditoria (adaptar a otros meerkats)
- `scripts/vapi-list-nelia-calls.ts` — plantilla consulta Vapi API
- `scripts/nelia-tortilleria-linkedin-metrics.ts` — plantilla métricas mensuales para post/reporte
- `src/lib/monitoring/stuck-outbound.ts` — detector automático de contacts stuck
- `src/lib/monitoring/outbound-registration.ts` — detector automático de outbound calls mal registrados

## Referencias

- Bug histórico: [[../learnings]] entrada 2026-09-29
- Fix commit: `52e47b21`
