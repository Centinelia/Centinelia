-- Instrucciones específicas del agente para llamadas salientes
ALTER TABLE voice_agents ADD COLUMN IF NOT EXISTS outbound_knowledge_base text;
