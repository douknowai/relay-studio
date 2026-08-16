import { NextRequest } from 'next/server';
import { authenticateRequest, successResponse, errorResponse, requireScope } from '@/server/api-helpers';
import { getQuotaUsage } from '@/server/quotas';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    requireScope(auth, 'usage:read');
    const { getSupabaseServerClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseServerClient();

    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Get quota
    const { data: quota } = await supabase
      .from('user_quotas')
      .select('*')
      .eq('user_id', auth.userId)
      .single();

    const quotaUsage = await getQuotaUsage(auth.userId);

    // Today stats - separate by type
    const { data: todayRecords } = await supabase
      .from('usage_records')
      .select('status, latency_ms, model_config_id')
      .eq('user_id', auth.userId)
      .gte('created_at', today);

    // Get model configs to determine type
    const modelIds = [...new Set((todayRecords || []).map((r: { model_config_id: string }) => r.model_config_id))];
    const { data: todayModelConfigs } = modelIds.length > 0
      ? await supabase.from('model_configs').select('id, code, display_name, provider_type').in('id', modelIds)
      : { data: [] };
    const modelTypeMap = new Map(
      (todayModelConfigs || []).map((m: { id: string; provider_type: string }) => [m.id, m.provider_type])
    );

    const todayImageRecords = (todayRecords || []).filter((r: { model_config_id: string }) => {
      const pt = modelTypeMap.get(r.model_config_id);
      return pt && !pt.includes('video');
    });
    const todayVideoRecords = (todayRecords || []).filter((r: { model_config_id: string }) => {
      const pt = modelTypeMap.get(r.model_config_id);
      return pt && pt.includes('video');
    });

    const calcStats = (records: Array<{ status: string; latency_ms: number | null }>) => {
      const total = records.length;
      const succeeded = records.filter((r) => r.status === 'succeeded').length;
      const failed = records.filter((r) => r.status === 'failed').length;
      const latencies = records.filter((r) => r.latency_ms).map((r) => r.latency_ms as number);
      const avgLatency = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : null;
      return { total, succeeded, failed, avg_latency_ms: avgLatency };
    };

    // Monthly stats - separate by type
    const { data: monthlyRecords } = await supabase
      .from('usage_records')
      .select('status, model_config_id')
      .eq('user_id', auth.userId)
      .gte('created_at', monthStart);

    const monthlyModelIds = [...new Set((monthlyRecords || []).map((r: { model_config_id: string }) => r.model_config_id))];
    const { data: monthlyModelConfigs } = monthlyModelIds.length > 0
      ? await supabase.from('model_configs').select('id, code, display_name, provider_type').in('id', monthlyModelIds)
      : { data: [] };
    const monthlyModelTypeMap = new Map(
      (monthlyModelConfigs || []).map((m: { id: string; provider_type: string }) => [m.id, m.provider_type])
    );

    const monthlyImageRecords = (monthlyRecords || []).filter((r: { model_config_id: string }) => {
      const pt = monthlyModelTypeMap.get(r.model_config_id);
      return pt && !pt.includes('video');
    });
    const monthlyVideoRecords = (monthlyRecords || []).filter((r: { model_config_id: string }) => {
      const pt = monthlyModelTypeMap.get(r.model_config_id);
      return pt && pt.includes('video');
    });

    // By model
    const { data: modelRecords } = await supabase
      .from('usage_records')
      .select('model_config_id, status')
      .eq('user_id', auth.userId)
      .gte('created_at', monthStart);

    const modelStats = new Map<string, { count: number; success: number; display_name: string; provider_type: string }>();
    for (const r of (modelRecords || [])) {
      const existing = modelStats.get(r.model_config_id) || { count: 0, success: 0, display_name: '', provider_type: '' };
      existing.count++;
      if (r.status === 'succeeded') existing.success++;
      modelStats.set(r.model_config_id, existing);
    }

    // Get model names
    const allModelIds = Array.from(modelStats.keys());
    const { data: modelConfigs } = allModelIds.length > 0
      ? await supabase.from('model_configs').select('id, code, display_name, provider_type').in('id', allModelIds)
      : { data: [] };

    const byModel = Array.from(modelStats.entries()).map(([id, stats]) => {
      const config = modelConfigs?.find((m: { id: string }) => m.id === id);
      const providerType = config?.provider_type || '';
      return {
        model_id: id,
        model_code: config?.code || id,
        display_name: config?.display_name || id,
        type: providerType.includes('video') ? 'video' : 'image',
        count: stats.count,
        success_rate: stats.count > 0 ? stats.success / stats.count : 0,
      };
    });

    // Check generation enabled
    const { data: genSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'generation_enabled')
      .single();

    // Recent 7-day usage trend (succeeded only)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const { data: recentRecords } = await supabase
      .from('usage_records')
      .select('model_config_id, created_at')
      .eq('user_id', auth.userId)
      .eq('status', 'succeeded')
      .gte('created_at', sevenDaysAgo.toISOString());

    const recentModelIds = [...new Set((recentRecords || []).map((r: { model_config_id: string }) => r.model_config_id))];
    const { data: recentModelConfigs } = recentModelIds.length > 0
      ? await supabase.from('model_configs').select('id, provider_type').in('id', recentModelIds)
      : { data: [] };
    const recentTypeMap = new Map(
      (recentModelConfigs || []).map((m: { id: string; provider_type: string }) => [m.id, m.provider_type])
    );

    const dayBuckets = new Map<string, { image_count: number; video_count: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      dayBuckets.set(d.toISOString().split('T')[0], { image_count: 0, video_count: 0 });
    }
    for (const r of (recentRecords || [])) {
      const day = (r as { created_at: string }).created_at.slice(0, 10);
      const bucket = dayBuckets.get(day);
      if (!bucket) continue;
      const pt = recentTypeMap.get((r as { model_config_id: string }).model_config_id);
      if (!pt) continue;
      if (pt.includes('video')) bucket.video_count++;
      else bucket.image_count++;
    }
    const recentUsage = Array.from(dayBuckets.entries()).map(([date, v]) => ({
      date,
      image_count: v.image_count,
      video_count: v.video_count,
      count: v.image_count + v.video_count,
    }));

    return successResponse({
      quota: {
        image: {
          daily_limit: quota?.daily_image_limit || 10,
          daily_used: quotaUsage.daily_used,
          monthly_limit: quota?.monthly_image_limit || 100,
          monthly_used: quotaUsage.monthly_used,
        },
        video: {
          daily_limit: quota?.daily_video_limit || 10,
          daily_used: quotaUsage.daily_video_used,
          monthly_limit: quota?.monthly_video_limit || 50,
          monthly_used: quotaUsage.monthly_video_used,
        },
        max_concurrent: quota?.max_concurrent_tasks || 2,
        current_concurrent: quotaUsage.active_tasks,
      },
      today: {
        image: calcStats(todayImageRecords as unknown as Array<{ status: string; latency_ms: number | null }>),
        video: calcStats(todayVideoRecords as unknown as Array<{ status: string; latency_ms: number | null }>),
      },
      monthly: {
        image: calcStats(monthlyImageRecords as unknown as Array<{ status: string; latency_ms: number | null }>),
        video: calcStats(monthlyVideoRecords as unknown as Array<{ status: string; latency_ms: number | null }>),
      },
      by_model: byModel,
      recent_usage: recentUsage,
      generation_enabled: genSetting?.value === 'true',
    }, auth.requestId);
  } catch (err) {
    return errorResponse(err, '');
  }
}
