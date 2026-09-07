-- 2026-09-07: limpieza de defaults legacy en voice_agents.
--
-- ai_ops_limit tenía DEFAULT 100 y minutes_included tenía DEFAULT 200. Estos
-- valores vienen del pricing pre-jornadas (2026-01?) donde había un tier único
-- de 100 ops y 200 min. Post-refactor jornadas, cualquier row que se insertaba
-- sin explicitar estos valores caía a los defaults obsoletos.
--
-- En la práctica el webhook Stripe (checkout.session.completed → new_agent /
-- checkout genérico) siempre los setea vía resolveTierAllocation antes de que
-- el cliente los pueda usar. Pero si el webhook se pierde (Stripe caído,
-- deploy en medio del evento, bug en handler), el row queda con 100/200 en vez
-- de fallar visiblemente. Silencioso = mal.
--
-- Nuevo default = 0. Cualquier row sin setear explícitamente arranca sin
-- capacidad → el error se manifiesta inmediatamente (cliente reporta "no
-- tengo minutos"), en lugar de que el cliente use 200 min "regalados" hasta
-- que alguien note la discrepancia.

ALTER TABLE voice_agents ALTER COLUMN ai_ops_limit    SET DEFAULT 0;
ALTER TABLE voice_agents ALTER COLUMN minutes_included SET DEFAULT 0;
