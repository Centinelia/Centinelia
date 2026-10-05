---
name: no-silent-provisioning-failures
description: Un empleado digital no se considera "provisionado" hasta que CADA pieza de su config esté verificada contra el proveedor real (Twilio, Vapi, Supabase). Fallas parciales nunca pasan silenciosas.
type: policy
owner: nazre
last_verified: 2026-10-05
---

# Policy — Un empleado se provisiona completo o se alerta

## La regla

Cuando el flow de alta de un empleado toca varios sistemas externos (Twilio phone number + Vapi assistant + Vapi phone-number + nuestra DB + Twilio voice_url al gate), **todos los pasos tienen que verificarse contra el proveedor real** antes de considerar al empleado operativo. Si cualquier paso falla:

1. **Loguear el error específico** (no "something went wrong" — qué paso, qué sistema, qué código HTTP).
2. **Alertar a hola@centinelia.mx** con asunto `[URGENTE]`.
3. **Marcar el estado del empleado como incompleto** en el resultado (`fullyProvisioned: false`).
4. **El cliente nunca recibe el "bienvenido" normal** hasta que esté arreglado — si corresponde, retener comunicación.

## Why

Historias de fallos silenciosos que motivaron esta policy:

- **2026-10-05 (Tortillería)**: 3 phones activos tenían `voice_url` apuntando a Vapi en vez de nuestro gate → blocklist, business hours, pool exhausted, agent paused, suspended, daily cap ESTABAN TODOS MUERTOS en prod sin que nadie lo supiera. Bug financiero: cliente agotaba minutos pero el "pause" era NO-OP → seguíamos cobrando el pool.
- **Antes 2026-08-11**: `pauseVapiAgent` se cambió a NO-OP con comentario "inbound detecta estado" — asunción nunca verificada en prod. Nadie corrió un test E2E tras el cambio.
- **2026-08 (Nia Monterrey)**: webhook desactivaba agente después de cada llamada (bug reconocido en el código). Habría sido imposible pasarlo si hubiéramos validado post-provisioning.

El patrón común: cada bug asumía que "las otras piezas van a hacer su parte". Nadie validaba que lo asumido fuera cierto.

## How to apply

### Al escribir código de provisioning

```ts
// MAL
await buyTwilio(x);
await importToVapi(x);
await assignAssistant(x);
return { ok: true };  // no sabemos si cada paso funcionó

// BIEN
const errors: string[] = [];
const bought = await buyTwilio(x);
if (!bought) errors.push('twilio buy failed');

const vapiId = await importToVapi(x);
if (!vapiId) errors.push('vapi import failed');

const gatePatched = await patchTwilioVoiceUrlToGate(bought.sid);
if (!gatePatched) errors.push('voice_url no apunta al gate');

const assigned = await assignAssistant(vapiId);
if (!assigned) errors.push('assistant assign failed');

// Audit post-provisioning contra los proveedores reales
const problems = await auditPhoneProvisioning(bought.sid, vapiId);
errors.push(...problems);

return { fullyProvisioned: errors.length === 0, errors };
```

### Al llamar al provisioning

```ts
const result = await provisionPhoneNumber(...);
if (!result || !result.fullyProvisioned) {
  // email a hola@centinelia.mx con los errores específicos
  // NO continúes el flow normal (bienvenida al cliente, activar features)
  // hasta que un humano revise.
}
```

### Al modificar un flujo que ya funciona

Antes de cambiar la lógica de un paso (ejemplo: convertir una función en NO-OP), responder:

- ¿Qué sistema dependía de este paso?
- ¿Existe un test E2E que verifique que la dependencia sigue funcionando?
- Si no existe, **créalo antes del cambio**. Un test unitario del paso NO-OP no es suficiente — verifica aguas abajo.

## Scripts de rescate

- `scripts/audit-twilio-voice-urls.mjs [--fix]` — detecta phones con voice_url que no apunta al gate.
- `scripts/audit-vapi-phone-serverurls.mjs` — detecta phones con serverUrl mal apuntado en Vapi.

Correr ambos periódicamente (semanalmente o tras cada deploy que toque provisioning).

## Alcance

Aplica a:
- Alta de nuevo cliente (stripe checkout new_agent).
- Cambio de jornada que agrega canal de voz (jornada_change).
- Resync de agente existente.
- Cualquier flow que modifique config externa (Twilio, Vapi, SIP).
- **OAuth callbacks** (QuickBooks, Gmail/Outlook, Meta/Instagram, Calendar, Storage, Notion, Dropbox): usar `verifyIntegrationUpsert()` de `@/lib/oauth/verify-integration` para que un fallo de escritura no quede silent-ok. Patrón: si falla el upsert → redirect al UI con `?error=X_db` + email URGENTE automático.

NO aplica a:
- Flujos que tocan solo nuestra DB (features toggles, prompts, directorio).
- Flujos donde el cliente ya está pagando y usando — los bugs ahí se detectan por operación, no por provisioning.

## Coverage actual (2026-10-05, PR #108, #110)

| Flow | fail-loud | Notes |
|---|---|---|
| Twilio phone + Vapi phone + voice_url | ✅ | provision.ts audita contra proveedor real + alerta en billing/webhook |
| QuickBooks OAuth (`qb-oauth/callback`) | ✅ | `verifyIntegrationUpsert` |
| Email OAuth (gmail / outlook) | ✅ | `verifyIntegrationUpsert` |
| Meta/Instagram OAuth (Navi) | ✅ | `verifyIntegrationUpsert` por página — si todas fallan → error, si parcial → alerta |
| Calendar OAuth | ⏳ TODO | Aplicar `verifyIntegrationUpsert` |
| Storage OAuth (Drive, OneDrive, Dropbox) | ⏳ TODO | Aplicar `verifyIntegrationUpsert` |
| Notion OAuth | ⏳ TODO | Aplicar `verifyIntegrationUpsert` |
| MercadoLibre OAuth | ⏳ TODO | Aplicar `verifyIntegrationUpsert` |
| Canva OAuth | ⏳ TODO | Aplicar `verifyIntegrationUpsert` |

## Aprobación

Nazre, 2026-10-05.
