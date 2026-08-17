'use client';

import { fetchWithTimeout } from './fetch-utils';

/**
 * Copy text to clipboard with a fallback for non-secure contexts.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Fetch the prompt of a generation task (prompt lives on the task, not the asset).
 * Returns null when the task or the prompt is unavailable.
 */
export async function fetchTaskPrompt(
  taskId: string,
  sessionToken: string
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`/api/v1/tasks/${taskId}`, {
      headers: { 'x-session': sessionToken || '' },
      timeout: 8_000,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const payload = data?.data?.request_payload as Record<string, unknown> | null;
    const prompt = payload?.prompt;
    return typeof prompt === 'string' && prompt.trim() ? prompt : null;
  } catch {
    return null;
  }
}
