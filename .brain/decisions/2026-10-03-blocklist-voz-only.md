---
name: 2026-10-03-blocklist-voz-only
description: La feature blocked_numbers aplica solo al canal de voz. Chat y correo quedan fuera de scope hasta que haya spam real en esos canales.
type: decision
owner: nazre
decided_on: 2026-10-03
last_verified: 2026-10-03
---

# Decisión — blocked_numbers es voz-only (por ahora)

**Regla**: la tabla `blocked_numbers` y su hook en `src/app/api/voice/inbound/route.ts` aplican solo al canal de voz. Chat del portal y correo no consultan la blocklist.

## Contexto detonante

**Pedido Ramón (Tortillería Estrella) 2026-10-03**: bot marcador +524691269029 generó 90 llamadas en 48h (cada 30s de 22s). Ramón pidió herramienta en el portal para que los clientes bloqueen números sin esperar intervención manual.

PR shippeado: [#100](https://github.com/Centinelia/Centinelia/pull/100) — hook en inbound, API GET/POST/DELETE, UI en `/configurar`, 21 tests.

## Por qué voz-only (y no los 3 canales, violando [[2026-08-18-3-canales-obligatorio]])

1. **Ataque real está en voz**: todo el abuso que hemos visto (Tortillería y antes) ha sido vía marcadores telefónicos automáticos. Chat del portal requiere token válido (ya tiene gate) y correo requiere un dominio enviando a nuestra inbox (otro vector, otro mitigation).
2. **Chat/correo tienen otros gates**: rate limit en `/api/portal/[token]/agent-chat` + account_status check. Un bot abusando por chat ya rebotaría en rate limit antes de pegarle al meerkat. Para correo, el inbox-processor ya tiene su propia quick-classify spam filter.
3. **Costo de implementar sin uso real**: agregar chequeo a `agent-chat/route.ts` y `inbox-processor.ts` es trabajo barato (~1h) pero sin señal de abuso ahí, es prematuro — y agregar a dos sitios más superficie de testing/mantenimiento sin ROI.
4. **La promesa "3 canales igualados" aplica a capacidades del empleado digital** (tools, no gates infra). Un gate anti-abuso infra sí puede ser canal-específico sin romper la promesa al cliente final.

## Cuándo revisitar (triggers para extender)

Extender el blocklist a chat/correo cuando pase cualquiera de estos:

- Primer org reporta spam/abuso sostenido vía chat del portal (ej. alguien crea cuenta falsa + usa chat para floodear).
- Primer org reporta correos entrantes de un dominio/dirección específica que ignora la clasificación spam actual y quiere bloqueo hard.
- Crece la base >50 orgs activos (volumen suficiente para que probabilísticamente aparezca abuso en los otros canales).

Al ocurrir alguno: crear nueva decisión `2026-XX-XX-blocklist-extend-to-chat.md` con `supersedes: 2026-10-03-blocklist-voz-only`. El pattern a seguir está en [[../skills/early-return-403-inbound]].

## Qué NO se evaluó (y por qué)

- WhatsApp: Centinelia no manda WA outbound hoy (ver [[../../memory/feedback_wa_meerkat_outbound_descartado.md]]). El inbound de WhatsApp Business es un canal diferente y no está en producción.
- Instagram DMs (vía Navi): hoy solo responde a mensajes que llegan a la cuenta conectada. Instagram ya filtra spam a su nivel.

## Aprobación

Nazre, 2026-10-03.
