## Summary

Implementa el pilar 1 del framework de evolución: **rollback instantáneo del modelo/config de cualquier meerkat sin re-deploy**. Cada meerkat puede tener N versiones coexistiendo en el bundle; un puntero en Supabase decide cuál está activa. Cambio = SQL flip + cache clear (≤60s propagación).

- Backend: 2 tablas (`meerkat_active_versions`, `meerkat_version_history`) + resolver central con cache in-memory + refactor de `sync.ts` byte-idéntico.
- Portal admin: `/admin/versiones` con tabla, modal de activate, drawer de historial, tab de pin en ficha del agente.
- Agentes protegibles por versión específica vía `features.pinned_meerkat_version`.

Specs: [design](docs/superpowers/specs/2026-07-30-model-prompt-versioning-design.md) · [plan](docs/superpowers/plans/2026-07-30-model-prompt-versioning.md) · [runbook](docs/runbooks/meerkat-versioning-deploy.md)

## Cambios

- **DB**: `migrations/20260730_meerkat_versioning.sql` — 2 tablas + seed de 10 meerkats en v1.
- **Core**: `src/lib/vapi/meerkat-configs.ts`, `src/lib/vapi/resolve-meerkat.ts`, `src/lib/vapi/resync-meerkat.ts`; `sync.ts` refactor.
- **APIs admin**: `GET /api/admin/versiones`, `POST /api/admin/versiones/:meerkat/activate`, `GET /api/admin/versiones/:meerkat/history`, `PATCH /api/admin/agentes/:id/pin-version`.
- **UI admin**: `/admin/versiones` page + 3 componentes en `src/components/admin/`.
- **Snapshot tests**: `scripts/verify-meerkat-configs.ts` (10/10 configs, DB-free) + `scripts/verify-vapi-assistants-snapshot.ts` (integration, nia + nox).

## Test plan

- [ ] Correr `migrations/20260730_meerkat_versioning.sql` en staging (Supabase).
- [ ] `npx tsx scripts/verify-meerkat-configs.ts` → "All 10 meerkat configs match golden snapshot."
- [ ] `npx tsx scripts/verify-vapi-assistants-snapshot.ts` → "All snapshots match."
- [ ] Abrir `/admin/versiones` en staging: 10 filas visibles, cada una en v1.
- [ ] En ficha de agente demo: activar pin en v1, quitar pin, ver toggle funcional.
- [ ] Con solo v1 existiendo, el botón "Cambiar versión" NO debe aparecer en la tabla (solo cuando hay ≥2 versiones).
- [ ] Deploy prod: correr migration en Supabase prod ANTES del deploy Vercel.
- [ ] Post-deploy: `curl /api/admin/versiones` con cookie admin → 10 meerkats, todos en v1.
- [ ] Trigger 1 llamada real a agente demo (nia) → outcome normal, `voice_calls` sin regresión.
- [ ] Revisar logs Vercel 2h post-deploy: sin warnings `[resolve-meerkat] stale active_version`.

## Notes / follow-ups (separate PRs)

1. **tool-test cleanup**: commit `beee4a2` en esta rama duplica `d79834e` que ya está en main. `src/app/api/admin/tool-test/route.ts` debería gate-arse por `NODE_ENV !== 'production'` o removerse. No lo toqué en esta rama porque es out-of-scope.
2. **E6 del spec**: cuando se PATCHea `meerkat_role_id` de un agente, el handler debe limpiar `pinned_meerkat_version` (pin es semánticamente per-meerkat). No implementado — edge case.
3. **Minor polish** (parked):
   - `getActiveVersion` sobra-exportado en `resolve-meerkat.ts`.
   - "latest"/"pinned" en inglés en `VersionesTable` (i18n).
   - `ActivateVersionModal` backdrop no cierra (drawer sí).
   - Refetch redundante en pin PATCH.

## Cómo se usa la primera vez

Cuando quieras probar Opus 4.7 en Nia:
1. Agregar `NIA_CONFIGS[2] = { model: 'claude-opus-4-7', ... }` en `src/lib/vapi/meerkat-configs.ts`.
2. Commit + deploy Vercel (v2 disponible pero NO activa).
3. `/admin/versiones` → "Cambiar versión" en Nia → seleccionar v2 → activar.
4. Si degrada llamadas: mismo panel, activar v1 → rollback en un click sin re-deploy.
