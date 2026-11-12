import type { ModelInfo } from '@dragon-rush/protocol';

const isModelInfo = (v: unknown): v is ModelInfo =>
  typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string';

/** Models the server can seat (`GET /api/models`). `baseUrl` is empty in the browser (same origin / Vite proxy). */
export async function fetchModels(baseUrl = ''): Promise<ModelInfo[]> {
  const res = await fetch(`${baseUrl}/api/models`);
  if (!res.ok) throw new Error(`models request failed: ${res.status}`);
  const body: unknown = await res.json();
  const list = (body as { models?: unknown }).models;
  return Array.isArray(list) ? list.filter(isModelInfo) : [];
}
