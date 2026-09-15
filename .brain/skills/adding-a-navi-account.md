---
name: adding-a-navi-account
description: Use when connecting a new IG account to a Navi meerkat. Enforces the 1x1 rule for role='navi', 20-cap for role='navi_agencia', brand summary required, OAuth flow, and onboarding path.
type: skill
owner: nazre
last_verified: 2026-09-15
---

# Adding a Navi IG account

## Precondiciones

1. Org tiene `organizations.features.social_publishing.enabled = true`.
2. Si agencia: `organizations.features.social_publishing.agency_mode = true`.
3. Meerkat destino existe con `role='navi'` o `role='navi_agencia'`, `active=true`.
4. Si `role='navi'`: no debe tener ya un row en `social_accounts` (trigger DB `enforce_navi_account_limit_trigger` lo bloquea).
5. Si `role='navi_agencia'`: debe tener menos de 20 rows en `social_accounts` (mismo trigger).
6. Cliente tiene Facebook Page linkeada a la cuenta IG Business/Creator (no Personal).

## Pasos

1. Cliente hace click "Conectar Instagram" desde el portal:
   - Estándar: `/portal/[token]/oficina/redes/[naviId]/cuenta`
   - Agencia: `/portal/[token]/oficina/redes/[naviId]/cuentas`
2. Portal redirige a OAuth Meta con state firmado (nonce CSRF) que incluye `agent_id`.
3. Cliente autoriza en Facebook, selecciona la Página FB linkeada al IG Business.
4. Callback `/api/auth/meta-callback` valida nonce, verifica session, itera `/me/accounts`, para cada page con IG Business hace upsert en `social_accounts` (provider='meta_instagram').
5. Trigger DB `enforce_navi_account_limit_trigger` bloquea si excede tope (1 estándar, 20 agencia).
6. Cliente completa `brand_summary` en un flow onboarding de 3 pasos.
7. Cliente carga al menos 3 brand templates desde Canva (via botón "Sincronizar plantillas").
8. Cliente aprueba primer calendario editorial mensual.
9. Cliente puede empezar a operar.

## Kill switch (post-conexión)

- `social_accounts.paused=true` pausa publicación solo de esa cuenta.
- Handlers checan `paused` antes de crear draft / publicar / programar / responder.
- Cron `publish-scheduled-posts` también skipea drafts de cuentas pausadas.

## Cuándo NO usar

- Cliente quiere TikTok/LinkedIn/X: esperar v2, no hay adapter aún.
- Cliente tiene IG Personal (no Business/Creator): guiar primero a upgrade cuenta.
- Meerkat destino no tiene `role='navi'` ni `role='navi_agencia'`: error, otro meerkat.
- Org sin `agency_mode` intentando 2+ cuentas en un solo navi_agencia: `agency_mode` debe estar en true.
