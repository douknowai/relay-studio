import { NextRequest } from 'next/server';
import { authenticateRequest, successResponse, errorResponse, requireScope } from '@/server/api-helpers';
import { AppError, ErrorCodes } from '@/server/errors';
import { updateApiKeySchema } from '@/server/validation/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key_id: string }> }
) {
  try {
    const { key_id } = await params;
    const auth = await authenticateRequest(request);
    requireScope(auth, 'api_keys:write');
    const parsed = updateApiKeySchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, parsed.error.issues[0]?.message ?? '请求参数无效');
    }
    const { is_active, scopes } = parsed.data;

    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('id', key_id)
      .single();

    if (!existing) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '密钥不存在');
    if (auth.role !== 'admin' && existing.user_id !== auth.userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, '无权操作此密钥');
    }

    // Build the patch: is_active toggles revoked_at, scopes replaces the grant list.
    // When only scopes is provided, the revocation state must be left untouched.
    const updateData: { revoked_at?: string | null; scopes?: string[] } = {};
    if (is_active !== undefined) {
      updateData.revoked_at = is_active ? null : new Date().toISOString();
    }
    if (scopes) {
      updateData.scopes = Array.from(new Set(scopes));
    }

    const { error } = await supabase
      .from('api_keys')
      .update(updateData)
      .eq('id', key_id);

    if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, '更新失败');

    return successResponse(
      { updated: true, ...(is_active !== undefined ? { is_active } : {}), ...(scopes ? { scopes: updateData.scopes } : {}) },
      auth.requestId
    );
  } catch (err) {
    return errorResponse(err, '');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key_id: string }> }
) {
  try {
    const { key_id } = await params;
    const auth = await authenticateRequest(request);
    requireScope(auth, 'api_keys:write');

    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('id', key_id)
      .single();

    if (!existing) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '密钥不存在');
    if (auth.role !== 'admin' && existing.user_id !== auth.userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, '无权操作此密钥');
    }

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', key_id);

    if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, '删除失败');

    return successResponse({ deleted: true }, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}
