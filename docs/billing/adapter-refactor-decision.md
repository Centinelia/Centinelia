# Decisión: NO refactorizar CONTPAQi adapter a integration_accounts (aún)

## Contexto

El adapter `CONTPAQiAdapter` lee el token Dropbox desde
`organization_integrations.config.dropbox_token` (encriptado, sin
expires_at, sin refresh). El portal OAuth guarda tokens en
`integration_accounts` (con refresh_token + expires_at).

Puenteamos ambos con `src/lib/dropbox/token-sync.ts` + cron cada 3h. Es
deuda técnica: dos storages, un puente que hay que mantener.

## Opción evaluada: refactor completo

Modificar el adapter para leer directo de `integration_accounts`:

1. `buildAdapter` se vuelve async y hace lookup en `integration_accounts`.
2. Cada call site (~10 endpoints y crons) tiene que await el nuevo
   `buildAdapter`.
3. Refresh se hace on-demand cuando el adapter detecta token vencido, o
   con un helper wrapper.
4. Se deprecan: `config.dropbox_token`, `token-sync.ts`, cron
   `sync-dropbox-tokens`, script manual.
5. Migration para limpiar `config.dropbox_token` de todos los rows.

**Costo estimado:** 6-8h de trabajo + tests + riesgo real de regresión
en un piloto ya validado + auditado dos veces.

## Decisión: NO ejecutar ahora

Razones:

1. **El puente funciona.** Tests unitarios lo cubren. El cron rota cada
   3h con margen de 15 min sobre TTL de 4h. Cero riesgo funcional.
2. **Piloto de 1 cliente.** El adapter ya vive con esta deuda; no hay
   presión operativa. Con 3+ clientes se justifica el refactor (más
   overhead de mantener el puente que el trabajo one-time).
3. **Riesgo asimétrico.** Romper el pipeline auditado 2 veces para
   ahorrar 3 archivos no es buen trade-off. El puente es reversible
   sin trauma.
4. **Complejidad real es baja.** ~230 líneas en total (lib + cron +
   script), sin bugs conocidos, cubiertas por tests.

## Trigger para re-visitar

- 3+ clientes activos con integración Dropbox, O
- Aparece bug concreto del puente (drift entre tablas, race con OAuth,
  fallo de refresh no manejado), O
- Cambio de scope en Dropbox obligue a refactor de todas formas
  (ej. multi-tenant, escrituras del adapter, etc.).

Documentado 2026-09-04 al cierre de sesión post-auditoría Dropbox.
