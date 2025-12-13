import { pipeline } from '@xenova/transformers';

let embedder: any = null;
let unloadTimeout: Timer | null = null;
const UNLOAD_DELAY = 5 * 60 * 1000;

async function getEmbedder() {
  if (unloadTimeout) clearTimeout(unloadTimeout);

  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  unloadTimeout = setTimeout(() => {
    embedder = null;
    unloadTimeout = null;
    if (typeof Bun !== 'undefined' && Bun.gc) Bun.gc(true);
  }, UNLOAD_DELAY);

  return embedder;
}

export function isModelLoaded(): boolean {
  return embedder !== null;
}

export async function loadModel(): Promise<void> {
  await getEmbedder();
}

export function unloadModel(): void {
  if (unloadTimeout) {
    clearTimeout(unloadTimeout);
    unloadTimeout = null;
  }
  embedder = null;
  if (typeof Bun !== 'undefined' && Bun.gc) Bun.gc(true);
}

export async function generateEmbedding(text: string, forceLoad = true): Promise<number[]> {
  if (!text?.trim()) return new Array(384).fill(0);
  
  if (!forceLoad && !embedder) return new Array(384).fill(0);

  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];
  
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) chunks.push(chunk);
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;
  return v1.reduce((acc, val, i) => acc + val * (v2[i] ?? 0), 0);
}
