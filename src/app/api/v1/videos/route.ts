import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  paginatedResponse,
  enforceGenerationRateLimit,
  requireScope,
} from '@/server/api-helpers';
import { AppError, ErrorCodes } from '@/server/errors';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createStorageClient } from '@/server/storage';
import { createTask, executeTask } from '@/server/tasks/executor';
import type { TaskType } from '@/server/tasks/state-machine';
import {
  createVideoTaskSchema,
  videoListQuerySchema,
  parseInput,
} from '@/server/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    requireScope(auth, 'videos:read');
    const supabase = getSupabaseClient();

    const url = new URL(request.url);
    const queryParams = parseInput(
      videoListQuerySchema,
      Object.fromEntries(url.searchParams.entries())
    );
    const {
      page,
      page_size: pageSize,
      favorite,
      task_id: taskId,
    } = queryParams;

    let query = supabase
      .from('generation_assets')
      .select('*', { count: 'exact' })
      .eq('user_id', auth.userId)
      .eq('media_type', 'video')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (favorite === 'true') query = query.eq('favorite', true);
    if (taskId) query = query.eq('task_id', taskId);

    const { data, error, count } = await query;
    if (error) return errorResponse(new Error('获取视频失败'), auth.requestId);

    // Generate signed URLs for each asset
    const storage = createStorageClient();

    const assetsWithUrls = await Promise.all(
      (data || []).map(async (asset: Record<string, unknown>) => {
        let url = '';
        let thumbnailUrl = '';
        try {
          if (asset.object_key) {
            url = await storage.getSignedUrl(asset.object_key as string, 3600);
          }
          if (asset.thumbnail_key) {
            thumbnailUrl = await storage.getSignedUrl(asset.thumbnail_key as string, 3600);
          }
        } catch { /* ignore signed URL errors */ }

        return { ...asset, url, thumbnail_url: thumbnailUrl };
      })
    );

    return paginatedResponse(assetsWithUrls, count || 0, page, pageSize, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    requireScope(auth, 'videos:write');
    enforceGenerationRateLimit(auth.userId);

    const body = parseInput(createVideoTaskSchema, await request.json());
    const {
      model: modelCode,
      prompt,
      resolution,
      ratio,
      duration,
      reference_asset_ids,
      idempotency_key,
    } = body;

    const supabase = getSupabaseClient();

    // 1. Check generation enabled (fail-closed)
    const { data: genSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'generation_enabled')
      .single();

    if (genSetting?.value !== 'true') {
      throw new AppError(ErrorCodes.GENERATION_DISABLED, '生成服务暂时关闭');
    }

    // 2. Check model exists and is enabled
    const { data: modelConfig } = await supabase
      .from('model_configs')
      .select('*')
      .eq('code', modelCode)
      .eq('enabled', true)
      .single();

    if (!modelConfig) {
      throw new AppError(ErrorCodes.MODEL_NOT_FOUND, '模型不存在或未启用');
    }

    // 3. Verify model is a video model
    const mediaType = (modelConfig.capability_metadata as Record<string, unknown>)?.media_type;
    if (mediaType !== 'video') {
      throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不是视频模型');
    }

    // 4. Check user model permissions
    const { data: quota } = await supabase
      .from('user_quotas')
      .select('*')
      .eq('user_id', auth.userId)
      .single();

    if (quota?.allowed_model_codes && (quota.allowed_model_codes as string[]).length > 0) {
      if (!(quota.allowed_model_codes as string[]).includes(modelCode)) {
        throw new AppError(ErrorCodes.MODEL_NOT_ALLOWED, '无权使用此模型');
      }
    }

    // 5. Validate resolution against model supported_sizes
    if (modelConfig.supported_sizes && (modelConfig.supported_sizes as string[]).length > 0) {
      if (!(modelConfig.supported_sizes as string[]).includes(resolution)) {
        throw new AppError(ErrorCodes.INVALID_REQUEST, '模型不支持此分辨率');
      }
    }

    // 6. Validate ratio against capability_metadata.supported_ratios
    const supportedRatios = (modelConfig.capability_metadata as Record<string, unknown>)?.supported_ratios as string[] | undefined;
    if (supportedRatios && supportedRatios.length > 0) {
      if (!supportedRatios.includes(ratio)) {
        throw new AppError(ErrorCodes.INVALID_REQUEST, '模型不支持此宽高比');
      }
    }

    // 7. Determine task type
    let taskType: TaskType;
    if (reference_asset_ids && reference_asset_ids.length >= 2) {
      taskType = 'first_last_frame';
      if (!modelConfig.supports_multiple_references) {
        throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不支持首尾帧模式');
      }
    } else if (reference_asset_ids && reference_asset_ids.length === 1) {
      taskType = 'image_to_video';
      if (!modelConfig.supports_image_to_image) {
        throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不支持图生视频');
      }
    } else {
      taskType = 'text_to_video';
      if (!modelConfig.supports_text_to_image) {
        throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不支持文生视频');
      }
    }

    // Create task via executor
    const task = await createTask({
      user_id: auth.userId,
      model_code: modelCode,
      task_type: taskType,
      prompt: prompt.trim(),
      request_parameters: { resolution, ratio, duration, n: 1, reference_asset_ids },
      idempotency_key: idempotency_key || undefined,
      reference_asset_ids: reference_asset_ids?.length > 0 ? reference_asset_ids : undefined,
      requestSource: auth.authMethod === 'apikey' ? 'api' : 'web',
      api_key_id: auth.apiKeyId,
    });

    // Execute task asynchronously
    executeTask(task.id).catch(() => {
      // Error already handled inside executeTask
    });

    return successResponse({
      task_id: task.id,
      status: task.status,
      created_at: task.created_at,
      status_url: `/api/v1/tasks/${task.id}`,
    }, auth.requestId, 201);
  } catch (err) {
    return errorResponse(err, '');
  }
}
