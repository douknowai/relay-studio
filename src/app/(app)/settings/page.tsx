'use client';

import React, { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { profile, session } = useAuth();
  const originalName = profile?.display_name || '';
  const [displayName, setDisplayName] = useState(originalName);
  const [savedName, setSavedName] = useState(originalName);
  const [isSaving, setIsSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const isDirty = useMemo(() => displayName.trim() !== savedName.trim(), [displayName, savedName]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetchWithTimeout('/api/v1/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session?.access_token || '',
        },
        body: JSON.stringify({ display_name: displayName.trim() || null }),
        timeout: 10_000,
      });
      if (res.ok) {
        setSavedName(displayName.trim());
        toast.success('设置已保存');
      } else {
        const data = await res.json();
        toast.error(data.error?.message || '保存失败');
      }
    } catch {
      toast.error('请求失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(savedName);
  };

  const handleUpdatePassword = async () => {
    const trimmed = newPassword.trim();
    if (trimmed.length < 8) {
      toast.error('密码至少需要 8 位');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: trimmed });
      if (error) {
        toast.error(error.message || '密码更新失败');
      } else {
        setNewPassword('');
        toast.success('密码已更新');
      }
    } catch {
      toast.error('请求失败');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div style={{ background: '#F5F5F5', minHeight: '100%', paddingBottom: isDirty ? '80px' : undefined }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Page Title */}
        <h1 style={{ fontSize: '24px', lineHeight: '32px', fontWeight: 650, color: '#1A1A1A', marginBottom: '24px' }}>
          个人设置
        </h1>

        {/* Profile Section */}
        <div>
          <h2 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: '#1A1A1A', marginBottom: '12px' }}>
            账户信息
          </h2>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(26,26,26,0.08)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {/* Display Name - editable */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4" style={{ padding: '14px 20px', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
              <div className="flex-1 md:min-w-[240px]" style={{ minWidth: '0' }}>
                <div style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, color: '#1A1A1A' }}>显示名称</div>
                <div style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)', marginTop: '2px' }}>用于工作台和任务列表的展示</div>
              </div>
              <div className="flex w-full justify-start md:w-[220px] md:justify-end md:shrink-0">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="输入显示名称"
                  style={{
                    height: '36px',
                    width: '220px',
                    maxWidth: '100%',
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#006699'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,102,153,0.1)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.14)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Email - read-only */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4" style={{ padding: '14px 20px', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
              <div className="flex-1 md:min-w-[240px]" style={{ minWidth: '0' }}>
                <div style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, color: '#1A1A1A' }}>邮箱</div>
                <div style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)', marginTop: '2px' }}>登录账号，不可修改</div>
              </div>
              <div className="flex w-full justify-start md:w-[220px] md:justify-end md:shrink-0">
                <div style={{ height: '36px', width: '220px', maxWidth: '100%', padding: '0 12px', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', lineHeight: '36px', color: 'rgba(26,26,26,0.5)', background: '#FAFAFA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                  {profile?.email || ''}
                </div>
              </div>
            </div>

            {/* Role - read-only */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4" style={{ padding: '14px 20px' }}>
              <div className="flex-1 md:min-w-[240px]" style={{ minWidth: '0' }}>
                <div style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, color: '#1A1A1A' }}>角色</div>
                <div style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)', marginTop: '2px' }}>当前账户权限等级</div>
              </div>
              <div className="flex w-full justify-start md:w-[220px] md:justify-end md:shrink-0">
                <div style={{ height: '36px', width: '220px', maxWidth: '100%', padding: '0 12px', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', lineHeight: '36px', color: 'rgba(26,26,26,0.5)', background: '#FAFAFA', boxSizing: 'border-box' }}>
                  {profile?.role === 'admin' ? '管理员' : '用户'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: '#1A1A1A', marginBottom: '12px' }}>
            安全
          </h2>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(26,26,26,0.08)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4" style={{ padding: '14px 20px' }}>
              <div className="flex-1 md:min-w-[240px]" style={{ minWidth: '0' }}>
                <div style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, color: '#1A1A1A' }}>修改密码</div>
                <div style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)', marginTop: '2px' }}>至少 8 位，更新后当前登录保持有效</div>
              </div>
              <div className="flex w-full items-center gap-2 md:w-[220px] md:shrink-0">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码"
                  autoComplete="new-password"
                  style={{
                    height: '36px',
                    flex: 1,
                    minWidth: '0',
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#006699'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,102,153,0.1)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.14)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={handleUpdatePassword}
                  disabled={isUpdatingPassword || newPassword.trim().length < 8}
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#1A1A1A',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: isUpdatingPassword || newPassword.trim().length < 8 ? 'not-allowed' : 'pointer',
                    opacity: isUpdatingPassword || newPassword.trim().length < 8 ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  {isUpdatingPassword ? '更新中...' : '更新'}
                </button>
              </div>
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
            justifyContent: 'center',
            zIndex: 30,
            boxShadow: '0 -1px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ marginLeft: 'auto', marginRight: 'auto', maxWidth: '960px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%' }}>
            <span style={{ fontSize: '13px', lineHeight: '18px', color: 'rgba(26,26,26,0.58)' }}>有未保存更改</span>
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
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
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
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {isSaving ? '保存中...' : '保存更改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
