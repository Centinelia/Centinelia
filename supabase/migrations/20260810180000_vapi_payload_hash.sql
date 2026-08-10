-- Anti-waste: content-hash cache para PATCHes a Vapi.
-- syncAgentToVapi computa sha256 del payload y skip PATCH si es igual al último enviado.
-- Handoff: handoff_anti_waste_infra_pendiente.md (candidato #2).

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS vapi_last_payload_hash TEXT;
