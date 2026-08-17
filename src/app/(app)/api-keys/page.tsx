'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { TableSkeleton, ErrorState, EmptyState } from '@/components/loading-states';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at?: string | null;
  is_active: boolean;
}

// Scope groups for the creation dialog. Must stay in sync with
// API_KEY_SCOPES in src/server/validation/schemas.ts.
const SCOPE_GROUPS: { label: string; scopes: { value: string; label: string }[] }[] = [
  {
    label: '图片',
    scopes: [
      { value: 'images:read', label: '查看图片' },
      { value: 'images:write', label: '生成图片' },
    ],
  },
  {
    label: '视频',
    scopes: [
      { value: 'videos:read', label: '查看视频' },
      { value: 'videos:write', label: '生成视频' },
    ],
  },
  {
    label: '任务',
    scopes: [
      { value: 'tasks:read', label: '查看任务' },
      { value: 'tasks:write', label: '重试/取消任务' },
    ],
  },
  {
    label: '模型与用量',
    scopes: [
      { value: 'models:read', label: '查看模型列表' },
      { value: 'usage:read', label: '查看用量' },
    ],
  },
  {
    label: '密钥与资料',
    scopes: [
      { value: 'api_keys:read', label: '查看密钥' },
      { value: 'api_keys:write', label: '管理密钥' },
      { value: 'profile:read', label: '查看资料' },
      { value: 'profile:write', label: '修改资料' },
    ],
  },
];

// Default grants for a new key: full generation workflow for both media types.
const DEFAULT_NEW_KEY_SCOPES = [
  'images:read',
  'images:write',
  'videos:read',
  'videos:write',
  'models:read',
];

function ScopeEditor({
  scopes,
  onToggle,
  onSave,
  onCancel,
  saving,
  compact,
}: {
  scopes: string[];
  onToggle: (scope: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] ${compact ? 'p-3 mt-2' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[var(--color-text)]">编辑权限范围</span>
        <span className="text-[10px] text-[var(--color-text-subtle)]">已选 {scopes.length} 项</span>
      </div>
      <div className={compact ? 'space-y-2' : 'max-h-56 overflow-y-auto border border-[var(--color-border)] rounded-[var(--radius-md)] divide-y divide-[var(--color-border)]'}>
        {SCOPE_GROUPS.map((group) => (
          <div key={group.label} className={compact ? '' : 'px-3 py-2'}>
            <p className="text-[10px] font-medium text-[var(--color-text-subtle)] uppercase tracking-wide mb-1.5">{group.label}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {group.scopes.map((scope) => (
                <label
                  key={scope.value}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={() => onToggle(scope.value)}
                    className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                  />
                  <span className="text-xs text-[var(--color-text)]">{scope.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={`flex gap-2 ${compact ? 'mt-3' : 'mt-4'}`}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || scopes.length === 0}
          className="text-xs font-medium px-3 py-1.5 rounded bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs font-medium px-3 py-1.5 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)] disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const { session } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [apiAccessEnabled, setApiAccessEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(DEFAULT_NEW_KEY_SCOPES);
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState(0);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editingScopes, setEditingScopes] = useState<string[]>([]);
  const [isSavingScopes, setIsSavingScopes] = useState(false);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchWithTimeout('/api/v1/api-keys', {
        headers: { 'x-session': session?.access_token || '' },
        timeout: 10_000,
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.data?.keys || []);
        setApiAccessEnabled(data.data?.api_access_enabled ?? false);
      } else {
        throw new Error('获取 API Key 列表失败');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) fetchKeys();
  }, [session, fetchKeys]);

  const toggleScope = (scope: string) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    if (newKeyScopes.length === 0) {
      setError('请至少选择一个权限范围');
      return;
    }
    setError(null);
    const expiresAt = newKeyExpiryDays > 0
      ? new Date(Date.now() + newKeyExpiryDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    try {
      const res = await fetchWithTimeout('/api/v1/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session?.access_token || '',
        },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes, expires_at: expiresAt }),
        timeout: 8_000,
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.data?.key || null);
        setNewKeyName('');
        toast.success('API Key 已创建');
        fetchKeys();
      } else {
        const data = await res.json();
        const msg = data.error?.message || '创建失败';
        setError(msg);
        toast.error('创建失败：' + msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建请求失败';
      setError(msg);
      toast.error('创建失败：' + msg);
    }
  };

  const deleteKey = async (keyId: string) => {
    if (!confirm('确定要删除此 API Key 吗？')) return;
    try {
      const res = await fetchWithTimeout(`/api/v1/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'x-session': session?.access_token || '' },
        timeout: 8_000,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || '删除失败');
      }
      toast.success('API Key 已删除');
      fetchKeys();
    } catch (err) {
      toast.error('删除失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const toggleKey = async (keyId: string, currentActive: boolean) => {
    try {
      const res = await fetchWithTimeout(`/api/v1/api-keys/${keyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session?.access_token || '',
        },
        body: JSON.stringify({ is_active: !currentActive }),
        timeout: 8_000,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || '操作失败');
      }
      toast.success(currentActive ? '已禁用' : '已启用');
      fetchKeys();
    } catch (err) {
      toast.error('操作失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const toggleEditingScope = (scope: string) => {
    setEditingScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const saveKeyScopes = async (keyId: string) => {
    if (editingScopes.length === 0) {
      toast.error('请至少选择一个权限');
      return;
    }
    setIsSavingScopes(true);
    try {
      const res = await fetchWithTimeout(`/api/v1/api-keys/${keyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session?.access_token || '',
        },
        body: JSON.stringify({ scopes: editingScopes }),
        timeout: 8_000,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || '保存失败');
      }
      toast.success('权限已更新');
      setEditingKeyId(null);
      fetchKeys();
    } catch (err) {
      toast.error('保存失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsSavingScopes(false);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板 API 失败（HTTPS/权限问题），引导用户手动复制
      toast.error('复制失败，请手动选择文本并 Ctrl+C');
      // 选中 input 让用户便于手动复制
      try {
        const range = document.createRange();
        const codeEl = document.getElementById('created-key-code');
        if (codeEl) {
          range.selectNodeContents(codeEl);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      } catch {
        // ignore selection failures
      }
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-3">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">API Keys</h1>
        <button
          onClick={() => {
            if (!apiAccessEnabled) return;
            setNewKeyScopes(DEFAULT_NEW_KEY_SCOPES);
            setError(null);
            setShowCreateDialog(true);
          }}
          disabled={!apiAccessEnabled}
          className="px-3 py-2 md:py-1.5 text-xs font-medium text-white bg-[var(--color-accent)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-hover)] transition-colors tap-target disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + 新建 Key
        </button>
      </div>

      {/* API Access Disabled Banner */}
      {!isLoading && !loadError && !apiAccessEnabled && (
        <div className="mb-4 p-3 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 rounded-[var(--radius-md)]">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-[var(--color-warning)]">API 访问未启用</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                当前账号未开启 API 访问权限，无法创建 API Key。请联系管理员在后台用户管理中开启 API 访问。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowCreateDialog(false)}>
          <div
            className="w-full md:max-w-md bg-[var(--color-surface)] rounded-t-xl md:rounded-[var(--radius-lg)] p-5 md:p-6 safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">新建 API Key</h2>

            {createdKey ? (
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">请立即复制此 Key，它只会显示一次：</p>
                <div className="flex items-center gap-2 p-3 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]">
                  <code id="created-key-code" className="flex-1 text-xs font-mono text-[var(--color-text)] mobile-break-all break-all">{createdKey}</code>
                  <button
                    onClick={handleCopyKey}
                    className="px-2.5 py-1 text-xs text-[var(--color-accent)] hover:underline flex-shrink-0 tap-target"
                  >
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <button
                  onClick={() => { setShowCreateDialog(false); setCreatedKey(null); setCopied(false); }}
                  className="w-full mt-4 py-2 text-xs font-medium text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-hover)] tap-target"
                >
                  完成
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Key 名称</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="例如: 生产环境"
                  className="w-full px-3 py-2 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />

                <div className="mt-4">
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">有效期</label>
                  <div className="flex items-center gap-1.5 p-0.5 border border-[var(--color-border)] rounded-[var(--radius-md)] w-fit">
                    {([0, 7, 30, 90] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setNewKeyExpiryDays(d)}
                        className={`px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] transition-colors ${
                          newKeyExpiryDays === d
                            ? 'bg-[var(--color-accent)] text-white'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                        }`}
                      >
                        {d === 0 ? '永久' : `${d} 天`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-[var(--color-text-muted)]">权限范围</label>
                    <span className="text-[10px] text-[var(--color-text-subtle)]">
                      已选 {newKeyScopes.length} 项
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-[var(--color-border)] rounded-[var(--radius-md)] divide-y divide-[var(--color-border)]">
                    {SCOPE_GROUPS.map((group) => (
                      <div key={group.label} className="px-3 py-2">
                        <p className="text-[10px] font-medium text-[var(--color-text-subtle)] uppercase tracking-wide mb-1.5">{group.label}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {group.scopes.map((scope) => (
                            <label
                              key={scope.value}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={newKeyScopes.includes(scope.value)}
                                onChange={() => toggleScope(scope.value)}
                                className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                              />
                              <span className="text-xs text-[var(--color-text)]">{scope.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--color-text-subtle)]">
                    调用生成接口需要对应媒体类型权限与 models:read；范围过大有泄露风险，请按需勾选。
                  </p>
                </div>

                {error && <p className="mt-1.5 text-xs text-[var(--color-destructive)]">{error}</p>}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setShowCreateDialog(false)}
                    className="flex-1 py-2 text-xs font-medium text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-hover)] tap-target"
                  >
                    取消
                  </button>
                  <button
                    onClick={createKey}
                    disabled={!newKeyName.trim() || newKeyScopes.length === 0}
                    className="flex-1 py-2 text-xs font-medium text-white bg-[var(--color-accent)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 tap-target"
                  >
                    创建
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={3} cols={6} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={fetchKeys} />
      ) : keys.length === 0 ? (
        <EmptyState message="暂无 API Key" />
      ) : (
        <>
          {/* Mobile: Card list */}
          <div className="md:hidden space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="p-3 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">{key.name}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    key.is_active
                      ? 'bg-[var(--color-success-subtle)] text-[var(--color-success)]'
                      : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-subtle)]'
                  }`}>
                    {key.is_active ? '活跃' : '已禁用'}
                  </span>
                </div>
                <p className="text-xs font-mono text-[var(--color-text-muted)] mb-2 mobile-break-all">{key.prefix}••••••••</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(key.scopes || []).slice(0, 4).map((scope) => (
                    <span key={scope} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      {scope}
                    </span>
                  ))}
                  {(key.scopes || []).length > 4 && (
                    <span className="text-[10px] text-[var(--color-text-subtle)]">+{key.scopes.length - 4}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--color-text-subtle)]">
                    创建于 {new Date(key.created_at).toLocaleDateString('zh-CN')}
                    {key.expires_at && (
                      <span className={
                        new Date(key.expires_at) < new Date()
                          ? 'text-[var(--color-destructive)] ml-1'
                          : 'ml-1'
                      }>
                        · {new Date(key.expires_at) < new Date() ? '已过期' : '过期于'} {new Date(key.expires_at).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingKeyId(editingKeyId === key.id ? null : key.id); setEditingScopes(key.scopes || []); }}
                      className="text-xs text-[var(--color-accent)] hover:underline tap-target"
                    >
                      {editingKeyId === key.id ? '收起' : '权限'}
                    </button>
                    <button
                      onClick={() => toggleKey(key.id, key.is_active)}
                      className="text-xs text-[var(--color-accent)] hover:underline tap-target"
                    >
                      {key.is_active ? '禁用' : '启用'}
                    </button>
                    <button
                      onClick={() => deleteKey(key.id)}
                      className="text-xs text-[var(--color-destructive)] hover:underline tap-target"
                    >
                      删除
                    </button>
                  </div>
                </div>
                {editingKeyId === key.id && (
                  <ScopeEditor
                    compact
                    scopes={editingScopes}
                    onToggle={toggleEditingScope}
                    onSave={() => saveKeyScopes(key.id)}
                    onCancel={() => setEditingKeyId(null)}
                    saving={isSavingScopes}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">名称</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">前缀</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">权限</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">状态</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">创建时间</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">最后使用</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <React.Fragment key={key.id}>
                  <tr className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-hover)]">
                    <td className="px-4 py-2.5 text-[var(--color-text)]">{key.name}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-text-muted)]">{key.prefix}••••••••</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-48">
                        {(key.scopes || []).slice(0, 3).map((scope) => (
                          <span key={scope} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                            {scope}
                          </span>
                        ))}
                        {(key.scopes || []).length > 3 && (
                          <span className="text-[10px] text-[var(--color-text-subtle)] self-center" title={(key.scopes || []).join(', ')}>
                            +{key.scopes.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        key.is_active
                          ? 'bg-[var(--color-success-subtle)] text-[var(--color-success)]'
                          : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-subtle)]'
                      }`}>
                        {key.is_active ? '活跃' : '已禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                      {new Date(key.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setEditingKeyId(editingKeyId === key.id ? null : key.id); setEditingScopes(key.scopes || []); }}
                          className="text-xs text-[var(--color-accent)] hover:underline"
                        >
                          {editingKeyId === key.id ? '收起' : '权限'}
                        </button>
                        <button onClick={() => toggleKey(key.id, key.is_active)} className="text-xs text-[var(--color-accent)] hover:underline">
                          {key.is_active ? '禁用' : '启用'}
                        </button>
                        <button onClick={() => deleteKey(key.id)} className="text-xs text-[var(--color-destructive)] hover:underline">
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingKeyId === key.id && (
                    <tr className="border-b border-[var(--color-border)] last:border-0">
                      <td colSpan={7} className="px-4 py-3 bg-[var(--color-surface-subtle)]">
                        <div className="max-w-md">
                          <ScopeEditor
                            scopes={editingScopes}
                            onToggle={toggleEditingScope}
                            onSave={() => saveKeyScopes(key.id)}
                            onCancel={() => setEditingKeyId(null)}
                            saving={isSavingScopes}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
