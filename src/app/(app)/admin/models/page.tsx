'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { ModelConfig, ProviderType } from '@/types';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { TableSkeleton, ErrorState } from '@/components/loading-states';
import {
  ConsolePage,
  ConsoleSection,
  ConsoleRow,
  CONSOLE_TOKENS,
  consoleInputStyle,
  consoleSelectStyle,
  consolePrimaryButton,
  consoleSecondaryButton,
  consoleTextActionButton,
} from '@/components/console';

type ModelForm = {
  code: string;
  display_name: string;
  provider_type: ProviderType;
  external_model_id: string;
  workflow_id: string;
  enabled: boolean;
  supports_text_to_image: boolean;
  supports_image_to_image: boolean;
  supports_multiple_references: boolean;
  supports_sequential_generation: boolean;
  supports_visible_watermark_control: boolean;
  supports_text_to_video: boolean;
  supports_image_to_video: boolean;
  supports_reference_video: boolean;
  supports_reference_audio: boolean;
  supported_sizes: string;
  supported_resolutions: string;
  supported_ratios: string;
  supported_durations: string;
  max_images_per_request: number;
  max_videos_per_request: number;
  max_provider_concurrency: number;
  timeout_seconds: number;
};

const defaultImageForm: ModelForm = {
  code: '', display_name: '', provider_type: 'mock', external_model_id: '',
  workflow_id: '', enabled: true,
  supports_text_to_image: true, supports_image_to_image: false,
  supports_multiple_references: false, supports_sequential_generation: false,
  supports_visible_watermark_control: false,
  supports_text_to_video: false, supports_image_to_video: false,
  supports_reference_video: false, supports_reference_audio: false,
  supported_sizes: '1024x1024,2048x2048', supported_resolutions: '',
  supported_ratios: '', supported_durations: '',
  max_images_per_request: 1, max_videos_per_request: 1,
  max_provider_concurrency: 2, timeout_seconds: 60,
};

const defaultVideoForm: ModelForm = {
  code: '', display_name: '', provider_type: 'coze_coding_video', external_model_id: '',
  workflow_id: '', enabled: true,
  supports_text_to_image: false, supports_image_to_image: false,
  supports_multiple_references: false, supports_sequential_generation: false,
  supports_visible_watermark_control: false,
  supports_text_to_video: true, supports_image_to_video: true,
  supports_reference_video: false, supports_reference_audio: false,
  supported_sizes: '', supported_resolutions: '480p,720p,1080p',
  supported_ratios: '16:9,9:16,1:1', supported_durations: '5,10',
  max_images_per_request: 1, max_videos_per_request: 1,
  max_provider_concurrency: 3, timeout_seconds: 600,
};

function isVideoProvider(pt: ProviderType): boolean {
  return pt === 'coze_coding_video';
}

function getVideoCapabilities(meta: Record<string, unknown> | null): {
  resolutions: string[];
  ratios: string[];
  durations: number[];
} {
  if (!meta) return { resolutions: [], ratios: [], durations: [] };
  return {
    resolutions: Array.isArray(meta.supported_resolutions) ? meta.supported_resolutions as string[] : [],
    ratios: Array.isArray(meta.supported_ratios) ? meta.supported_ratios as string[] : [],
    durations: Array.isArray(meta.supported_durations) ? meta.supported_durations as number[] : [],
  };
}

/* ── Inline form field wrapper ──────────────────────────────── */
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: CONSOLE_TOKENS.textSecondary,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  ...consoleInputStyle,
  width: '100%',
  padding: '0 10px',
};

const selectStyle: React.CSSProperties = {
  ...consoleSelectStyle,
  width: '100%',
};

/* ── Page ───────────────────────────────────────────────────── */
export default function AdminModelsPage() {
  const { isAdmin, session } = useAuth();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [form, setForm] = useState<ModelForm>(defaultImageForm);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout('/api/admin/models', {
        headers: { 'x-session': session?.access_token || '' },
        timeout: 10_000,
      });
      if (res.ok) {
        const data = await res.json();
        setModels(data.data?.models || []);
      } else {
        throw new Error('获取模型列表失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (isAdmin) fetchModels();
  }, [isAdmin, fetchModels]);

  const handleProviderTypeChange = (newType: ProviderType) => {
    if (isVideoProvider(newType)) {
      setForm(prev => ({
        ...prev,
        provider_type: newType,
        supports_text_to_image: false,
        supports_image_to_image: false,
        supports_text_to_video: prev.supports_text_to_video || true,
        supports_image_to_video: prev.supports_image_to_video || true,
      }));
    } else {
      setForm(prev => ({
        ...prev,
        provider_type: newType,
        supports_text_to_video: false,
        supports_image_to_video: false,
        supports_reference_video: false,
        supports_reference_audio: false,
        supports_text_to_image: prev.supports_text_to_image || true,
      }));
    }
  };

  const handleSave = async () => {
    try {
      const isVideo = isVideoProvider(form.provider_type);
      const baseBody: Record<string, unknown> = {
        code: form.code,
        display_name: form.display_name,
        provider_type: form.provider_type,
        external_model_id: form.external_model_id,
        workflow_id: form.workflow_id,
        enabled: form.enabled,
        supports_multiple_references: form.supports_multiple_references,
        supports_sequential_generation: form.supports_sequential_generation,
        supports_visible_watermark_control: form.supports_visible_watermark_control,
        max_provider_concurrency: form.max_provider_concurrency,
        timeout_seconds: form.timeout_seconds,
      };

      if (isVideo) {
        baseBody.supports_text_to_image = false;
        baseBody.supports_image_to_image = false;
        baseBody.supports_text_to_video = form.supports_text_to_video;
        baseBody.supports_image_to_video = form.supports_image_to_video;
        baseBody.supported_sizes = [];
        baseBody.max_images_per_request = 0;
        baseBody.max_videos_per_request = form.max_videos_per_request;
        const capMeta: Record<string, unknown> = {
          media_type: 'video',
          description: form.display_name,
          supports_text_to_video: form.supports_text_to_video,
          supports_image_to_video: form.supports_image_to_video,
          supports_multiple_references: form.supports_multiple_references,
          supports_reference_video: form.supports_reference_video,
          supports_reference_audio: form.supports_reference_audio,
        };
        if (form.supported_resolutions.trim()) {
          capMeta.supported_resolutions = form.supported_resolutions.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (form.supported_ratios.trim()) {
          capMeta.supported_ratios = form.supported_ratios.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (form.supported_durations.trim()) {
          capMeta.supported_durations = form.supported_durations.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        }
        baseBody.capability_metadata = capMeta;
      } else {
        baseBody.supports_text_to_image = form.supports_text_to_image;
        baseBody.supports_image_to_image = form.supports_image_to_image;
        baseBody.supports_text_to_video = false;
        baseBody.supports_image_to_video = false;
        baseBody.supported_sizes = form.supported_sizes.split(',').map(s => s.trim()).filter(Boolean);
        baseBody.max_images_per_request = form.max_images_per_request;
      }

      const url = editingModel ? `/api/admin/models/${editingModel.id}` : '/api/admin/models';
      const method = editingModel ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-session': session?.access_token || '',
        },
        body: JSON.stringify(baseBody),
      });

      if (res.ok) {
        toast.success(editingModel ? '模型已更新' : '模型已创建');
        setShowCreate(false);
        setEditingModel(null);
        fetchModels();
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || '保存失败');
      }
    } catch (err) {
      toast.error('保存失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const handleHealthCheck = async (modelId: string) => {
    try {
      const res = await fetch(`/api/admin/models/${modelId}/health-check`, {
        method: 'POST',
        headers: { 'x-session': session?.access_token || '' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || '健康检查失败');
      }
      const data = await res.json().catch(() => ({}));
      toast.success(data.data?.message || '健康检查完成');
      fetchModels();
    } catch (err) {
      toast.error('健康检查失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const startEdit = (model: ModelConfig) => {
    const isVideo = isVideoProvider(model.provider_type);
    const videoCaps = getVideoCapabilities(model.capability_metadata as Record<string, unknown> | null);

    setEditingModel(model);
    setForm({
      code: model.code,
      display_name: model.display_name,
      provider_type: model.provider_type,
      external_model_id: model.external_model_id || '',
      workflow_id: model.workflow_id || '',
      enabled: model.enabled,
      supports_text_to_image: model.supports_text_to_image,
      supports_image_to_image: model.supports_image_to_image,
      supports_multiple_references: model.supports_multiple_references,
      supports_sequential_generation: model.supports_sequential_generation,
      supports_visible_watermark_control: model.supports_visible_watermark_control,
      supports_text_to_video: model.supports_text_to_video || (videoCaps.resolutions.length > 0),
      supports_image_to_video: model.supports_image_to_video || (videoCaps.resolutions.length > 0),
      supports_reference_video: videoCaps.resolutions.length > 0 && !!(model.capability_metadata as Record<string, unknown>)?.supports_reference_video,
      supports_reference_audio: videoCaps.resolutions.length > 0 && !!(model.capability_metadata as Record<string, unknown>)?.supports_reference_audio,
      supported_sizes: model.supported_sizes?.join(',') || '',
      supported_resolutions: videoCaps.resolutions.join(',') || '',
      supported_ratios: videoCaps.ratios.join(',') || '',
      supported_durations: videoCaps.durations.join(',') || '',
      max_images_per_request: model.max_images_per_request,
      max_videos_per_request: (model.capability_metadata as Record<string, unknown>)?.max_videos_per_request as number || 1,
      max_provider_concurrency: model.max_provider_concurrency,
      timeout_seconds: model.timeout_seconds,
    });
  };

  if (!isAdmin) return null;

  const isVideo = isVideoProvider(form.provider_type);

  return (
    <ConsolePage
      title="模型配置"
      actions={
        <button
          type="button"
          onClick={() => {
            setEditingModel(null);
            setForm(defaultImageForm);
            setShowCreate(true);
          }}
          style={consolePrimaryButton}
        >
          添加模型
        </button>
      }
    >
      {/* Create/Edit Form */}
      {(showCreate || editingModel) && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2
            style={{
              fontSize: 16,
              lineHeight: '24px',
              fontWeight: 600,
              color: CONSOLE_TOKENS.textPrimary,
              margin: 0,
            }}
          >
            {editingModel ? '编辑模型' : '添加模型'}
          </h2>
          <div
            style={{
              background: CONSOLE_TOKENS.containerBg,
              border: `1px solid ${CONSOLE_TOKENS.border}`,
              borderRadius: 12,
              padding: 20,
            }}
          >
            {/* Fields grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>内部代码</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={!!editingModel}
                  style={{ ...inputStyle, opacity: editingModel ? 0.5 : 1 }}
                />
              </div>
              <div>
                <label style={labelStyle}>显示名称</label>
                <input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Provider 类型</label>
                <select
                  value={form.provider_type}
                  onChange={(e) => handleProviderTypeChange(e.target.value as ProviderType)}
                  style={selectStyle}
                >
                  <option value="mock">Mock</option>
                  <option value="coze_coding">Coze Coding SDK (图像)</option>
                  <option value="coze_coding_video">Coze Coding SDK (视频)</option>
                  <option value="coze_workflow">Coze Workflow</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>外部模型 ID</label>
                <input
                  value={form.external_model_id}
                  onChange={(e) => setForm({ ...form, external_model_id: e.target.value })}
                  placeholder={isVideo ? '如: doubao-seedance-1-5-pro-251215' : '如: image-pro'}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Workflow ID</label>
                <input
                  value={form.workflow_id}
                  onChange={(e) => setForm({ ...form, workflow_id: e.target.value })}
                  style={inputStyle}
                />
              </div>

              {/* Image-specific */}
              {!isVideo && (
                <div>
                  <label style={labelStyle}>支持尺寸（逗号分隔）</label>
                  <input
                    value={form.supported_sizes}
                    onChange={(e) => setForm({ ...form, supported_sizes: e.target.value })}
                    placeholder="1024x1024,2048x2048,2K,4K"
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Video-specific */}
              {isVideo && (
                <>
                  <div>
                    <label style={labelStyle}>支持分辨率（逗号分隔）</label>
                    <input
                      value={form.supported_resolutions}
                      onChange={(e) => setForm({ ...form, supported_resolutions: e.target.value })}
                      placeholder="480p,720p,1080p"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>支持比例（逗号分隔）</label>
                    <input
                      value={form.supported_ratios}
                      onChange={(e) => setForm({ ...form, supported_ratios: e.target.value })}
                      placeholder="16:9,9:16,1:1"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>支持时长（秒，逗号分隔）</label>
                    <input
                      value={form.supported_durations}
                      onChange={(e) => setForm({ ...form, supported_durations: e.target.value })}
                      placeholder="5,10"
                      style={inputStyle}
                    />
                  </div>
                </>
              )}

              <div>
                <label style={labelStyle}>
                  {isVideo ? '最大视频数/请求' : '最大生成数/请求'}
                </label>
                <input
                  type="number"
                  value={isVideo ? form.max_videos_per_request : form.max_images_per_request}
                  onChange={(e) =>
                    isVideo
                      ? setForm({ ...form, max_videos_per_request: Number(e.target.value) })
                      : setForm({ ...form, max_images_per_request: Number(e.target.value) })
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>超时（秒）</label>
                <input
                  type="number"
                  value={form.timeout_seconds}
                  onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Capability toggles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
              {(isVideo
                ? [
                    { key: 'enabled' as const, label: '启用' },
                    { key: 'supports_text_to_video' as const, label: '文生视频' },
                    { key: 'supports_image_to_video' as const, label: '图生视频' },
                    { key: 'supports_multiple_references' as const, label: '多参考图' },
                    { key: 'supports_reference_video' as const, label: '参考视频' },
                    { key: 'supports_reference_audio' as const, label: '参考音频' },
                  ]
                : [
                    { key: 'enabled' as const, label: '启用' },
                    { key: 'supports_text_to_image' as const, label: '文生图' },
                    { key: 'supports_image_to_image' as const, label: '图生图' },
                    { key: 'supports_multiple_references' as const, label: '多参考图' },
                    { key: 'supports_visible_watermark_control' as const, label: '水印控制' },
                  ]
              ).map(({ key, label }) => (
                <label
                  key={key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: CONSOLE_TOKENS.textSecondary,
                    cursor: 'pointer',
                    padding: '4px 0',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form[key] as boolean}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    style={{ accentColor: CONSOLE_TOKENS.accent }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* Form actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16,
                paddingTop: 16,
                borderTop: `1px solid ${CONSOLE_TOKENS.rowBorder}`,
              }}
            >
              <button
                type="button"
                onClick={() => { setShowCreate(false); setEditingModel(null); }}
                style={consoleSecondaryButton}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={consolePrimaryButton}
              >
                保存
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Model List */}
      <ConsoleSection
        title={models.length > 0 ? `模型列表（${models.length}）` : undefined}
      >
        {isLoading ? (
          <div style={{ padding: '14px 20px' }}>
            <TableSkeleton rows={4} cols={4} />
          </div>
        ) : error ? (
          <div style={{ padding: '14px 20px' }}>
            <ErrorState message={error} onRetry={fetchModels} />
          </div>
        ) : models.length === 0 ? (
          <div
            style={{
              padding: '32px 20px',
              textAlign: 'center',
              fontSize: 13,
              color: CONSOLE_TOKENS.textSecondary,
            }}
          >
            暂无模型配置
          </div>
        ) : (
          models.map((model, idx) => {
            const isV = isVideoProvider(model.provider_type);
            const vCaps = getVideoCapabilities(model.capability_metadata as Record<string, unknown> | null);
            const isLast = idx === models.length - 1;

            return (
              <ConsoleRow key={model.id} isLast={isLast}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    gap: 12,
                  }}
                >
                  {/* Left: status dot + info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: model.enabled
                          ? 'oklch(0.6 0.18 155)'
                          : CONSOLE_TOKENS.textSecondary,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: CONSOLE_TOKENS.textPrimary,
                        }}
                      >
                        {model.display_name}
                      </span>
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color: CONSOLE_TOKENS.textSecondary,
                        }}
                      >
                        {model.code}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        flexShrink: 0,
                        background: isV ? 'rgba(168,85,247,0.1)' : CONSOLE_TOKENS.pageBg,
                        color: isV ? '#A855F7' : CONSOLE_TOKENS.textSecondary,
                      }}
                    >
                      {isV ? '视频' : model.provider_type}
                    </span>
                  </div>

                  {/* Right: actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleHealthCheck(model.id)}
                      style={consoleTextActionButton}
                    >
                      健康检查
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(model)}
                      style={consoleTextActionButton}
                    >
                      编辑
                    </button>
                  </div>
                </div>

                {/* Capability tags */}
                <div
                  style={{
                    marginTop: 6,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 12px',
                    fontSize: 11,
                    color: CONSOLE_TOKENS.textSecondary,
                  }}
                >
                  {!isV ? (
                    <>
                      {model.supports_text_to_image && <span>文生图</span>}
                      {model.supports_image_to_image && <span>图生图</span>}
                      {model.supports_multiple_references && <span>多参考图</span>}
                      {model.supports_visible_watermark_control && <span>水印控制</span>}
                      {model.supported_sizes && model.supported_sizes.length > 0 && (
                        <span>尺寸: {model.supported_sizes.join(', ')}</span>
                      )}
                      <span>最大: {model.max_images_per_request}张</span>
                    </>
                  ) : (
                    <>
                      {(model.supports_text_to_video || vCaps.resolutions.length > 0) && <span>文生视频</span>}
                      {(model.supports_image_to_video || vCaps.resolutions.length > 0) && <span>图生视频</span>}
                      {(model.capability_metadata as Record<string, unknown>)?.supports_reference_video && <span>参考视频</span>}
                      {(model.capability_metadata as Record<string, unknown>)?.supports_reference_audio && <span>参考音频</span>}
                      {vCaps.resolutions.length > 0 && <span>分辨率: {vCaps.resolutions.join(', ')}</span>}
                      {vCaps.ratios.length > 0 && <span>比例: {vCaps.ratios.join(', ')}</span>}
                      {vCaps.durations.length > 0 && <span>时长: {vCaps.durations.join(', ')}s</span>}
                    </>
                  )}
                </div>
              </ConsoleRow>
            );
          })
        )}
      </ConsoleSection>
    </ConsolePage>
  );
}