export type VideoResolution = '480p' | '720p' | '1080p';
export type VideoRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive';

export interface VideoProviderCapabilities {
  supports_text_to_video: boolean;
  supports_image_to_video: boolean;
  supports_multiple_references: boolean;
  supported_resolutions: VideoResolution[];
  supported_ratios: VideoRatio[];
  max_videos_per_request: number;
}

export interface VideoContentItem {
  type: 'text';
  text: string;
}

export interface VideoImageContentItem {
  type: 'image_url';
  image_url: { url: string };
  role?: 'first_frame' | 'last_frame' | 'reference_image';
}

export interface VideoProviderRequest {
  prompt: string;
  model_id: string;
  resolution?: VideoResolution;
  ratio?: VideoRatio;
  duration?: number;
  watermark?: boolean;
  camerafixed?: boolean;
  generate_audio?: boolean;
  /** Signed URLs of first/last frame or reference images */
  reference_image_urls?: string[];
  /** Role for each reference image: first_frame / last_frame / reference_image */
  reference_image_roles?: ('first_frame' | 'last_frame' | 'reference_image')[];
  custom_headers?: Record<string, string>;
  max_wait_time?: number;
  /** Signed URLs of reference videos (Seedance 2.0, max 3) */
  reference_video_urls?: string[];
  /** Signed URLs of reference audios (Seedance 2.0, max 3) */
  reference_audio_urls?: string[];
}

export interface VideoProviderResult {
  success: boolean;
  video_url: string | null;
  last_frame_url: string | null;
  error_message: string;
  model: string;
  duration_seconds?: number;
  resolution?: string;
  ratio?: string;
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface VideoHealthResult {
  healthy: boolean;
  provider: string;
  latency_ms?: number;
  error?: string;
}

export interface VideoGenerationProvider {
  readonly name: string;
  getCapabilities(): Promise<VideoProviderCapabilities>;
  generate(request: VideoProviderRequest): Promise<VideoProviderResult>;
  healthCheck(): Promise<VideoHealthResult>;
}
