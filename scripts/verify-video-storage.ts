/**
 * 视频生成 → 对象存储持久化链路验证脚本（真实调用，非 mock）
 *
 * 验证内容：
 * 1. createTask 创建 text_to_video 任务
 * 2. executeTask 真实调用视频生成 Provider
 * 3. 生成成功后通过 fetchToBuffer 下载视频（反代）
 * 4. uploadFile 保存到对象存储，generation_assets 落库
 * 5. 生成 Signed URL 并通过 Range 请求验证视频字节可取回
 *
 * 用法：
 *   pnpm exec tsx scripts/verify-video-storage.ts
 */

import { createTask, executeTask } from '../src/server/tasks/executor';
import { getSupabaseClient } from '../src/storage/database/supabase-client';
import { generateSignedUrl } from '../src/server/storage';

const ADMIN_EMAIL = 'admin@image-relay.studio';

async function main(): Promise<void> {
  const client = getSupabaseClient();

  // 1. Resolve admin user
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('user_id')
    .eq('email', ADMIN_EMAIL)
    .single();
  if (profileError || !profile) {
    console.error('[FAIL] cannot resolve admin profile:', profileError?.message);
    process.exit(1);
  }
  const userId = profile.user_id as string;
  console.log('[STEP] admin user:', userId);

  // 2. Create video task (smallest settings: 480p / 5s)
  const task = await createTask({
    user_id: userId,
    model_code: 'video-standard',
    task_type: 'text_to_video',
    prompt: 'A calm sea wave rolling onto a sandy beach at sunrise, gentle motion',
    request_parameters: {
      resolution: '480p',
      ratio: '16:9',
      duration: 5,
      watermark: true,
      generate_audio: false,
    },
  });
  console.log('[STEP] task created:', task.id, 'status:', task.status);

  // 3. Execute task (real provider call + persistence)
  const startedAt = Date.now();
  await executeTask(task.id);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[STEP] executeTask finished in ${elapsedSec}s`);

  // 4. Check final task status
  const { data: finalTask } = await client
    .from('generation_tasks')
    .select('status, error_code, error_message, latency_ms')
    .eq('id', task.id)
    .single();
  console.log('[STEP] final task status:', JSON.stringify(finalTask));

  if (!finalTask || finalTask.status !== 'succeeded') {
    console.error('[FAIL] task did not succeed:', finalTask?.error_code, finalTask?.error_message);
    process.exit(1);
  }

  // 5. Check asset record persisted
  const { data: assets } = await client
    .from('generation_assets')
    .select('id, object_key, mime_type, media_type, duration')
    .eq('task_id', task.id);

  if (!assets || assets.length === 0) {
    console.error('[FAIL] no generation_assets row for task');
    process.exit(1);
  }
  const asset = assets[0];
  console.log('[STEP] asset persisted:', JSON.stringify(asset));

  if (asset.media_type !== 'video') {
    console.error('[FAIL] asset media_type is not video:', asset.media_type);
    process.exit(1);
  }

  // 6. Signed URL + byte-range fetch to prove object exists in storage
  const signedUrl = await generateSignedUrl(asset.object_key as string, 600);
  const resp = await fetch(signedUrl, { headers: { Range: 'bytes=0-1023' } });
  if (!resp.ok && resp.status !== 206) {
    console.error('[FAIL] signed URL fetch failed:', resp.status);
    process.exit(1);
  }
  const head = Buffer.from(await resp.arrayBuffer());
  const contentLength = resp.headers.get('content-range') || resp.headers.get('content-length');
  const isMp4 = head.subarray(4, 8).toString('ascii') === 'ftyp';
  console.log('[STEP] signed URL fetch status:', resp.status, 'range:', contentLength);
  console.log('[STEP] MP4 magic bytes (ftyp) present:', isMp4);

  if (!isMp4) {
    console.error('[FAIL] downloaded bytes are not an MP4 file');
    process.exit(1);
  }

  console.log('[PASS] video generated, proxied (downloaded) and persisted to object storage:', asset.object_key);
}

main().catch((err) => {
  console.error('[FAIL] unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
