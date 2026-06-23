export interface Chunk {
  content: string;
  index: number;
}

const MIN_CHUNK_TOKENS = 200;
const MAX_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;

function estimateTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitSentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g);
  if (!sentences) return [text];
  return sentences.map((s) => s.trim()).filter(Boolean);
}

export function chunkText(text: string): Chunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const allSentences: string[] = [];

  for (const paragraph of paragraphs) {
    if (estimateTokens(paragraph) > MAX_CHUNK_TOKENS) {
      allSentences.push(...splitSentences(paragraph));
    } else {
      allSentences.push(paragraph);
    }
  }

  const chunks: Chunk[] = [];
  let currentSentences: string[] = [];
  let currentTokens = 0;

  for (const sentence of allSentences) {
    const sentenceTokens = estimateTokens(sentence);

    if (
      currentTokens + sentenceTokens > MAX_CHUNK_TOKENS &&
      currentTokens >= MIN_CHUNK_TOKENS
    ) {
      chunks.push({
        content: currentSentences.join(' '),
        index: chunks.length,
      });

      const overlapSentences: string[] = [];
      let overlapTokens = 0;
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const tokens = estimateTokens(currentSentences[i]);
        if (overlapTokens + tokens > OVERLAP_TOKENS) break;
        overlapSentences.unshift(currentSentences[i]);
        overlapTokens += tokens;
      }
      currentSentences = overlapSentences;
      currentTokens = overlapTokens;
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (currentSentences.length > 0) {
    chunks.push({
      content: currentSentences.join(' '),
      index: chunks.length,
    });
  }

  return chunks;
}
