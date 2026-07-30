# Runbook — Email Auto-Mode Classifier

**Spec:** [docs/superpowers/specs/2026-07-30-email-auto-mode-classifier-design.md](../superpowers/specs/2026-07-30-email-auto-mode-classifier-design.md)
**Plan:** [docs/superpowers/plans/2026-07-30-email-auto-mode-classifier.md](../superpowers/plans/2026-07-30-email-auto-mode-classifier.md)

## Kill switches (por severidad)

### Global panic — apagar para todos
1. Vercel → Project → Settings → Environment Variables
2. Setear `AUTO_MODE_CLASSIFIER_ENABLED=false` (production + preview)
3. Redeploy latest production build (no requiere rebuild)
4. Verificar en logs: próximos emails deben mostrar `finalStatus='pending'`

### Per-org — apagar para un cliente específico
```sql
UPDATE organizations SET auto_mode_disabled_at = NOW()
WHERE portal_email = '<cliente@ejemplo.com>';
```
Próximo email de ese org respeta el kill inmediatamente (siguiente ciclo del cron email-sync, max 15 min).

### Per-agent — el cliente lo elige
El cliente entra al portal → Correo → cambia el `AutoModeSelector` a "Manual".

## Reactivación

### Global
Borrar la env `AUTO_MODE_CLASSIFIER_ENABLED` o setearla a `true`. Redeploy.

### Per-org
```sql
UPDATE organizations SET auto_mode_disabled_at = NULL
WHERE portal_email = '<cliente@ejemplo.com>';
```

## Monitoring semanal (primeras 2 semanas)

Query manual a correr los lunes:

```sql
SELECT
  auto_mode_decision,
  COUNT(*)                                                             AS total,
  SUM(CASE WHEN auto_mode_flagged_at IS NOT NULL THEN 1 ELSE 0 END)   AS flagged,
  ROUND(100.0 * SUM(CASE WHEN auto_mode_flagged_at IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS flagged_pct
FROM ops_inbox
WHERE created_at > NOW() - INTERVAL '7 days'
  AND auto_mode_decision IS NOT NULL
GROUP BY 1;
```

Errores del classifier:

```sql
SELECT
  jsonb_array_elements_text(auto_mode_signals) AS signal,
  COUNT(*) AS n
FROM ops_inbox
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 2 DESC;
```

Signals que empiezan con `classifier_` indican errores infra.

## Kill triggers automáticos

- `send` con `flagged / total > 5%` → apagar per-org afectado, iterar prompt
- Signals `classifier_error` / `classifier_5xx` / `classifier_rate_limit` > 20% del volumen → apagar global vía env
- Queja de cliente por WA/correo mencionando "envió sin permiso" → apagar per-org inmediato

## Golden tests

Correr manualmente antes de cambiar el prompt del classifier:

```bash
npx tsx scripts/eval/run-email-classifier.ts
```

Si baja de thresholds (95% recall human/block, 80% precision send), no mergear el cambio de prompt.
