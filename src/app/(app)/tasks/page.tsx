'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { GenerationTask, ModelConfig, TaskStatus } from '@/types';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { copyToClipboard } from '@/lib/clipboard';
import { TableSkeleton, ErrorState, EmptyState } from '@/components/loading-states';

export default function TasksPage() {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter) params.set('status', statusFilter);
      if (modelFilter) params.set('model_code', modelFilter);

      const res = await fetchWithTimeout(`/api/v1/tasks?${params}`, {
        headers: { 'x-session': session?.access_token || '' },
        timeout: 10_000,
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.data || []);
        setTotal(data.pagination?.total || 0);
      } else {
        throw new Error('获取任务列表失败');
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [session, page, statusFilter, modelFilter]);

  useEffect(() => {
    if (session) fetchTasks();
  }, [session, fetchTasks]);

  // Auto-refresh while tasks are in flight (queued/running)
  const hasActiveTasks = tasks.some((t) => t.status === 'queued' || t.status === 'running');
  const [autoRefresh, setAutoRefresh] = useState(true);
  useEffect(() => {
    if (!autoRefresh || !hasActiveTasks || !session) return;
    const timer = setInterval(() => fetchTasks(true), 15_000);
    return () => clearInterval(timer);
  }, [autoRefresh, hasActiveTasks, session, fetchTasks]);

  const handleCopyError = async (task: GenerationTask) => {
    const text = [
      `Task ID: ${task.id}`,
      `Status: ${task.status}`,
      `Type: ${task.task_type}`,
      `Model: ${String(task.request_parameters?.model ?? '未知')}`,
      `Created: ${task.created_at}`,
      `Error: ${task.error_message || '（无详细信息）'}`,
    ].join('\n');
    const ok = await copyToClipboard(text);
    if (ok) toast.success('错误信息已复制');
    else toast.error('复制失败，请手动选择文本');
  };

  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetchWithTimeout('/api/v1/models', {
          headers: { 'x-session': session?.access_token || '' },
          timeout: 8_000,
        });
        if (res.ok) {
          const data = await res.json();
          setModels(data.data || []);
        }
      } catch { /* non-critical - models are supplementary */ }
    }
    if (session) fetchModels();
  }, [session]);

  const handleRetryTask = async (taskId: string) => {
    try {
      const res = await fetchWithTimeout(`/api/v1/tasks/${taskId}/retry`, {
        method: 'POST',
        headers: { 'x-session': session?.access_token || '' },
        timeout: 8_000,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || '重试失败');
      }
      toast.success('已提交重试');
      fetchTasks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '重试失败';
      setError(msg);
      toast.error('重试失败：' + msg);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      const res = await fetchWithTimeout(`/api/v1/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'x-session': session?.access_token || '' },
        timeout: 8_000,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || '取消失败');
      }
      toast.success('已取消任务');
      fetchTasks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '取消失败';
      setError(msg);
      toast.error('取消失败：' + msg);
    }
  };

  const statusColors: Record<TaskStatus, string> = {
    queued: 'text-[var(--color-warning)]',
    running: 'text-[var(--color-accent)]',
    succeeded: 'text-[var(--color-success)]',
    failed: 'text-[var(--color-destructive)]',
    cancelled: 'text-[var(--color-text-subtle)]',
  };

  const statusLabels: Record<TaskStatus, string> = {
    queued: '排队中',
    running: '生成中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };

  return (
    <div className="min-h-full bg-[#F5F5F5] p-4 md:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-3">
        <h1 className="text-[24px] leading-8 font-[650] text-[#1A1A1A]">任务列表</h1>
        <div className="flex items-center gap-2">
          {hasActiveTasks && autoRefresh && (
            <span className="text-xs text-[var(--color-text-subtle)] animate-pulse motion-reduce:animate-none" aria-hidden="true">
              · 每 15s 自动刷新
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            onClick={() => setAutoRefresh((v) => !v)}
            disabled={!hasActiveTasks}
            title={hasActiveTasks ? '有进行中任务时每 15 秒自动刷新' : '无进行中任务'}
            className="flex items-center gap-1.5 px-2 py-1 text-xs border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 tap-target"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${autoRefresh && hasActiveTasks ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-subtle)]'}`}
            />
            自动刷新
          </button>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-text)]"
          >
            <option value="">全部状态</option>
            <option value="queued">排队中</option>
            <option value="running">生成中</option>
            <option value="succeeded">已完成</option>
            <option value="failed">失败</option>
            <option value="cancelled">已取消</option>
          </select>
          <select
            value={modelFilter}
            onChange={(e) => { setModelFilter(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-text)]"
          >
            <option value="">全部模型</option>
            {models.map(m => (
              <option key={m.code} value={m.code}>{m.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchTasks} />
      ) : tasks.length === 0 ? (
        <EmptyState message="暂无任务" />
      ) : (
        <>
          {/* Mobile: Card list */}
          <div className="md:hidden space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="p-3 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)]">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-medium ${statusColors[task.status]}`}>
                    {statusLabels[task.status]}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-subtle)]">
                    {task.task_type === 'text_to_image' ? '文生图' : '图生图'}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text)] mb-2 line-clamp-2 mobile-break-all">
                  {task.prompt}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--color-text-subtle)]">
                    {new Date(task.created_at).toLocaleString('zh-CN')}
                  </span>
                  <div className="flex gap-2">
                    {task.status === 'failed' && (
                      <>
                        <button
                          onClick={() => handleRetryTask(task.id)}
                          className="text-xs text-[var(--color-accent)] hover:underline tap-target"
                        >
                          重试
                        </button>
                        <button
                          onClick={() => handleCopyError(task)}
                          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline tap-target"
                        >
                          复制错误
                        </button>
                      </>
                    )}
                    {task.status === 'queued' && (
                      <button
                        onClick={() => handleCancel(task.id)}
                        className="text-xs text-[var(--color-destructive)] hover:underline tap-target"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">Prompt</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">状态</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">类型</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">创建时间</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-hover)]">
                    <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-text-muted)]">
                      {task.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text)] max-w-xs truncate">
                      {task.prompt}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs font-medium ${statusColors[task.status]}`}
                        title={task.status === 'failed' ? (task.error_message || '无错误详情') : undefined}
                      >
                        {statusLabels[task.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                      {task.task_type === 'text_to_image' ? '文生图' : '图生图'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                      {new Date(task.created_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        {task.status === 'failed' && (
                          <>
                            <button
                              onClick={() => handleRetryTask(task.id)}
                              className="text-xs text-[var(--color-accent)] hover:underline"
                            >
                              重试
                            </button>
                            <button
                              onClick={() => handleCopyError(task)}
                              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"
                            >
                              复制错误
                            </button>
                          </>
                        )}
                        {(task.status === 'queued') && (
                          <button
                            onClick={() => handleCancel(task.id)}
                            className="text-xs text-[var(--color-destructive)] hover:underline"
                          >
                            取消
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-[var(--color-text-muted)]">
            共 {total} 条
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 text-xs border border-[var(--color-border)] rounded-[var(--radius-sm)] disabled:opacity-40 tap-target"
            >
              上一页
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page * pageSize >= total}
              className="px-2.5 py-1 text-xs border border-[var(--color-border)] rounded-[var(--radius-sm)] disabled:opacity-40 tap-target"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
