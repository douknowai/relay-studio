/**
 * 跨域资源下载：fetch + blob 模式（a[download] 对跨域 URL 无效）
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}

/** 生成安全的下载文件名（去除非法字符，兜底扩展名） */
export function safeFilename(base: string, ext: string): string {
  const cleaned = (base || 'asset')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 60);
  return `${cleaned}.${ext}`;
}
