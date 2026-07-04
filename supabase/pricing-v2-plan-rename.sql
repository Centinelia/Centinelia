-- Pricing V2: remove 'basico', rename 'estandar' → 'comercial'
-- Run once in Supabase SQL editor

-- 1. Temporarily drop the CHECK constraint on plan
ALTER TABLE voice_agents DROP CONSTRAINT IF EXISTS voice_agents_plan_check;

-- 2. Migrate existing data
UPDATE voice_agents SET plan = 'comercial' WHERE plan IN ('basico', 'estandar');

-- 3. Re-add constraint with new valid values
ALTER TABLE voice_agents ADD CONSTRAINT voice_agents_plan_check
  CHECK (plan IN ('comercial', 'pro'));

-- Verify
SELECT plan, COUNT(*) FROM voice_agents GROUP BY plan;
