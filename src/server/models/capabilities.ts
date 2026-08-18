import { z } from 'zod';
import { AppError, ErrorCodes } from '@/server/errors';

/**
 * Model capability accessor — the single source of truth reader.
 *
 * Layering contract (see DESIGN.md / architecture notes):
 * - Gate semantics (authorization & validation booleans) live in DB columns.
 * - Param semantics (UI options: sizes / durations / ratios) live in
 *   capability_metadata JSON.
 * - No JSON field may express the same fact as a gate column.
 *
 * Legacy structure compatibility (supported_resolutions / supported_durations
 * vs min_duration / max_duration) is normalized HERE and nowhere else.
 */

/** Loose shape of a `model_configs` row as returned by Supabase. */
export type ModelConfigRow = Record<string, unknown>;

/** capability_metadata JSON — Param semantics only. */
const MetadataSchema = z
  .object({
    media_type: z.enum(['image', 'video']).optional(),
    supported_resolutions: z.array(z.string()).optional(),
    supported_ratios: z.array(z.string()).optional(),
    supported_durations: z.array(z.number()).optional(),
    min_duration: z.number().optional(),
    max_duration: z.number().optional(),
    default_resolution: z.string().optional(),
    default_ratio: z.string().optional(),
    default_duration: z.number().optional(),
    supports_reference_video: z.boolean().optional(),
    supports_reference_audio: z.boolean().optional(),
    generate_audio_default: z.boolean().optional(),
    max_videos_per_request: z.number().optional(),
    description: z.string().optional(),
  })
  .passthrough();

type ParsedMetadata = z.infer<typeof MetadataSchema>;

/** Fully normalized capabilities consumed by every read path. */
export type ModelCapabilities = {
  code: string;
  displayName: string;
  providerType: string;
  externalModelId: string;
  enabled: boolean;

  /** Routing discriminator: image pipeline vs video pipeline. */
  mediaType: 'image' | 'video';

  // ---- Gate (entity columns) ----
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  supportsMultipleReferences: boolean;
  supportsSequentialGeneration: boolean;
  supportsVisibleWatermarkControl: boolean;

  // ---- Param (normalized from capability_metadata) ----
  supportedSizes: string[];
  supportedRatios: string[];
  supportedDurations: number[];
  minDuration: number | null;
  maxDuration: number | null;
  defaultResolution: string | null;
  defaultRatio: string | null;
  defaultDuration: number | null;
  maxImagesPerRequest: number;
  maxVideosPerRequest: number;
  supportsReferenceVideo: boolean;
  supportsReferenceAudio: boolean;
  generateAudioDefault: boolean | null;
  description: string;
};

function parseMetadata(raw: unknown): ParsedMetadata {
  const result = MetadataSchema.safeParse(raw ?? {});
  return result.success ? result.data : {};
}

function boolOf(row: ModelConfigRow, key: string): boolean {
  const value = row[key];
  return typeof value === 'boolean' ? value : false;
}

function numOr(row: ModelConfigRow, key: string, fallback: number): number {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strOr(row: ModelConfigRow, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * Derive normalized capabilities from a raw `model_configs` row.
 *
 * mediaType precedence (routing discriminator):
 *   1. `media_type` entity column (canonical, added by migration)
 *   2. capability_metadata.media_type (transitional compatibility)
 *   3. provider_type heuristic ('...video...' => video)
 */
export function deriveCapabilities(row: ModelConfigRow): ModelCapabilities {
  const meta = parseMetadata(row.capability_metadata);
  const providerType = strOr(row, 'provider_type');

  const mediaType: 'image' | 'video' =
    row.media_type === 'video' || row.media_type === 'image'
      ? (row.media_type as 'image' | 'video')
      : meta.media_type ?? (providerType.includes('video') ? 'video' : 'image');

  // Resolution options: `supported_sizes` entity column first (same source
  // as images validation), then legacy capability_metadata.supported_resolutions.
  const sizesColumn = Array.isArray(row.supported_sizes)
    ? (row.supported_sizes as string[]).filter((s) => typeof s === 'string')
    : [];
  const supportedSizes =
    sizesColumn.length > 0
      ? sizesColumn
      : (meta.supported_resolutions ?? []).filter((s) => typeof s === 'string');

  // Duration options: explicit list first, then min/max range expansion.
  const minDuration = typeof meta.min_duration === 'number' ? meta.min_duration : null;
  const maxDuration = typeof meta.max_duration === 'number' ? meta.max_duration : null;
  let supportedDurations = (meta.supported_durations ?? []).filter(
    (d) => typeof d === 'number' && Number.isFinite(d)
  );
  if (supportedDurations.length === 0 && minDuration !== null && maxDuration !== null) {
    const lo = Math.ceil(minDuration);
    const hi = Math.floor(maxDuration);
    const range: number[] = [];
    for (let d = lo; d <= hi && range.length <= 64; d += 1) range.push(d);
    supportedDurations = range;
  }

  return {
    code: strOr(row, 'code'),
    displayName: strOr(row, 'display_name'),
    providerType,
    externalModelId: strOr(row, 'external_model_id'),
    enabled: boolOf(row, 'enabled'),

    mediaType,

    supportsTextToImage: boolOf(row, 'supports_text_to_image'),
    supportsImageToImage: boolOf(row, 'supports_image_to_image'),
    supportsTextToVideo: boolOf(row, 'supports_text_to_video'),
    supportsImageToVideo: boolOf(row, 'supports_image_to_video'),
    supportsMultipleReferences: boolOf(row, 'supports_multiple_references'),
    supportsSequentialGeneration: boolOf(row, 'supports_sequential_generation'),
    supportsVisibleWatermarkControl: boolOf(row, 'supports_visible_watermark_control'),

    supportedSizes,
    supportedRatios: (meta.supported_ratios ?? []).filter(
      (r) => typeof r === 'string'
    ),
    supportedDurations,
    minDuration,
    maxDuration,
    defaultResolution: meta.default_resolution ?? null,
    defaultRatio: meta.default_ratio ?? null,
    defaultDuration: meta.default_duration ?? null,
    maxImagesPerRequest: numOr(row, 'max_images_per_request', 0),
    maxVideosPerRequest: meta.max_videos_per_request ?? 0,
    supportsReferenceVideo: meta.supports_reference_video ?? false,
    supportsReferenceAudio: meta.supports_reference_audio ?? false,
    generateAudioDefault:
      typeof meta.generate_audio_default === 'boolean' ? meta.generate_audio_default : null,
    description: meta.description ?? '',
  };
}

/** Parameters for video generation gate checks. */
export interface VideoGenerationRequest {
  /** First-frame / first+last-frame reference image count. */
  referenceAssetCount: number;
  resolution: string | null;
  ratio: string | null;
  /** -1 means "not provided, use model default". */
  duration: number;
}

/**
 * Centralized video generation validation: media routing, capability gates,
 * resolution / ratio / duration range checks. Throws AppError on rejection.
 */
export function assertVideoGenerationSupported(
  caps: ModelCapabilities,
  req: VideoGenerationRequest
): { taskType: 'text_to_video' | 'image_to_video' | 'first_last_frame' } {
  if (caps.mediaType !== 'video') {
    throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不是视频模型');
  }

  // Task type from reference count + gate columns.
  let taskType: 'text_to_video' | 'image_to_video' | 'first_last_frame';
  if (req.referenceAssetCount >= 2) {
    taskType = 'first_last_frame';
    if (!caps.supportsMultipleReferences) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不支持首尾帧模式');
    }
  } else if (req.referenceAssetCount === 1) {
    taskType = 'image_to_video';
    if (!caps.supportsImageToVideo) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不支持图生视频');
    }
  } else {
    taskType = 'text_to_video';
    if (!caps.supportsTextToVideo) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, '此模型不支持文生视频');
    }
  }

  if (req.resolution && caps.supportedSizes.length > 0 && !caps.supportedSizes.includes(req.resolution)) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, '模型不支持此分辨率');
  }

  if (req.ratio && caps.supportedRatios.length > 0 && !caps.supportedRatios.includes(req.ratio)) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, '模型不支持此宽高比');
  }

  if (req.duration >= 0) {
    if (caps.minDuration !== null && req.duration < caps.minDuration) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, `时长不能小于 ${caps.minDuration} 秒`);
    }
    if (caps.maxDuration !== null && req.duration > caps.maxDuration) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, `时长不能超过 ${caps.maxDuration} 秒`);
    }
  }

  return { taskType };
}

/**
 * Consistency guard for write paths (admin CRUD): rejects attempts to change
 * routing/gate semantics via capability_metadata instead of entity columns.
 * Returns sanitized metadata with gate-semantics fields stripped.
 */
const METADATA_GATE_FIELDS = ['media_type', 'supports_text_to_video', 'supports_image_to_video'] as const;

export function sanitizeMetadataForWrite(
  metadata: Record<string, unknown>,
  options: { strict: boolean }
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...metadata };
  for (const field of METADATA_GATE_FIELDS) {
    if (field in next) {
      if (options.strict) {
        throw new AppError(
          ErrorCodes.INVALID_REQUEST,
          `capability_metadata.${field} 属于判定语义，请通过对应的实体列修改，不允许写入 JSON`
        );
      }
      delete next[field];
    }
  }
  return next;
}
