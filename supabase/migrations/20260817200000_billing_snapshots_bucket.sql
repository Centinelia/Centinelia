-- Migration: billing-snapshots Supabase Storage bucket
-- Applied by: controller via mcp__supabase__apply_migration
-- RLS: service_role only (no is_org_member helper required).
--      Path-level isolation is enforced by the key prefix: {portal_email}/{filePath}/*.
--      All access goes through createAdminClient() (service_role key), never user tokens.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('billing-snapshots', 'billing-snapshots', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY billing_snapshots_service_read ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'billing-snapshots');

CREATE POLICY billing_snapshots_service_write ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'billing-snapshots');

CREATE POLICY billing_snapshots_service_delete ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'billing-snapshots');
