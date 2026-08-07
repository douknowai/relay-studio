import { createClient, SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
/** 缓存从 API 获取的配置，避免 SupabaseConfigProvider 和 AuthProvider 重复请求 */
let cachedConfig: { url: string; anonKey: string } | null = null;

function getOrCreateClient(url: string, anonKey: string): SupabaseClient {
  if (browserClient) {
    console.warn('[SB-DIAG] returning existing client');
    return browserClient;
  }

  console.warn('[SB-DIAG] createClient start');
  browserClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  console.warn('[SB-DIAG] createClient done');

  return browserClient;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase config not available');
  }

  return getOrCreateClient(url, anonKey);
}

/** Supabase 配置获取超时 */
const CONFIG_FETCH_TIMEOUT_MS = 8_000;

export async function getSupabaseBrowserClientAsync(): Promise<SupabaseClient> {
  // Try direct env first
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    console.warn(`[SB-DIAG] using env/cached: url=${url?.substring(0, 40)}`);
    return getOrCreateClient(url, anonKey);
  }

  // Use cached config if SupabaseConfigProvider already fetched it
  if (cachedConfig) {
    console.warn('[SB-DIAG] using cachedConfig');
    return getOrCreateClient(cachedConfig.url, cachedConfig.anonKey);
  }

  // Fallback: fetch from API with timeout
  console.warn('[SB-DIAG] fallback: fetching /api/supabase-config');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch('/api/supabase-config', { signal: controller.signal });
    if (!res.ok) throw new Error('Supabase 配置加载失败');
    const data = await res.json();
    console.warn(`[SB-DIAG] config fetched: url=${data.url?.substring(0, 40)}`);
    cachedConfig = { url: data.url, anonKey: data.anonKey };
    return getOrCreateClient(data.url, data.anonKey);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Supabase 配置加载超时，请检查网络连接');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

const MAX_RETRIES = 3;

export async function getSupabaseBrowserClientWithRetry(): Promise<SupabaseClient> {
  let lastError: Error | null = null;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await getSupabaseBrowserClientAsync();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }

  throw lastError || new Error('Failed to get Supabase client after retries');
}
