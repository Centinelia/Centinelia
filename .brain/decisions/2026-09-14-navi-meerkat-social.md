---
date: 2026-09-14
type: decision
status: active
owner: nazre
supersedes: none
---

# Navi meerkat social/creativo (2 variantes)

**Decisión:** Introducir 2 nuevos roles `role='navi'` (1 cuenta IG, PyME)
y `role='navi_agencia'` (multi-cuenta hasta 20, agencia marketing).
Comparten adapters (Canva + Meta), tablas, crons y App Review Meta.
Difieren en shape de tools (16 vs 14), UI portal y pricing.

**Por qué:**
- Dolor genérico PyME + agencia marketing por creativo social
- Cliente kickstart es agencia con múltiples cuentas — single-Navi hubiera sido inviable
- Regla 1x1 rompía UX de agencia; multi-cuenta libre rompía aislamiento LLM
- Dual variant preserva ambos casos
- Feature-gated `organizations.features.social_publishing = { enabled, agency_mode }`
- 6-7 semanas de dev con App Review Meta en paralelo (critical path)

**Cómo aplicar:**
- Toda tool nueva de Navi pasa por skill `adding-a-meerkat-tool.md` (universal)
- Toda cuenta IG nueva pasa por skill `adding-a-navi-account.md` (nuevo, específico)
- Kill switch dual: por Navi (organizations.features toggle) + por cuenta (social_accounts.paused). Handlers de acción (crear/publicar/programar/responder) checan ambos antes de ejecutar
- Adapter obligatorio via `SocialPublisher` interface para nuevos providers (TikTok, LinkedIn, X en v2)

**Referencias:**
- Spec: `docs/superpowers/specs/2026-09-14-navi-social-media-design.md`
- Plan: `docs/superpowers/plans/2026-09-14-navi-social-media.md`
- Progress: `.superpowers/sdd/2026-09-14-navi-social-media/progress.md`
