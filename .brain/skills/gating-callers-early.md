---
name: gating-callers-early
description: Use when adding anti-abuse / spam / block gates at the entry point of any Centinelia channel (voice inbound, chat API, email inbox). Enforces the "early-return before heavy work" pattern that keeps pool/billing clean and Vapi happy.
type: skill
owner: nazre
last_verified: 2026-10-03
inputs:
  - canal (voice | chat | email)
  - señal de rechazo (número bloqueado, token revocado, account suspended, etc.)
  - fuente de verdad (tabla DB, feature flag, computed)
output: Hook que cuelga/rechaza en <1s sin cobrar pool ni crear artefactos
---

# Gating callers early

Pattern genérico para cortar un llamante abusivo (voz) o un cliente abusivo (chat/email) **antes** de que gaste recursos del sistema o del pool del cliente. Nació del hotfix de blocked_numbers (2026-10-03, pedido Ramón para Tortillería) y se generaliza al resto de canales.

## Cuándo aplicar

- Spam/bot que llama en bucle (ver [[../decisions/2026-10-03-blocklist-voz-only]]).
- Cliente final que acosa a un negocio (bloqueo por teléfono).
- Rate limit duro (más allá de limiters Upstash) para una org específica.
- Suspensión temporal post-chargeback / fraude.

## El pattern (voz) — ya shipped

En `src/app/api/voice/inbound/route.ts`, tras resolver `typedAgent` y ANTES de account_status check:

```ts
if (phoneNumber && typedAgent.portal_email) {
  const normalizedCaller = normalizeToE164(phoneNumber);
  const { data: blocked } = await supabase
    .from('blocked_numbers')
    .select('id')
    .eq('portal_email', typedAgent.portal_email)
    .eq('phone_e164', normalizedCaller)
    .maybeSingle();
  if (blocked) {
    return NextResponse.json(
      { error: 'Caller number is blocked for this organization' },
      { status: 403 }
    );
  }
}
```

### Invariantes

1. **Early-return**: antes de cualquier query cara (org load, calendar check, QB check, buildSystemPrompt). Si gating fallara, hubiéramos pagado 3-5 queries de más por cada bot hit.
2. **Scoping org-level**: `portal_email` siempre, no `agent.id`. Si una org tiene 3 meerkats, bloquear a nivel org cubre a los tres sin configuración duplicada.
3. **Normalización E.164 antes de comparar**: `normalizeToE164(phoneNumber)` — Vapi puede entregar con/sin lada, con/sin +. Sin normalizar hay falsos negativos.
4. **403 (no 200 con assistant que cuelgue)**: 403 hace que Vapi corte en <1s. Devolver un assistant con `endCallAfterSilenceSeconds` cuesta ≥5s de voz = cobro a pool. Para abuso, 403.
5. **Skip si falta señal**: `phoneNumber &&` — llamadas `+anonymous` o sin caller ID no pueden bloquearse. No fail, solo skip.
6. **No crear row en voice_calls**: el early-return devuelve antes del flow. Vapi tampoco crea artefacto porque corta antes del end-of-call-report. Zero footprint.

## Extensión a chat (no shipped — espera trigger de [[../decisions/2026-10-03-blocklist-voz-only]])

En `src/app/api/portal/[token]/agent-chat/route.ts`, tras resolver `org`:

```ts
// Pseudocódigo del extension — NO implementar sin trigger documentado
const callerId = session.portalEmail ?? req.ip ?? null;
if (callerId) {
  const { data: blocked } = await supabase
    .from('blocked_chat_senders')  // nueva tabla si llegamos aquí
    .select('id')
    .eq('portal_email', org.portalEmail)
    .eq('sender_id', callerId)
    .maybeSingle();
  if (blocked) {
    return NextResponse.json({ error: 'Blocked' }, { status: 403 });
  }
}
```

**NO shippear** hasta que haya un caso real documentado — ver trigger de la decisión.

## Extensión a email (no shipped — mismo criterio)

En `src/lib/ops/inbox-processor.ts`, al clasificar el inbound. Devolver early con `status: 'blocked_sender'` sin invocar al meerkat ni gastar un AI op.

## Qué NO hacer

- ❌ **Chequear blocklist después de buildSystemPrompt** → ya pagaste la carga pesada.
- ❌ **Devolver un `assistant` con firstMessage "estás bloqueado" + endCallAfterSilenceSeconds** → paga ≥5s de voz.
- ❌ **Logs sin dedup si el bot marca 2x por segundo** → saturas Vercel logs. Si quieres telemetría, usa contador por org en Upstash Redis con TTL 24h.
- ❌ **Crear artefacto (voice_calls, ai_ops_log) para registrar el bloqueo** → zero footprint es la ventaja.

## Antes de mergear (checklist)

- [ ] El chequeo corre antes del primer side-effect (DB write, external API, LLM call).
- [ ] Scoping por `portal_email`, no por `agent.id`.
- [ ] Entradas comparadas en forma normalizada (E.164 para phone, lowercase para email, etc.).
- [ ] Tests estáticos: regex contra el source para evitar deletion accidental del guard (ver `src/app/api/voice/inbound/__tests__/blocklist-wiring.test.ts` como referencia).
- [ ] Si extiendes a canal nuevo, nueva decisión en `.brain/decisions/` con `supersedes: 2026-10-03-blocklist-voz-only`.

## Referencias de código

- Pattern voz: `src/app/api/voice/inbound/route.ts` (bloque "Blocklist check")
- API CRUD: `src/app/api/portal/[token]/blocked-numbers/route.ts`
- UI: `src/app/portal/[token]/configurar/BlockedNumbersSection.tsx` + botón contextual en `CallCard.tsx`
- Guard estático: `src/app/api/voice/inbound/__tests__/blocklist-wiring.test.ts`
