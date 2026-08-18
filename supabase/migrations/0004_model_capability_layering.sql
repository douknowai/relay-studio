-- =============================================================
-- 0004: model_configs capability layering
-- -------------------------------------------------------------
-- Gate semantics (routing / authorization booleans) live in entity
-- columns; capability_metadata JSON carries Param semantics only.
--
-- This migration:
--   1. Promotes `media_type` from capability_metadata JSON to an
--      entity column (it is a routing discriminator, not display
--      info). Backfilled from JSON, then provider_type heuristic.
--   2. Adds CHECK constraint: enabled non-mock models must declare
--      a non-empty external_model_id (prevents silent fallback
--      routing in the provider layer).
--   3. Strips gate-semantics fields from capability_metadata so a
--      single source of truth remains after upgrade.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. media_type entity column + backfill
-- -------------------------------------------------------------
ALTER TABLE model_configs
  ADD COLUMN IF NOT EXISTS media_type text
  NOT NULL DEFAULT 'image';

-- Backfill from capability_metadata where present
UPDATE model_configs
SET media_type = 'video'
WHERE capability_metadata->>'media_type' = 'video';

-- Backfill remaining video models via provider_type heuristic
UPDATE model_configs
SET media_type = 'video'
WHERE provider_type LIKE '%video%';

-- Constrain allowed values going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'model_configs_media_type_check'
  ) THEN
    ALTER TABLE model_configs
      ADD CONSTRAINT model_configs_media_type_check
      CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_model_configs_media_type
  ON model_configs (media_type);

-- -------------------------------------------------------------
-- 2. external_model_id CHECK for enabled non-mock models
-- -------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_external_model_id_required'
  ) THEN
    ALTER TABLE model_configs
      ADD CONSTRAINT chk_external_model_id_required
      CHECK (
        provider_type = 'mock'
        OR enabled = false
        OR external_model_id IS NOT NULL AND external_model_id <> ''
      );
  END IF;
END $$;

-- -------------------------------------------------------------
-- 3. Strip gate fields from capability_metadata (JSON keeps Param
--    semantics only). media_type / supports_* now live in columns.
-- -------------------------------------------------------------
UPDATE model_configs
SET capability_metadata = capability_metadata - 'media_type'
                             - 'supports_text_to_video'
                             - 'supports_image_to_video'
                             - 'supports_multiple_references'
WHERE capability_metadata ?| ARRAY[
  'media_type',
  'supports_text_to_video',
  'supports_image_to_video',
  'supports_multiple_references'
];

COMMIT;
