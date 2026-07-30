# Runbook — Model + Prompt Versioning Deploy

## Pre-deploy checklist

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npx tsx scripts/verify-vapi-assistants-snapshot.ts` → "All snapshots match"
- [ ] `psql "$SUPABASE_DB_URL" -f migrations/20260730_meerkat_versioning.sql` en STAGING primero
- [ ] `psql "$SUPABASE_DB_URL" -f sql/tests/meerkat_versioning.verify.sql` en STAGING → 10 filas todas en v1
- [ ] Smoke `/admin/versiones` en staging: tabla renderiza, activate a v1 (no-op) responde 200
- [ ] Smoke pin en staging: seleccionar agente demo, pin en v1, unpin

## Deploy prod

1. Correr migration prod:
   ```
   psql "$SUPABASE_PROD_DB_URL" -f migrations/20260730_meerkat_versioning.sql
   ```
2. Verificar seed:
   ```
   psql "$SUPABASE_PROD_DB_URL" -f sql/tests/meerkat_versioning.verify.sql
   ```
3. Vercel deploy de main.

## Post-deploy verification

- [ ] `curl` a `/api/admin/versiones` en prod → 10 meerkats, todos en v1
- [ ] Trigger 1 llamada a agente demo (o esperar 1 llamada real) → outcome normal en `voice_calls`
- [ ] Revisar logs Vercel de las siguientes 2h: sin warnings `[resolve-meerkat] stale active_version` o errores nuevos
- [ ] Monitor diario (`/centinelia-monitor` o cron) del día siguiente sin anomalías

## Rollback plan si sale mal

Si el refactor introduce regresión:
1. Vercel: promote deploy previo.
2. La tabla `meerkat_active_versions` puede quedarse — no molesta al código viejo (que no la lee).
3. Investigar en staging antes de re-deploy.

## Primer uso real después de deploy

Cuando quieras probar un modelo nuevo (ej. Opus 4.7 en Nia):
1. Agregar `NIA_CONFIGS[2] = { ... }` en `src/lib/vapi/meerkat-configs.ts`.
2. Commit + push + deploy Vercel.
3. `/admin/versiones` → click "Cambiar versión" en Nia → seleccionar v2 → activar.
4. Esperar ≤60s, verificar en monitor.
5. Si degrada: `/admin/versiones` → activar v1 (rollback en un click).
