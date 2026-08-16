import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  enforceUploadRateLimit,
  requireScope,
} from '@/server/api-helpers';
import { AppError, ErrorCodes } from '@/server/errors';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB (Seedance 2.0 reference videos)
const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB

function getMaxSizeForMime(mime: string): number {
  if (VIDEO_MIME_TYPES.includes(mime)) return MAX_VIDEO_SIZE;
  if (AUDIO_MIME_TYPES.includes(mime)) return MAX_AUDIO_SIZE;
  return MAX_IMAGE_SIZE;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    requireScope(auth, 'images:write');
    enforceUploadRateLimit(auth.userId);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new AppError(ErrorCodes.INVALID_FILE, '未上传文件');
    }

    // Validate MIME type
    const allowed = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES, ...AUDIO_MIME_TYPES];
    if (!allowed.includes(file.type)) {
      throw new AppError(ErrorCodes.INVALID_FILE, '仅支持 PNG、JPEG、WebP 图片，MP4/WebM/MOV 视频和常见音频格式');
    }

    // Validate file size (per media type)
    const maxSize = getMaxSizeForMime(file.type);
    if (file.size > maxSize) {
      const maxMb = Math.round(maxSize / 1024 / 1024);
      throw new AppError(ErrorCodes.INVALID_FILE, `文件大小不能超过 ${maxMb}MB`);
    }

    // Upload to storage
    const { createStorageClient } = await import('@/server/storage');
    const storage = createStorageClient();

    const ext = file.name.split('.').pop() || 'png';
    const objectKey = `users/${auth.userId}/references/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await storage.upload(objectKey, buffer, file.type);

    // Create reference record
    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from('generation_references')
      .insert({
        task_id: null, // Linked when task is created
        user_id: auth.userId,
        object_key: objectKey,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
      })
      .select('id, object_key')
      .single();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, '保存参考图失败');
    }

    return successResponse({
      asset_id: data.id,
      object_key: data.object_key,
    }, auth.requestId, 201);
  } catch (err) {
    return errorResponse(err, '');
  }
}
