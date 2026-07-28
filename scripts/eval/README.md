# Eval harness — Centinelia

Red de seguridad para cambios en prompts, HCP, CCE, guardrails, rules→principles, y progressive disclosure.

**Regla:** cualquier cambio que toque `src/lib/voice/prompt-builder.ts`, `src/lib/voice/rules.ts`, o los prompts inline de agentes debe pasar por acá antes de merge.

## Uso

### 1. Baseline actual desde producción

Toma los últimos N calls de Supabase y agrega métricas (CES por dimensión, self-eval promedio, outcomes, latencia, ops consumidos). Sin llamar Anthropic.

```bash
npx tsx scripts/eval/collect-baseline.ts --days=7 --out=baseline-$(date +%Y%m%d).json
```

### 2. Correr eval sobre transcripts curados

Necesita casos en `scripts/eval/cases/*.json` con formato:

```json
{
  "id": "cobros-01-corte-abrupto",
  "description": "Cliente corta a mitad de recopilación de datos",
  "meerkat_role_id": "nia",
  "transcript": "AI: Hola, ¿en qué le ayudo?\nCliente: Necesito...\n...",
  "expected": {
    "ces_min": { "fluidez": 3, "comprension": 4 },
    "outcome": "escalated_whatsapp",
    "should_not_contain": ["disculpe la molestia", "para servirle"]
  }
}
```

Ejecutar:

```bash
npx tsx scripts/eval/run-cases.ts --cases=scripts/eval/cases --model=claude-haiku-4-5-20251001
```

Devuelve pass/fail por caso + costos.

### 3. Antes de mergear F6.1 (rules→principles) o F7.1 (progressive disclosure)

Ambos cambios pueden degradar la voz. NO mergear sin:

1. Baseline con `collect-baseline.ts` en la rama `main`
2. Cambio en tu rama
3. Re-collect en tu rama
4. Comparar: si CES promedio baja >0.3 en cualquier dimensión, revisar antes de merge

## Roadmap

- [ ] Poblar `cases/` con 10-15 transcripts reales (esperando decisión de Nazre sobre cuáles)
- [ ] Rubric LLM-judge que puntúe cada dimensión CES sobre outputs generados
- [ ] CI hook: correr `run-cases.ts` en PRs que toquen `src/lib/voice/**`
- [ ] Snapshot de tokens del prefix (para detectar cambios que crucen umbrales de caching)

## Ver también

Sesión de context engineering Q3 en la conversación de Claude Code. Este scaffold desbloquea F6.1 y F7.1 del plan.
