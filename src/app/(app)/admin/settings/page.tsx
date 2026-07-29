'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { PageSkeleton, ErrorState } from '@/components/loading-states';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';

interface SystemSettings {
  [key: string]: { value: string; description: string | null };
}

const SETTING_LABELS: Record<string, string> = {
  generation_enabled: '全局生成开关',
  api_enabled: 'API 总开关',
  public_registration_enabled: '公开注册',
  default_daily_limit: '默认每日额度',
  default_monthly_limit: '默认每月额度',
  default_max_concurrency: '默认最大并发',
  prompt_logging_mode: 'Prompt 日志模式',
  default_retention_days: '默认数据保留天数',
  maintenance_message: '维护公告',
};

const SETTING_DESCRIPTIONS: Record<string, string> = {
  generation_enabled: '关闭后不再接受新生成任务',
  api_enabled: '关闭后所有 API 请求将被拒绝',
  public_registration_enabled: '开启后允许用户自行注册账号',
  default_daily_limit: '新用户默认每日可生成图片数',
  default_monthly_limit: '新用户默认每月可生成图片数',
  default_max_concurrency: '单个用户同时执行的最大任务数',
  prompt_logging_mode: 'full=完整记录 / redacted=脱敏 / disabled=不记录',
  default_retention_days: '生成记录和图片的保留天数',
  maintenance_message: '维护时显示给用户的公告信息，留空则不显示',
};

const SETTING_GROUPS = [
  {
    title: '生成与 API',
    keys: ['generation_enabled', 'api_enabled'],
  },
  {
    title: '用户与额度',
    keys: ['public_registration_enabled', 'default_daily_limit', 'default_monthly_limit', 'default_max_concurrency', 'default_retention_days'],
  },
  {
    title: '日志与公告',
    keys: ['prompt_logging_mode', 'maintenance_message'],
  },
];

// Default values for settings not yet in DB
const SETTING_DEFAULTS: Record<string, string> = {
  generation_enabled: 'true',
  api_enabled: 'true',
  public_registration_enabled: 'false',
  default_daily_limit: '50',
  default_monthly_limit: '500',
  default_max_concurrency: '3',
  prompt_logging_mode: 'redacted',
  default_retention_days: '90',
  maintenance_message: '',
};

const TEXT_SETTING_KEYS = ['maintenance_message', 'prompt_logging_mode'];
const DANGER_RED = '#B42318';
const ACCENT_COLOR = '#006699';

/* ── Standard Switch (44×24 track, 18px thumb) ───────────────────── */
function SettingSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '9999px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 160ms ease-out',
        background: checked ? ACCENT_COLOR : 'rgba(26,26,26,0.16)',
        flexShrink: 0,
        position: 'relative',
        padding: 0,
      }}
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 3px ${ACCENT_COLOR}33`; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <span
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '9999px',
          background: '#FFFFFF',
          display: 'block',
          transform: checked ? 'translateX(23px)' : 'translateX(3px)',
          transition: 'transform 160ms ease-out',
          marginTop: '3px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

export default function AdminSettingsPage() {
  const { isAdmin, session } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDangerDialog, setShowDangerDialog] = useState(false);
  const [dangerActionPending, setDangerActionPending] = useState(false);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchWithTimeout('/api/admin/settings', {
        headers: { 'x-session': session?.access_token || '' },
        timeout: 10_000,
      });
      if (res.ok) {
        const json = await res.json();
        const rawSettings = json.data?.settings || [];
        const mapped: SystemSettings = {};
        const edits: Record<string, string> = {};
        for (const s of rawSettings) {
          if (s.key && s.key in SETTING_LABELS) {
            mapped[s.key] = { value: s.value ?? '', description: s.description };
            edits[s.key] = s.value ?? '';
          }
        }
        for (const key of Object.keys(SETTING_LABELS)) {
          if (!(key in mapped)) {
            mapped[key] = { value: SETTING_DEFAULTS[key] ?? '', description: SETTING_DESCRIPTIONS[key] ?? null };
            edits[key] = SETTING_DEFAULTS[key] ?? '';
          }
        }
        setSettings(mapped);
        setEditValues(edits);
      } else {
        throw new Error('获取系统设置失败');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchSettings();
  }, [isAdmin, fetchSettings]);

  const isBoolean = (value: string) => value === 'true' || value === 'false';

  /* ── Global dirty state ───────────────────────────────────────── */
  const changedKeys = useMemo(() => {
    return Object.keys(editValues).filter((key) => {
      const original = settings[key]?.value ?? SETTING_DEFAULTS[key] ?? '';
      return editValues[key] !== original;
    });
  }, [editValues, settings]);
  const isDirty = changedKeys.length > 0;

  const handleInputChange = (key: string, newValue: string) => {
    setEditValues((prev) => ({ ...prev, [key]: newValue }));
  };

  const handleCancel = () => {
    const reset: Record<string, string> = {};
    for (const key of Object.keys(SETTING_LABELS)) {
      reset[key] = settings[key]?.value ?? SETTING_DEFAULTS[key] ?? '';
    }
    setEditValues(reset);
  };

  const handleSaveAll = async () => {
    if (changedKeys.length === 0 || isSaving) return;
    setIsSaving(true);
    let failedCount = 0;
    const errors: string[] = [];

    for (const key of changedKeys) {
      try {
        const res = await fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-session': session?.access_token || '',
          },
          body: JSON.stringify({ key, value: editValues[key] }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          errors.push(`${SETTING_LABELS[key]}: ${json.error?.message || '保存失败'}`);
          failedCount++;
        }
      } catch {
        errors.push(`${SETTING_LABELS[key]}: 网络错误`);
        failedCount++;
      }
    }

    if (failedCount === 0) {
      toast.success('设置已保存');
      await fetchSettings();
    } else {
      const msg = failedCount === changedKeys.length
        ? `保存失败：${errors[0]}`
        : `部分保存失败（${failedCount}/${changedKeys.length}）`;
      toast.error(msg, { description: errors.length > 1 ? errors.slice(1).join('\n') : undefined });
      await fetchSettings();
    }
    setIsSaving(false);
  };

  /* ── Danger Zone: Emergency Stop ──────────────────────────────── */
  const isGenerating = settings.generation_enabled?.value === 'true';
  const handleDangerConfirm = async () => {
    setDangerActionPending(true);
    try {
      const newValue = isGenerating ? 'false' : 'true';
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session?.access_token || '',
        },
        body: JSON.stringify({ key: 'generation_enabled', value: newValue }),
      });
      if (res.ok) {
        toast.success(isGenerating ? '生成服务已停止' : '生成服务已恢复');
        await fetchSettings();
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.message || '操作失败');
      }
    } catch {
      toast.error('网络错误，操作失败');
    } finally {
      setDangerActionPending(false);
      setShowDangerDialog(false);
    }
  };

  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <div style={{ background: '#F5F5F5', minHeight: '100%' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
          <h1 style={{ fontSize: '24px', lineHeight: '32px', fontWeight: 650, color: '#1A1A1A', marginBottom: '24px' }}>系统设置</h1>
          <PageSkeleton />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ background: '#F5F5F5', minHeight: '100%' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
          <h1 style={{ fontSize: '24px', lineHeight: '32px', fontWeight: 650, color: '#1A1A1A', marginBottom: '24px' }}>系统设置</h1>
          <ErrorState message={loadError} onRetry={fetchSettings} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#F5F5F5', minHeight: '100%', paddingBottom: isDirty ? '80px' : undefined }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Page Title */}
        <h1 style={{ fontSize: '24px', lineHeight: '32px', fontWeight: 650, color: '#1A1A1A', marginBottom: '24px' }}>
          系统设置
        </h1>

        {/* Setting Groups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {SETTING_GROUPS.map((group) => {
            const groupSettings = group.keys
              .filter((key) => key in settings)
              .map((key) => ({ key, ...settings[key] }));
            if (groupSettings.length === 0) return null;

            return (
              <div key={group.title}>
                {/* Section Title */}
                <h2 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: '#1A1A1A', marginBottom: '12px' }}>
                  {group.title}
                </h2>
                {/* White Container */}
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(26,26,26,0.08)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}>
                  {groupSettings.map((setting, idx) => {
                    const bool = isBoolean(setting.value);
                    const editValue = editValues[setting.key] ?? setting.value;
                    const isLast = idx === groupSettings.length - 1;

                    return (
                      <div
                        key={setting.key}
                        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4"
                        style={{
                          padding: '14px 20px',
                          borderBottom: isLast ? 'none' : '1px solid rgba(26,26,26,0.06)',
                        }}
                      >
                        {/* Left: Title + Description */}
                        <div className="flex-1 md:min-w-[240px]" style={{ minWidth: '0' }}>
                          <div style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, color: '#1A1A1A' }}>
                            {SETTING_LABELS[setting.key] || setting.key}
                          </div>
                          <div style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)', marginTop: '2px' }}>
                            {SETTING_DESCRIPTIONS[setting.key] || setting.description}
                          </div>
                        </div>

                        {/* Right: Control */}
                        <div className="flex w-full justify-start md:w-[220px] md:justify-end md:shrink-0">
                          {bool ? (
                            <SettingSwitch
                              checked={editValue === 'true'}
                              onChange={(next) => handleInputChange(setting.key, next ? 'true' : 'false')}
                              disabled={isSaving}
                              label={SETTING_LABELS[setting.key]}
                            />
                          ) : (
                            <input
                              type={TEXT_SETTING_KEYS.includes(setting.key) ? 'text' : 'number'}
                              value={editValue}
                              onChange={(e) => handleInputChange(setting.key, e.target.value)}
                              style={{
                                height: '36px',
                                width: setting.key === 'maintenance_message' ? '220px' : '160px',
                                padding: '0 12px',
                                border: '1px solid rgba(26,26,26,0.14)',
                                borderRadius: '8px',
                                fontSize: '13px',
                                color: '#1A1A1A',
                                background: '#FFFFFF',
                                outline: 'none',
                                transition: 'border-color 160ms ease-out, box-shadow 160ms ease-out',
                                boxSizing: 'border-box',
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderColor = ACCENT_COLOR;
                                e.currentTarget.style.boxShadow = `0 0 0 3px ${ACCENT_COLOR}1a`;
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(26,26,26,0.14)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Danger Zone */}
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: '#1A1A1A', marginBottom: '12px' }}>
            危险操作
          </h2>
          <div style={{
            background: '#FFFFFF',
            border: `1px solid ${DANGER_RED}33`,
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, color: DANGER_RED, marginBottom: '4px' }}>
                  紧急停止
                </div>
                <div style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)' }}>
                  点击后将立即停止所有生成任务和 API 服务。已运行任务将继续执行，但不再接受新请求。用户端将显示维护说明。
                </div>
              </div>
              <button
                type="button"
                disabled={dangerActionPending}
                onClick={() => setShowDangerDialog(true)}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: `1px solid ${DANGER_RED}`,
                  background: isGenerating ? DANGER_RED : '#FFFFFF',
                  color: isGenerating ? '#FFFFFF' : DANGER_RED,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: dangerActionPending ? 'not-allowed' : 'pointer',
                  opacity: dangerActionPending ? 0.6 : 1,
                  transition: 'opacity 160ms ease-out, background 160ms ease-out',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 3px ${DANGER_RED}1a`; }}
                onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                onMouseEnter={(e) => {
                  if (!dangerActionPending) {
                    e.currentTarget.style.background = isGenerating ? '#8C1A12' : DANGER_RED + '0d';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isGenerating ? DANGER_RED : '#FFFFFF';
                }}
              >
                {dangerActionPending ? '处理中...' : isGenerating ? '紧急停止生成服务' : '恢复生成服务'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Save Bar */}
      {isDirty && (
        <div
          className="fixed bottom-0 left-0 right-0 md:left-[var(--sidebar-width)]"
          style={{
            background: '#FFFFFF',
            borderTop: '1px solid rgba(26,26,26,0.08)',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 30,
            boxShadow: '0 -1px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ marginLeft: 'auto', marginRight: 'auto', maxWidth: '960px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%' }}>
            <span style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)' }}>
              有未保存更改{changedKeys.length > 1 ? `（${changedKeys.length} 项）` : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(26,26,26,0.14)',
                  background: '#FFFFFF',
                  color: '#1A1A1A',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.5 : 1,
                  transition: 'background 160ms ease-out',
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                onMouseEnter={(e) => { if (!isSaving) e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isSaving}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#1A1A1A',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  transition: 'opacity 160ms ease-out',
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {isSaving ? '保存中...' : '保存更改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Confirmation Dialog */}
      <Dialog open={showDangerDialog} onOpenChange={setShowDangerDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: '16px', fontWeight: 600, color: DANGER_RED }}>
              确认{isGenerating ? '停止' : '恢复'}生成服务
            </DialogTitle>
            <DialogDescription style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)' }}>
              {isGenerating
                ? '此操作将立即停止所有生成任务和 API 服务。已运行任务将继续执行，但不再接受新请求。用户端将显示维护说明。'
                : '此操作将恢复生成和 API 服务，用户可以重新提交任务。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: '8px' }}>
            <DialogClose asChild>
              <button
                type="button"
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(26,26,26,0.14)',
                  background: '#FFFFFF',
                  color: '#1A1A1A',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={handleDangerConfirm}
              disabled={dangerActionPending}
              style={{
                height: '36px',
                padding: '0 16px',
                borderRadius: '8px',
                border: 'none',
                background: DANGER_RED,
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: dangerActionPending ? 'not-allowed' : 'pointer',
                opacity: dangerActionPending ? 0.6 : 1,
              }}
            >
              {dangerActionPending ? '处理中...' : `确认${isGenerating ? '停止' : '恢复'}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}