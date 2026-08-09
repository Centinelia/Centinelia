-- V2 is now the only portal shell. Flag is no longer read anywhere in code.
ALTER TABLE organizations DROP COLUMN IF EXISTS portal_v2_enabled;
