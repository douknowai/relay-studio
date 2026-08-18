-- =============================================================
-- 0005: Strip gate-semantics fields from capability_metadata
-- =============================================================
-- MUST run AFTER the new frontend (normalized capabilities contract)
-- is deployed. The old frontend filters video models by
-- capability_metadata.media_type; stripping it earlier would empty
-- the video model list ("暂无可用模型" regression).
--
-- After this migration, capability_metadata carries Param semantics
-- only (sizes / durations / ratios / defaults). Gate booleans and
-- media_type live exclusively in entity columns.
-- Idempotent: safe to re-run.
-- =============================================================

BEGIN;

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
