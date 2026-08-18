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

INSERT INTO model_configs (code, display_name, provider_type, external_model_id, enabled, sort_order, media_type,
  supports_text_to_image, supports_image_to_image, supports_text_to_video, supports_image_to_video,
  supports_multiple_references,
  supports_sequential_generation, supports_visible_watermark_control,
  supported_sizes, max_images_per_request, max_provider_concurrency, timeout_seconds,
  default_parameters, capability_metadata) VALUES

-- Image models (Seedream by Doubao/ByteDance via Coze SDK)
-- external_model_id must match coze-coding-dev-sdk official model names
('image-pro', 'Image Pro', 'coze_coding', 'doubao-seedream-5-0-260128', true, 1, 'image',
  true, true, false, false, false, false, true,
  '["2K","4K","2560x1440","2048x2048","3840x2160","4096x4096"]', 4, 5, 120,
  '{}', '{"description": "高质量图像生成模型（Seedream 5.0）"}'),

('image-standard', 'Image Standard', 'coze_coding', 'doubao-seedream-4-5-251128', true, 2, 'image',
  true, false, false, false, false, false, true,
  '["2K","4K","1024x1024"]', 4, 10, 90,
  '{}', '{"description": "标准图像生成模型（Seedream 4.5）"}'),

('image-mock', 'Mock Provider', 'mock', 'mock-model', false, 99, 'image',
  true, true, false, false, true, true, true,
  '["512x512","1024x1024","1024x1792","1792x1024"]', 4, 100, 30,
  '{}', '{"description": "本地开发和测试用 Mock 模型"}'),

-- Video models (Seedance by Doubao/ByteDance via Coze SDK)
-- external_model_id must match coze-coding-dev-sdk official model names
('video-seedance-1.5-pro', 'Seedance 1.5 Pro', 'coze_coding_video', 'doubao-seedance-1-5-pro-251215', true, 10, 'video',
  false, false, true, true, false, false, false,
  '[]', 1, 5, 600,
  '{}', '{
    "description": "高质量视频生成模型，支持文生视频、图生视频（首帧/尾帧）和自动音频生成",
    "supports_reference_video": false,
    "supports_reference_audio": false,
    "supports_adaptive_ratio": true,
    "supported_resolutions": ["480p", "720p", "1080p"],
    "supported_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
    "supported_durations": [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "max_videos_per_request": 1,
    "default_resolution": "720p",
    "default_ratio": "16:9",
    "default_duration": 5,
    "generate_audio_default": true
  }'),

('video-seedance-2.0', 'Seedance 2.0', 'coze_coding_video', 'doubao-seedance-2-0-260128', true, 11, 'video',
  false, false, true, true, true, false, false,
  '[]', 1, 3, 600,
  '{}', '{
    "description": "新一代视频生成模型，支持参考图片/视频/音频输入，多模态创作",
    "supports_reference_video": true,
    "supports_reference_audio": true,
    "supports_adaptive_ratio": false,
    "supported_resolutions": ["480p", "720p", "1080p"],
    "supported_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    "supported_durations": [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "max_videos_per_request": 1,
    "max_reference_images": 9,
    "max_reference_videos": 3,
    "max_reference_audios": 3,
    "default_resolution": "720p",
    "default_ratio": "16:9",
    "default_duration": 5
  }')

ON CONFLICT DO NOTHING;
