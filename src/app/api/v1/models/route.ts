import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, successResponse, errorResponse, requireScope } from '@/server/api-helpers';
import { AppError } from '@/server/errors';
import { deriveCapabilities } from '@/server/models/capabilities';
import type { ModelConfigRow } from '@/server/models/capabilities';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    requireScope(auth, 'models:read');
    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from('model_configs')
      .select('*')
      .eq('enabled', true)
      .order('sort_order');

    if (error) {
      return errorResponse(new Error('获取模型失败'), auth.requestId);
    }

    // Filter models based on user permissions
    const { data: quota } = await supabase
      .from('user_quotas')
      .select('allowed_model_codes')
      .eq('user_id', auth.userId)
      .single();

    let models = data || [];
    if (quota?.allowed_model_codes && quota.allowed_model_codes.length > 0) {
      models = models.filter((m: { code: string }) => quota.allowed_model_codes.includes(m.code));
    }

    // Check if request is from API Key (OpenAI-compatible mode)
    const authHeader = request.headers.get('authorization');
    const isApiKeyAuth = authHeader?.startsWith('Bearer irs_live_');

    if (isApiKeyAuth) {
      // OpenAI-compatible format — derived from the normalized accessor so
      // gate columns and param metadata can never disagree.
      const openaiModels = models.map((m: ModelConfigRow) => {
        const caps = deriveCapabilities(m);
        return {
          id: caps.code,
          object: 'model' as const,
          created: Math.floor(new Date(m.created_at as string).getTime() / 1000),
          owned_by: 'relay-studio',
          // Extended fields for our platform
          display_name: caps.displayName,
          provider_type: caps.providerType,
          type: caps.mediaType,
          // Image fields
          supports_text_to_image: caps.supportsTextToImage,
          supports_image_to_image: caps.supportsImageToImage,
          supported_sizes: caps.supportedSizes,
          max_images_per_request: caps.maxImagesPerRequest,
          // Video fields (gate columns — single source of truth)
          supports_text_to_video: caps.supportsTextToVideo,
          supports_image_to_video: caps.supportsImageToVideo,
          supports_reference_video: caps.supportsReferenceVideo,
          supports_reference_audio: caps.supportsReferenceAudio,
          supported_resolutions: caps.supportedSizes,
          supported_ratios: caps.supportedRatios,
          supported_durations: caps.supportedDurations,
          max_videos_per_request: caps.maxVideosPerRequest,
          default_resolution: caps.defaultResolution,
          default_ratio: caps.defaultRatio,
          default_duration: caps.defaultDuration,
          // Common
          description: caps.description,
        };
      });
      return NextResponse.json({
        object: 'list',
        data: openaiModels,
      });
    }

    // Session mode: raw rows with a normalized `capabilities` projection
    // attached. Consumers should prefer `capabilities`; raw columns remain
    // for backward compatibility during the transition.
    const modelsWithCapabilities = models.map((m: ModelConfigRow) => ({
      ...m,
      capabilities: deriveCapabilities(m),
    }));

    return successResponse(modelsWithCapabilities, auth.requestId);
  } catch (err) {
    // OpenAI-compatible error for API key auth
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer irs_live_') && err instanceof AppError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            type: 'invalid_request_error',
          },
        },
        { status: 401 }
      );
    }
    return errorResponse(err, '');
  }
}
