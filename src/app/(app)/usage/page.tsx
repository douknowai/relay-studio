'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { PageSkeleton, ErrorState, EmptyState } from '@/components/loading-states';
import { ConsolePage, ConsoleSection, ConsoleRow, CONSOLE_TOKENS } from '@/components/console';

interface CategoryQuota {
  daily_limit: number;
  daily_used: number;
  monthly_limit: number;
  monthly_used: number;
}

interface UsageData {
  quota: {
    image: CategoryQuota;
    video: CategoryQuota;
    max_concurrent: number;
    current_concurrent: number;
  };
  generation_enabled: boolean;
  recent_usage: Array<{
    date: string;
    count: number;
    image_count?: number;
    video_count?: number;
  }>;
}

function QuotaBar({ used, limit }: { used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
  const danger = limit > 0 && used >= limit;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'rgba(26,26,26,0.85)', flexShrink: 0 }}>
        {used} / {limit}
      </span>
      <div style={{
        width: 96,
        height: 4,
        flexShrink: 0,
        borderRadius: 999,
        background: 'rgba(26,26,26,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: 999,
          background: danger ? '#B42318' : CONSOLE_TOKENS.accent,
          transition: 'width 300ms ease-out',
        }} />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(26,26,26,0.45)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {percent}%
      </span>
    </div>
  );
}

export default function UsagePage() {
  const { session } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 30>(7);

  const fetchUsage = useCallback(async (days: number = 7) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/v1/usage?days=${days}`, {
        headers: { 'x-session': session?.access_token || '' },
        timeout: 10_000,
      });
      if (res.ok) {
        const data = await res.json();
        setUsage(data.data);
      } else {
        throw new Error('获取使用量失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) fetchUsage(trendDays);
  }, [session, fetchUsage, trendDays]);

  if (isLoading) {
    return <PageSkeleton rows={5} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchUsage} />;
  }

  if (!usage) {
    return <EmptyState message="数据不可用" />;
  }

  const { quota, recent_usage } = usage;
  const image_usage = quota.image;
  const video_usage = quota.video;

  const maxRecentCount = Math.max(...(recent_usage?.map(r => r.count) || [1]), 1);
  const hasCategorySplit = recent_usage?.some(r => r.image_count !== undefined && r.video_count !== undefined);

  return (
    <ConsolePage title="使用量" description="生成额度与近期使用统计">
      {!usage.generation_enabled && (
        <div style={{
          marginBottom: 20,
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid rgba(217,119,6,0.25)',
          background: 'rgba(217,119,6,0.06)',
          color: '#B45309',
          fontSize: 13,
          lineHeight: '20px',
        }}>
          生成服务暂时关闭，请联系管理员。
        </div>
      )}

      <ConsoleSection title="生成额度">
        <ConsoleRow
          meta={{ label: '图像 · 今日', description: '当日图像生成消耗与上限' }}
        >
          <QuotaBar used={image_usage.daily_used} limit={image_usage.daily_limit} />
        </ConsoleRow>
        <ConsoleRow
          meta={{ label: '图像 · 本月', description: '当月图像生成累计与上限' }}
        >
          <QuotaBar used={image_usage.monthly_used} limit={image_usage.monthly_limit} />
        </ConsoleRow>
        <ConsoleRow
          meta={{ label: '视频 · 今日', description: '当日视频生成消耗与上限' }}
        >
          <QuotaBar used={video_usage.daily_used} limit={video_usage.daily_limit} />
        </ConsoleRow>
        <ConsoleRow
          meta={{ label: '视频 · 本月', description: '当月视频生成累计与上限' }}
          isLast
        >
          <QuotaBar used={video_usage.monthly_used} limit={video_usage.monthly_limit} />
        </ConsoleRow>
      </ConsoleSection>

      <ConsoleSection title="并发">
        <ConsoleRow label="当前并发任务" isLast>
          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {quota.current_concurrent} / {quota.max_concurrent}
          </span>
        </ConsoleRow>
      </ConsoleSection>

      {recent_usage && recent_usage.length > 0 && (
        <ConsoleSection
          title={`近 ${trendDays} 天使用趋势`}
          action={
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: 2,
              borderRadius: 8,
              border: '1px solid rgba(26,26,26,0.14)',
            }}>
              {([7, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setTrendDays(d)}
                  disabled={trendDays === d}
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    lineHeight: '16px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: trendDays === d ? 'default' : 'pointer',
                    background: trendDays === d ? '#1A1A1A' : 'transparent',
                    color: trendDays === d ? '#FFFFFF' : 'rgba(26,26,26,0.55)',
                    transition: 'all 160ms ease-out',
                  }}
                >
                  {d}天
                </button>
              ))}
            </div>
          }
        >
          <div style={{ padding: '20px 24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 128 }}>
              {recent_usage.map((item, idx) => (
                <div key={item.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  {item.count > 0 && (
                    <span style={{ fontSize: 10, color: 'rgba(26,26,26,0.45)', fontVariantNumeric: 'tabular-nums' }}>
                      {item.count}
                    </span>
                  )}
                  <div style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    justifyContent: 'flex-end',
                    height: Math.max((item.count / maxRecentCount) * 80, 3),
                  }}>
                    {item.image_count !== undefined && item.video_count !== undefined ? (
                      <>
                        <div style={{
                          width: '100%',
                          height: Math.max((item.image_count / maxRecentCount) * 80, item.image_count > 0 ? 2 : 0),
                          borderRadius: '3px 3px 0 0',
                          background: CONSOLE_TOKENS.accent,
                          opacity: 0.85,
                        }} />
                        <div style={{
                          width: '100%',
                          height: Math.max((item.video_count / maxRecentCount) * 80, item.video_count > 0 ? 2 : 0),
                          borderRadius: '0 0 3px 3px',
                          background: 'rgba(26,26,26,0.55)',
                          opacity: 0.8,
                        }} />
                      </>
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: 3,
                        background: CONSOLE_TOKENS.accent,
                        opacity: 0.85,
                        transition: 'height 300ms ease-out',
                      }} />
                    )}
                  </div>
                  <span style={{ fontSize: 9, color: 'rgba(26,26,26,0.4)', whiteSpace: 'nowrap' }}>
                    {trendDays === 30 && idx % 5 !== 0 && idx !== recent_usage.length - 1
                      ? ''
                      : new Date(item.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
            {hasCategorySplit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(26,26,26,0.5)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CONSOLE_TOKENS.accent }} />
                  图像
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(26,26,26,0.5)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(26,26,26,0.55)' }} />
                  视频
                </span>
              </div>
            )}
          </div>
        </ConsoleSection>
      )}
    </ConsolePage>
  );
}
