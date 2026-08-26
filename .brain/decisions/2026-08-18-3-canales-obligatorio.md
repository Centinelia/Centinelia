---
name: 2026-08-18-3-canales-obligatorio
description: Toda tool nueva debe registrarse en los 3 canales (voice + chat + email) desde el primer día. Sin excepciones sin razón documentada.
type: decision
owner: nazre
decided_on: 2026-08-18
last_verified: 2026-08-26
---

# Decisión - 3 canales obligatorios para toda tool

**Regla:** cuando agregas una tool nueva a Centinelia, DEBE quedar disponible en los 3 canales del sistema: **voz** (Vapi), **chat** (portal), y **correo** (inbox-processor).

## Contexto histórico

**Incidente detonante (2026-08-10):** Se shipeó `crear_contacto_saliente` solo con:
- Voice: `sync.ts` + route handler ✓
- Chat: solo handler en `executor.ts` ✗ (se olvidó `agent-chat/route.ts` registry)
- Email: sin verificar ✗

Consecuencia: Sofia en chat inventó explicaciones tipo "el contacto no existe" durante 3 turnos porque el modelo del chat nunca vio la tool (no estaba en session tools). Nazre lo detectó en producción real con Roberto Meireles. Hotfix commit `bacb5d2a`.

**Incidente secundario:** en sesión 31 se acumularon 7 tools con paridad rota entre canales que tuvieron que remediarse en batch.

## Razones

1. **Consistencia del producto**: el cliente que usa chat/email debe tener la misma capacidad que quien usa voz. Es la promesa de "empleado digital que trabaja en 3 canales" - si la promesa se rompe silenciosamente, se rompe la confianza.
2. **Costo alto de deuda diferida**: tools con paridad rota se acumulan y remediar en batch es doloroso.
3. **Debugging asimétrico**: el modelo no dice "no tengo esta tool", inventa explicaciones. Bug silencioso y difícil de reproducir.

## Cómo se implementa

Ver [[../skills/adding-a-meerkat-tool]] para el checklist ejecutable de los 3 canales.

## Excepciones válidas (documentadas)

Tools genuinamente imposibles fuera de voz:
- `transferir_llamada` - requiere señalización telefónica en tiempo real
- `notificar_transferencia` - idem
- `registrar_encuesta` - inyectada por flujo inbound de Vapi

En estos casos: `null` en `VOICE_TO_CHAT` **con comentario explícito** de la razón. `null` sin comentario = tool pendiente = no se mergea.

## Aprobación

Nazre - cambio a esta decisión requiere nueva decisión con `supersedes: 2026-08-18-3-canales-obligatorio`.
