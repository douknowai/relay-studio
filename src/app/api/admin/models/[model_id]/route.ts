import { NextRequest } from 'next/server';
import { authenticateRequest, successResponse, errorResponse, requireAdmin } from '@/server/api-helpers';
import { AppError, ErrorCodes } from '@/server/errors';
import { adminUpdateModelSchema } from '@/server/validation/admin-schemas';
import { sanitizeMetadataForWrite, deriveCapabilities } from '@/server/models/capabilities';

const UPDATABLE_FIELDS = [
  'display_name',
  'provider_type',
  'external_model_id',
  'workflow_id',
  'enabled',
  'sort_order',
  'supports_text_to_image',
  'supports_image_to_image',
  'supports_text_to_video',
  'supports_image_to_video',
  'supports_multiple_references',
  'supports_sequential_generation',
  'supports_visible_watermark_control',
  'supported_sizes',
  'max_images_per_request',
  'max_provider_concurrency',
  'timeout_seconds',
  'default_parameters',
  'capability_metadata',
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ model_id: string }> }
) {
  try {
    const { model_id } = await params;
    const auth = await authenticateRequest(request);
    requireAdmin(auth);

    const body = await request.json();
    const parsed = adminUpdateModelSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid input', {
        issues: parsed.error.issues,
      });
    }
    const data = parsed.data;

    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    // Get current
    const { data: current } = await supabase
      .from('model_configs')
      .select('*')
      .eq('id', model_id)
      .single();

    if (!current) throw new AppError(ErrorCodes.MODEL_NOT_FOUND, '模型不存在');

    const updates: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
    }

    // Gate-semantics guard: capability_metadata must not carry routing /
    // gate fields — those live in entity columns only.
    if (updates.capability_metadata !== undefined) {
      updates.capability_metadata = sanitizeMetadataForWrite(
        updates.capability_metadata as Record<string, unknown>,
        { strict: true }
      );
    }

    // Post-write consistency check: enabled non-mock models must declare an
    // external model id, and video models must expose at least one gate.
    const merged = { ...current, ...updates };
    const nextCaps = deriveCapabilities(merged as Record<string, unknown>);
    if (merged.enabled === true && merged.provider_type !== 'mock') {
      if (!nextCaps.externalModelId) {
        throw new AppError(
          ErrorCodes.INVALID_REQUEST,
          'external_model_id 不能为空：启用的非 mock 模型必须配置真实模型号，否则 Provider 将静默路由到错误模型'
        );
      }
      if (nextCaps.mediaType === 'video' && !(nextCaps.supportsTextToVideo || nextCaps.supportsImageToVideo)) {
        throw new AppError(
          ErrorCodes.INVALID_REQUEST,
          '视频模型至少需启用 supports_text_to_video 或 supports_image_to_video 之一，否则生成请求会被能力门拦截'
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('model_configs')
        .update(updates)
        .eq('id', model_id);
      if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, '更新模型失败');
    }

    const { createAuditLogger } = await import('@/server/audit');
    const audit = createAuditLogger(auth.userId, auth.role, auth.requestId);
    await audit.logAction('update_model', 'model_config', model_id, current, updates);

    return successResponse({ updated: true }, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ model_id: string }> }
) {
  try {
    const { model_id } = await params;
    const auth = await authenticateRequest(request);
    requireAdmin(auth);

    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from('model_configs')
      .delete()
      .eq('id', model_id);

    if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, '删除模型失败');

    const { createAuditLogger } = await import('@/server/audit');
    const audit = createAuditLogger(auth.userId, auth.role, auth.requestId);
    await audit.logAction('delete_model', 'model_config', model_id, null, null);

    return successResponse({ deleted: true }, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}
