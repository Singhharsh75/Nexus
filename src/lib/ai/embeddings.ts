import type OpenAI from 'openai';

const EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
const BATCH_SIZE = 20;

export async function generateEmbeddings(
  client: OpenAI,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map((batch) =>
      client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      }),
    ),
  );

  const results: number[][] = [];
  for (const response of batchResults) {
    const sorted = response.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      results.push(item.embedding);
    }
  }

  return results;
}
