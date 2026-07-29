import { NextRequest } from 'next/server';
import { authenticateRequest, successResponse, errorResponse, requireScope } from '@/server/api-helpers';
import { AppError, ErrorCodes } from '@/server/errors';
import { parseInput, updateImageSchema } from '@/server/validation/schemas';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  try {
    const { video_id } = await params;
    const auth = await authenticateRequest(request);
    requireScope(auth, 'videos:read');
    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from('generation_assets')
      .select('*')
      .eq('id', video_id)
      .eq('media_type', 'video')
      .single();

    if (error || !data) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '视频不存在');
    if (auth.role !== 'admin' && data.user_id !== auth.userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, '无权访问此视频');
    }

    // Generate signed URL
    const { createStorageClient } = await import('@/server/storage');
    const storage = createStorageClient();
    let url = '';
    let thumbnailUrl = '';
    try {
      url = await storage.getSignedUrl(data.object_key, 3600);
      if (data.thumbnail_key) {
        thumbnailUrl = await storage.getSignedUrl(data.thumbnail_key, 3600);
      }
    } catch { /* ignore */ }

    return successResponse({ ...data, url, thumbnail_url: thumbnailUrl }, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  try {
    const { video_id } = await params;
    const auth = await authenticateRequest(request);
    requireScope(auth, 'videos:write');
    const { favorite } = parseInput(updateImageSchema, await request.json());

    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('generation_assets')
      .select('user_id')
      .eq('id', video_id)
      .eq('media_type', 'video')
      .single();

    if (!existing) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '视频不存在');
    if (auth.role !== 'admin' && existing.user_id !== auth.userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, '无权操作此视频');
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (favorite !== undefined) updates.favorite = favorite;

    const { data, error } = await supabase
      .from('generation_assets')
      .update(updates)
      .eq('id', video_id)
      .select()
      .single();

    if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, '更新失败');

    return successResponse(data, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  try {
    const { video_id } = await params;
    const auth = await authenticateRequest(request);
    requireScope(auth, 'videos:write');

    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    const { data: existing } = await supabase
      .from('generation_assets')
      .select('user_id')
      .eq('id', video_id)
      .eq('media_type', 'video')
      .single();

    if (!existing) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '视频不存在');
    if (auth.role !== 'admin' && existing.user_id !== auth.userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, '无权删除此视频');
    }

    // Soft delete
    const { error } = await supabase
      .from('generation_assets')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', video_id);

    if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, '删除失败');

    return successResponse({ deleted: true }, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}
