-- 0002_generation_artifacts.sql
-- Phase 1 durable orchestration storage bucket setup.
-- Applied via `supabase db push` from the `backend/` workspace.
-- ---------------------------------------------------------------------------
-- Private storage bucket for artifact envelopes consumed by
-- backend/src/repositories/artifactsRepo.ts.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('generation-artifacts', 'generation-artifacts', FALSE)
ON CONFLICT (id) DO UPDATE
SET public = FALSE, name = EXCLUDED.name;

-- Service-role object access for durable Worker operations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'service-role-generation-artifacts-objects'
  ) THEN
    CREATE POLICY "service-role-generation-artifacts-objects"
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'generation-artifacts')
      WITH CHECK (bucket_id = 'generation-artifacts');
  END IF;
END
$$;
