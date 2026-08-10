import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, successResponse, errorResponse, requireScope } from '@/server/api-helpers';
import { AppError } from '@/server/errors';

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
      // Return OpenAI-compatible format
      const openaiModels = models.map((m: Record<string, unknown>) => {
        const meta = (m.capability_metadata as Record<string, unknown>) || {};
        const isVideo = (m.provider_type as string)?.includes('video');
        return {
          id: m.code,
          object: 'model' as const,
          created: Math.floor(new Date(m.created_at as string).getTime() / 1000),
          owned_by: 'relay-studio',
          // Extended fields for our platform
          display_name: m.display_name,
          provider_type: m.provider_type,
          type: isVideo ? 'video' : 'image',
          // Image fields
          supports_text_to_image: m.supports_text_to_image || false,
          supports_image_to_image: m.supports_image_to_image || false,
          supported_sizes: m.supported_sizes || [],
          max_images_per_request: m.max_images_per_request || 0,
          // Video fields (read from DB columns first, fallback to capability_metadata)
          supports_text_to_video: m.supports_text_to_video || meta.supports_text_to_video || false,
          supports_image_to_video: m.supports_image_to_video || meta.supports_image_to_video || false,
          supports_reference_video: meta.supports_reference_video || false,
          supports_reference_audio: meta.supports_reference_audio || false,
          supported_resolutions: meta.supported_resolutions || [],
          supported_ratios: meta.supported_ratios || [],
          supported_durations: meta.supported_durations || [],
          max_videos_per_request: meta.max_videos_per_request || 0,
          default_resolution: meta.default_resolution || null,
          default_ratio: meta.default_ratio || null,
          default_duration: meta.default_duration || null,
          // Common
          description: meta.description || '',
        };
      });
      return NextResponse.json({
        object: 'list',
        data: openaiModels,
      });
    }

    return successResponse(models, auth.requestId);
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
