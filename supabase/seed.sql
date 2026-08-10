-- Seed data for Relay Studio
-- Run this after migrations to set up default system settings and model configs

-- ============================================
-- System Settings
-- ============================================
INSERT INTO system_settings (key, value, description) VALUES
  ('generation_enabled', 'true', '全局图像生成开关'),
  ('api_enabled', 'true', 'API 访问总开关'),
  ('public_registration_enabled', 'false', '公开注册开关'),
  ('default_daily_limit', '50', '默认每日生成限额'),
  ('default_monthly_limit', '500', '默认每月生成限额'),
  ('default_max_concurrency', '3', '默认最大并发数'),
  ('default_retention_days', '90', '默认数据保留天数'),
  ('prompt_logging_mode', 'redacted', 'Prompt 日志模式: full/redacted/disabled'),
  ('maintenance_message', '', '维护公告信息')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Default Model Configs
-- ============================================
-- Note: external_model_id and workflow_id should be updated
-- with real values when Coze provider is configured.

INSERT INTO model_configs (code, display_name, provider_type, external_model_id, enabled, sort_order,
  supports_text_to_image, supports_image_to_image, supports_multiple_references,
  supports_sequential_generation, supports_visible_watermark_control,
  supported_sizes, max_images_per_request, max_provider_concurrency, timeout_seconds,
  default_parameters, capability_metadata) VALUES

('image-pro', 'Image Pro', 'coze_coding', '', true, 1,
  true, true, false, false, false,
  '["2K","4K","2560x1440","2048x2048","3840x2160","4096x4096"]', 4, 5, 120,
  '{}', '{"description": "高质量图像生成模型"}'),

('image-standard', 'Image Standard', 'coze_coding', '', true, 2,
  true, false, false, false, false,
  '["2K","4K","1024x1024"]', 4, 10, 90,
  '{}', '{"description": "标准图像生成模型"}'),

('image-mock', 'Mock Provider', 'mock', 'mock-model', false, 99,
  true, true, true, true, true,
  '["512x512","1024x1024","1024x1792","1792x1024"]', 4, 100, 30,
  '{}', '{"description": "本地开发和测试用 Mock 模型"}'),

-- Video models (Seedance by Doubao/ByteDance via Coze)
('video-seedance-1.5-pro', 'Seedance 1.5 Pro', 'coze_coding_video', 'doubao-seedance-1-5-pro-251215', true, 10,
  false, false, false, false, false,
  '[]', 1, 5, 600,
  '{}', '{
    "description": "高质量视频生成模型，支持文生视频和图生视频",
    "supports_text_to_video": true,
    "supports_image_to_video": true,
    "supports_multiple_references": true,
    "supported_resolutions": ["480p", "720p", "1080p"],
    "supported_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    "supported_durations": [5, 10],
    "max_videos_per_request": 1,
    "default_resolution": "720p",
    "default_ratio": "16:9",
    "default_duration": 5
  }'),

('video-seedance-2.0', 'Seedance 2.0', 'coze_coding_video', 'doubao-seedance-2-0-pro-250428', true, 11,
  false, false, false, false, false,
  '[]', 1, 3, 600,
  '{}', '{
    "description": "新一代视频生成模型，支持参考视频和参考音频输入",
    "supports_text_to_video": true,
    "supports_image_to_video": true,
    "supports_multiple_references": true,
    "supports_reference_video": true,
    "supports_reference_audio": true,
    "supported_resolutions": ["480p", "720p", "1080p"],
    "supported_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    "supported_durations": [5, 10],
    "max_videos_per_request": 1,
    "default_resolution": "720p",
    "default_ratio": "16:9",
    "default_duration": 5
  }')

ON CONFLICT DO NOTHING;
