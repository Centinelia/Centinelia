---
name: 2026-08-18-feature-flag-por-org
description: Toda tool custom debe estar gated por feature en la tabla organizations. El registry es compartido, la visibilidad es por-org.
type: decision
owner: nazre
decided_on: 2026-08-18
last_verified: 2026-08-26
---

# Decisión - Feature flag por org para toda tool custom

**Regla:** Toda tool nueva que no sea universal (ej. no `read_url`, `web_search`, etc.) debe declarar `gatedByFeature: 'nombre_feature'` en `src/lib/tools/registry.ts`. La feature se activa por-org en `organizations.features` (JSONB), no en `voice_agents`.

## Contexto histórico

Estado 2026-08-18: registry compartido con ~42 tools base + tools custom mezcladas. Sin gating por-org, cualquier meerkat de cualquier cliente veía todas las tools declaradas para su rol, incluidas las que solo aplicaban a 1 cliente.

Problema doble:
1. El LLM elige entre demasiadas tools y usa la equivocada (ver [[../policies/tool-completeness]] regla 1).
2. Un cliente sin la integración correspondiente puede ver una tool que le da error al invocarla → mala UX.

## Razones

1. **Reducción del set de tools del LLM**: menos ruido = mejor selección de tool correcta.
2. **Cero drift entre "integración conectada" y "tool disponible"**: la Capa 2 (SkillPacks) posterior formaliza esto con `activeCheck: ctx => !!ctx.qb_realm_id` - el flag se deriva automáticamente de fuentes ya existentes (`qb_integrations.realm_id`, `organizations.invoicing_provider`, etc.).
3. **No pagas por lo que no usas**: cliente sin QuickBooks no ve las tools QB, no ve upsell forzado, no da error si invoca.

## Cómo se implementa

En `src/lib/tools/registry.ts`:

```ts
{
  name: 'qb_crear_factura',
  gatedByFeature: 'quickbooks',
  // ...
}
```

Y el runtime filter (en los 3 canales) verifica `organizations.features.quickbooks === true` (o el `activeCheck` del SkillPack correspondiente) antes de exponerla al meerkat.

Ubicación de la feature: `organizations.features` (JSONB), **no** `voice_agents`. Razón: las integraciones viven a nivel org (una cuenta QB por org, no una por meerkat).

## Alcance

- Aplica a toda tool custom (integración externa o feature específica de dominio).
- **No aplica** a tools universales (`read_url`, `web_search`, `crear_lead`, etc.) - esas siguen `gatedByFeature: null`.

## Aprobación

Nazre - cambio a esta decisión requiere nueva decisión con `supersedes: 2026-08-18-feature-flag-por-org`.

## Ver también

- [[../policies/tool-completeness]] regla 3
- Spec de Capa 2 (SkillPacks): `docs/superpowers/specs/2026-08-19-capa-2-skills-packs-design.md` - formaliza `gatedByFeature` como estructura `SkillPack` con auto-detección.
