/**
 * Direct OpenAI embeddings client.
 *
 * The Lovable AI Gateway does not support embedding models — only chat/completion.
 * Embeddings must call OpenAI directly. Chat/completion calls elsewhere in the
 * codebase still use the gateway and should remain unchanged.
 *
 * Model: text-embedding-3-small (1536 dims) — matches the existing
 * `srto_corpus.embedding` vector(1536) column and HNSW index, and the
 * `vector_embeddings` schema. Do not change the model without a
 * corresponding column-type + index migration.
 */

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

function getApiKey(): string {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY not set in edge function secrets — embeddings cannot be generated',
    );
  }
  return apiKey;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = getApiKey();
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    throw new Error('Cannot embed empty text');
  }

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI embeddings API failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `OpenAI embeddings returned unexpected shape: expected ${EMBEDDING_DIM}-dim vector, got ${
        Array.isArray(embedding) ? embedding.length : typeof embedding
      }`,
    );
  }

  return embedding;
}

/**
 * Batched embeddings — OpenAI accepts up to ~2048 inputs per call.
 * Empty/whitespace-only inputs are filtered before calling the API.
 * Returns embeddings in the same order as the (filtered) inputs.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const apiKey = getApiKey();
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const cleaned = texts.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  if (cleaned.length === 0) return [];

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: cleaned,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI embeddings batch failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const out: number[][] = (data?.data ?? []).map((d: { embedding: number[] }) => d.embedding);

  for (const v of out) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIM) {
      throw new Error(
        `OpenAI embeddings batch returned unexpected vector shape (expected ${EMBEDDING_DIM}-dim)`,
      );
    }
  }

  return out;
}

export const EMBEDDING_PROVIDER = 'openai';
export const EMBEDDING_MODEL_NAME = EMBEDDING_MODEL;
export const EMBEDDING_DIMENSIONS = EMBEDDING_DIM;
