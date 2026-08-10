'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { ModelConfig, ProviderType } from '@/types';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { TableSkeleton, ErrorState, EmptyState } from '@/components/loading-states';

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
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-3">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">模型配置</h1>
        <button
          onClick={() => {
            setEditingModel(null);
            setForm(defaultImageForm);
            setShowCreate(true);
          }}
          className="px-3 py-2 md:py-1.5 text-xs font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] tap-target self-start"
        >
          添加模型
        </button>
      </div>

      {/* Create/Edit Form */}
      {(showCreate || editingModel) && (
        <div className="mb-4 md:mb-6 p-4 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)]">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3">
            {editingModel ? '编辑模型' : '添加模型'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">内部代码</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                disabled={!!editingModel}
                className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)] disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">显示名称</label>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Provider 类型</label>
              <select value={form.provider_type} onChange={(e) => handleProviderTypeChange(e.target.value as ProviderType)}
                className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]">
                <option value="mock">Mock</option>
                <option value="coze_coding">Coze Coding SDK (图像)</option>
                <option value="coze_coding_video">Coze Coding SDK (视频)</option>
                <option value="coze_workflow">Coze Workflow</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">外部模型 ID</label>
              <input value={form.external_model_id} onChange={(e) => setForm({ ...form, external_model_id: e.target.value })}
                placeholder={isVideo ? '如: doubao-seedance-1-5-pro-251215' : '如: image-pro'}
                className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Workflow ID</label>
              <input value={form.workflow_id} onChange={(e) => setForm({ ...form, workflow_id: e.target.value })}
                className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
            </div>

            {/* Image-specific fields */}
            {!isVideo && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">支持尺寸（逗号分隔）</label>
                <input value={form.supported_sizes} onChange={(e) => setForm({ ...form, supported_sizes: e.target.value })}
                  placeholder="1024x1024,2048x2048,2K,4K"
                  className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
              </div>
            )}

            {/* Video-specific fields */}
            {isVideo && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">支持分辨率（逗号分隔）</label>
                  <input value={form.supported_resolutions} onChange={(e) => setForm({ ...form, supported_resolutions: e.target.value })}
                    placeholder="480p,720p,1080p"
                    className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">支持比例（逗号分隔）</label>
                  <input value={form.supported_ratios} onChange={(e) => setForm({ ...form, supported_ratios: e.target.value })}
                    placeholder="16:9,9:16,1:1"
                    className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">支持时长（秒，逗号分隔）</label>
                  <input value={form.supported_durations} onChange={(e) => setForm({ ...form, supported_durations: e.target.value })}
                    placeholder="5,10"
                    className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                {isVideo ? '最大视频数/请求' : '最大生成数/请求'}
              </label>
              <input type="number" value={isVideo ? form.max_videos_per_request : form.max_images_per_request}
                onChange={(e) => isVideo
                  ? setForm({ ...form, max_videos_per_request: Number(e.target.value) })
                  : setForm({ ...form, max_images_per_request: Number(e.target.value) })}
                className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">超时(秒)</label>
              <input type="number" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })}
                className="w-full px-3 py-2 md:py-1.5 text-sm bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)]" />
            </div>
          </div>

          {/* Capability toggles */}
          <div className="flex flex-wrap gap-3 mt-3">
            {!isVideo ? (
              [
                { key: 'enabled' as const, label: '启用' },
                { key: 'supports_text_to_image' as const, label: '文生图' },
                { key: 'supports_image_to_image' as const, label: '图生图' },
                { key: 'supports_multiple_references' as const, label: '多参考图' },
                { key: 'supports_visible_watermark_control' as const, label: '水印控制' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] tap-target py-1">
                  <input type="checkbox" checked={form[key] as boolean}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                  {label}
                </label>
              ))
            ) : (
              [
                { key: 'enabled' as const, label: '启用' },
                { key: 'supports_text_to_video' as const, label: '文生视频' },
                { key: 'supports_image_to_video' as const, label: '图生视频' },
                { key: 'supports_multiple_references' as const, label: '多参考图' },
                { key: 'supports_reference_video' as const, label: '参考视频' },
                { key: 'supports_reference_audio' as const, label: '参考音频' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] tap-target py-1">
                  <input type="checkbox" checked={form[key] as boolean}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                  {label}
                </label>
              ))
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 mt-4 sm:justify-end">
            <button onClick={() => { setShowCreate(false); setEditingModel(null); }}
              className="px-3 py-2 md:py-1.5 text-xs border border-[var(--color-border)] rounded-[var(--radius-sm)] tap-target">取消</button>
            <button onClick={handleSave}
              className="px-3 py-2 md:py-1.5 text-xs text-white bg-[var(--color-accent)] rounded-[var(--radius-sm)] tap-target">保存</button>
          </div>
        </div>
      )}

      {/* Models List */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchModels} />
      ) : models.length === 0 ? (
        <div className="text-sm text-[var(--color-text-subtle)] py-8 text-center">暂无模型配置</div>
      ) : (
        <div className="space-y-2">
          {models.map((model) => {
            const isV = isVideoProvider(model.provider_type);
            const vCaps = getVideoCapabilities(model.capability_metadata as Record<string, unknown> | null);
            return (
              <div key={model.id} className="p-3 border border-[var(--color-border)] rounded-[var(--radius-md)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${model.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-subtle)]'}`} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-[var(--color-text)]">{model.display_name}</span>
                      <span className="ml-2 text-xs text-[var(--color-text-subtle)] mobile-break-all">{model.code}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                      isV
                        ? 'text-purple-400 bg-purple-500/10'
                        : 'text-[var(--color-text-subtle)] bg-[var(--color-surface-subtle)]'
                    }`}>
                      {isV ? '视频' : model.provider_type}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4 sm:ml-0">
                    <button onClick={() => handleHealthCheck(model.id)}
                      className="text-xs text-[var(--color-accent)] hover:underline tap-target">健康检查</button>
                    <button onClick={() => startEdit(model)}
                      className="text-xs text-[var(--color-accent)] hover:underline tap-target">编辑</button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--color-text-subtle)]">
                  {!isV ? (
                    <>
                      {model.supports_text_to_image && <span>文生图</span>}
                      {model.supports_image_to_image && <span>图生图</span>}
                      {model.supports_multiple_references && <span>多参考图</span>}
                      {model.supports_visible_watermark_control && <span>水印控制</span>}
                      <span>尺寸: {model.supported_sizes?.join(', ')}</span>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
