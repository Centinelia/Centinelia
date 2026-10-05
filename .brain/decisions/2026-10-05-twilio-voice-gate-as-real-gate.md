---
name: 2026-10-05-twilio-voice-gate-as-real-gate
description: El gate real de llamadas entrantes vive en /api/twilio/voice-gate, no en /api/voice/inbound. La lógica histórica de inbound/route.ts nunca se ejecutó en prod porque Vapi usa el assistantId pre-set del phone number.
type: decision
owner: nazre
decided_on: 2026-10-05
last_verified: 2026-10-05
---

# Decisión — Twilio voice-gate es el gate real de calls entrantes

**Regla**: todo gate que decida si una llamada entrante **suena, se rechaza, o se transfiere** vive en `src/app/api/twilio/voice-gate/route.ts`. NO en `src/app/api/voice/inbound/route.ts`.

## Contexto detonante

**Bug Tortillería 2026-10-05**: después de agregar `+524691269029` a `blocked_numbers` (PR #100) y confirmar que el hook en `inbound/route.ts` tenía 403, el bot siguió entrando. Debuggeando descubrí:

1. Los phone numbers de Vapi tienen `assistantId` pre-configurado.
2. Cuando un phone number tiene `assistantId` seteado, Vapi usa ese assistant **directamente** sin llamar al `serverUrl` para `assistant-request`.
3. `serverUrl` del phone number solo recibe webhooks post-call (`status-update`, `end-of-call-report`).
4. Resultado: **100 calls inspeccionadas, todas con `assistantOverrides: false`**. Ni una sola llamó a `inbound/route.ts`.

Toda la lógica de `inbound/route.ts` (blocklist, agent paused, account suspended, business hours, pool exhausted + fallback, daily cap, PausedByLimit) estaba muerta en producción desde que se pre-configuraron los assistantIds (probablemente desde 2026-08 cuando `pauseVapiAgent` se cambió a NO-OP con la justificación de que inbound detectaría `active=false` — asunción nunca verificada).

**Bug financiero oculto**: cuando el end-of-call-report detectaba pool agotado, el handler marcaba `active=false` en DB y llamaba `pauseVapiAgent` (NO-OP). La próxima call: Vapi usaba el assistantId → Nelia respondía → se cobraba otra vez.

## Fix (PR #100, #104, #106 + este fix)

Insertar un gate **a nivel Twilio** antes de Vapi:

```
PSTN → Twilio (voice_url) → /api/twilio/voice-gate → TwiML
                                                     ├─ <Reject>   (blocklist, suspended)
                                                     ├─ <Say><Hangup/> (paused, closed, pool, cap)
                                                     ├─ <Dial>     (pool + fallback_phone_number)
                                                     └─ <Redirect> a Vapi (normal)
```

Twilio consulta nuestro endpoint para CADA call entrante (`voice_url` del incoming phone number). Ahí viven todos los gates que SÍ corren en prod.

## Qué migrar al voice-gate (checklist)

Si agregas un gate nuevo de call entrante o modificas uno existente, **va en `voice-gate/route.ts`, no en `inbound/route.ts`**. Opciones de TwiML:

- `<Reject reason="busy|rejected"/>` — cuelga sin aviso. Para abuso/suspended.
- `<Say voice="Polly.Mia" language="es-MX">...</Say><Hangup/>` — mensaje y cuelga. Para pausado/cerrado/sin minutos.
- `<Dial>+52...</Dial>` — transfiere a otro número. Para fallback por pool agotado.
- `<Redirect method="POST">...</Redirect>` — forward al webhook original de Vapi.

## Qué NO va en voice-gate

- Construcción del system prompt del assistant (contexto del llamante, memoria, surveys, tools) — eso vive en el assistant pre-configurado en Vapi (ver `src/lib/vapi/sync.ts buildVapiAssistantPayload`).
- Owner bypass con `team_numbers` directorio complejo — por ahora sólo comparamos con `transfer_number` y `transfer_whatsapp` (los dos campos más usados). Si se requiere directorio completo, portar helpers.

## Inbound/route.ts queda como legacy

Lo mantenemos como fallback por si en el futuro algún phone se configura sin `assistantId` (modo transient-only). Lleva banner `⚠️ LEGACY — ESTE ENDPOINT NO SE EJECUTA EN PRODUCCIÓN ⚠️` al inicio.

No editar `inbound/route.ts` esperando cambiar comportamiento prod. Agregar un comentario de verificación: antes de modificar, correr `scripts/audit-vapi-phone-serverurls.mjs` y confirmar si algún phone no tiene assistantId (en cuyo caso sí consulta inbound).

## Aprobación

Nazre, 2026-10-05.
