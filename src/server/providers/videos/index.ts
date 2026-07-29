import { CozeCodingVideoProvider } from './coze-coding-provider';
import type {
  VideoGenerationProvider,
  VideoProviderRequest,
  VideoProviderResult,
} from './types';

let cachedProvider: VideoGenerationProvider | null = null;

export function getVideoProvider(): VideoGenerationProvider {
  if (!cachedProvider) {
    cachedProvider = new CozeCodingVideoProvider();
  }
  return cachedProvider;
}

export async function generateVideo(
  request: VideoProviderRequest
): Promise<VideoProviderResult> {
  return getVideoProvider().generate(request);
}

// Re-export types
export type {
  VideoGenerationProvider,
  VideoProviderRequest,
  VideoProviderResult,
  VideoProviderCapabilities,
  VideoResolution,
  VideoRatio,
} from './types';
