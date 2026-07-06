-- Allow business_hours to be null (null = Abierto 24/7, no restrictions)
ALTER TABLE voice_agents ALTER COLUMN business_hours DROP NOT NULL;
