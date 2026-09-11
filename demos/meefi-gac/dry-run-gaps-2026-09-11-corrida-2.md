# Dry run gaps -- corrida 2 -- 2026-09-11 tarde

## Contexto

- Fecha: 2026-09-11, 14:31 CDMX (misma tarde de corrida 1, tras arreglar todos los R1-R4 + G8 + G9).
- Driver: Claude via curl multi-turn contra endpoint prod.
- Ambiente: `https://www.centinelia.mx/api/demo/meefi/chat` con deploy `d61065ff`.
- Objetivo: confirmar que ningún fix regresó nada. Sin calibración, sin cambios.

## Pre-flight

- Pool ops: 970 (>500 mínimo)
- KB Help Center: 15 artículos (target ≥ 15)
- Nelia active: true
- Gmail OAuth bound a Nelia (post-fix G7-R4): sí
- Nash silenciado: sí (`pilot_notify_email = NULL`)

## Resultados por bloque

| Bloque | Turnos | Correo | Provider | Verdict |
|---|---|---|---|---|
| 1 Password reset | 2 turnos | (no aplica) | — | **PASS 4/4** |
| 2 Transferencia HERO | 2 turnos | `nazre20+emilio@` `esc_0ek886an` | **gmail** ✓ | **PASS 4/4** |
| 3 KB Help Center | 1 turno | (no aplica) | — | **PASS 4/4** |
| 4 2FA recovery | **2 turnos** (mejor que corrida 1 que necesitó 3) | `nazre20+ashley@` `esc_l5ggz46q` | **gmail** ✓ | **PASS 4/4** |
| Niva compliance | 1 turno | (no aplica) | — | **PASS 4/4** (corrida 1 tarde, ver `dry-run-gaps-2026-09-11.md`) |

## Observaciones vs corrida 1

**Mejoras**:
- Bloque 4 (2FA) resuelve en 2 turnos en vez de 3. Nelia interpretó "subí las tres fotos + últimos 4 dígitos" como los 4 items directamente sin pedir clarificación adicional. Comportamiento más eficiente.
- Bloque 2 T1: Nelia pregunta activamente `"¿Tienes alguna urgencia con este pago, como un proveedor que necesita confirmación ahora?"`. Prepara al usuario a declarar urgencia en el segundo turno. Mejor UX que corrida 1.
- Correos ambos con `provider=gmail`, IMAP APPEND al Sent operando.

**Sin regresiones**:
- Ningún gap G1-G9 volvió a aparecer.
- Latencia normal (todas las llamadas <10 seg).
- Fixtures relativos siguen matcheando en las mismas fechas.

## Gaps identificados en corrida 2

Ninguno.

## Recomendación

Sin fixes pendientes. Stack listo para el 15-sept.

## Regla de corte martes 11-sept

No aplica. Todos los bloques corren clean end-to-end.

## Pool al cierre

- Antes corrida 2: 970 ops
- Consumo: solo los 2 correos escalados (Emilio + Ashley). Endpoint no consume pool per T8.
- Después: 970 ops (correos vía Gmail OAuth también son parte del ops, verificar en llm_call_log si aplica)

## Siguiente paso

T18 pendiente: grabar Loom fallback de cada bloque para tener video de respaldo por si algo se cae en vivo el lunes. Ideal sábado o domingo con el guion 13b abierto.

## Reactivar Nash

Regla vigente: dejar silenciado hasta 16-sept post-cita para no meter ruido durante dry runs / ensayos.
