import { VideoGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import {
  VideoGenerationProvider,
  VideoProviderCapabilities,
  VideoProviderRequest,
  VideoProviderResult,
  VideoHealthResult,
} from './types';

export class CozeCodingVideoProvider implements VideoGenerationProvider {
  readonly name = 'coze-coding-sdk';

  async getCapabilities(): Promise<VideoProviderCapabilities> {
    return {
      supports_text_to_video: true,
      supports_image_to_video: true,
      supports_multiple_references: true,
      supported_resolutions: ['480p', '720p', '1080p'],
      supported_ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      max_videos_per_request: 1,
    };
  }

  async generate(request: VideoProviderRequest): Promise<VideoProviderResult> {
    const config = new Config();
    const client = new VideoGenerationClient(config, request.custom_headers);

    // Build content items array
    const content: Array<Record<string, unknown>> = [];

    // Add reference images with their roles
    if (request.reference_image_urls && request.reference_image_urls.length > 0) {
      const roles = request.reference_image_roles || [];
      for (const [idx, url] of request.reference_image_urls.entries()) {
        const role = roles[idx] || 'reference_image';
        content.push({
          type: 'image_url',
          image_url: { url },
          role,
        });
      }
    }

    // Add text prompt
    content.push({
      type: 'text',
      text: request.prompt,
    });

    const options: Record<string, unknown> = {};

    // Determine model (default to Seedance 1.5 Pro)
    const modelId = request.model_id || 'doubao-seedance-1-5-pro-251215';
    options.model = modelId;

    if (request.resolution) options.resolution = request.resolution;
    if (request.ratio) options.ratio = request.ratio;
    if (request.duration) options.duration = request.duration;
    if (request.watermark !== undefined) options.watermark = request.watermark;
    if (request.camerafixed !== undefined) options.camerafixed = request.camerafixed;
    if (request.generate_audio !== undefined) options.generateAudio = request.generate_audio;
    if (request.max_wait_time) options.maxWaitTime = request.max_wait_time;

    const response = await client.videoGeneration(
      content as unknown as Parameters<typeof client.videoGeneration>[0],
      options as unknown as Parameters<typeof client.videoGeneration>[1]
    );

    if (response.videoUrl) {
      return {
        success: true,
        video_url: response.videoUrl,
        last_frame_url: response.lastFrameUrl || null,
        error_message: '',
        model: modelId,
        duration_seconds: response.response?.duration,
        resolution: response.response?.resolution,
        ratio: response.response?.ratio,
        usage: response.response?.usage
          ? {
              completion_tokens: response.response.usage.completion_tokens,
              total_tokens: response.response.usage.total_tokens,
            }
          : undefined,
      };
    }

    return {
      success: false,
      video_url: null,
      last_frame_url: null,
      error_message: response.response?.error_message || 'Video generation returned no URL',
      model: modelId,
    };
  }

  async healthCheck(): Promise<VideoHealthResult> {
    try {
      const config = new Config();
      const client = new VideoGenerationClient(config);
      // Lightweight check: just verify the client is instantiated
      const capabilities = await this.getCapabilities();
      return {
        healthy: capabilities.supports_text_to_video,
        provider: this.name,
        error: undefined,
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
