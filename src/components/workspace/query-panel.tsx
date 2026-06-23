'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { RAGEvent, Source } from '@/types/query';

interface QueryPanelProps {
  workspaceId: string;
}

export function QueryPanel({ workspaceId }: QueryPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [cached, setCached] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const answerRef = useRef('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || isStreaming) return;

      setAnswer('');
      setSources([]);
      setCached(false);
      setLatencyMs(null);
      setError(null);
      setIsStreaming(true);
      answerRef.current = '';

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Request failed' }));
          setError(data.error ?? `Request failed (${res.status})`);
          setIsStreaming(false);
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data: ')) continue;

            const event: RAGEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case 'sources':
                setSources(event.sources);
                break;
              case 'delta':
                answerRef.current += event.content;
                setAnswer(answerRef.current);
                break;
              case 'done':
                setCached(event.cached);
                setLatencyMs(event.latencyMs);
                break;
              case 'error':
                setError(event.message);
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Connection failed');
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [query, workspaceId, isStreaming],
  );

  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setOpen(true)}
          className="rounded-full px-6 py-3 shadow-lg"
        >
          Ask AI
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-lg">
      <Card className="shadow-2xl border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Ask AI
          </span>
          <div className="flex items-center gap-2">
            {cached && (
              <Badge variant="secondary" className="text-xs">
                Cached
              </Badge>
            )}
            {latencyMs !== null && (
              <span className="text-xs text-zinc-400">
                {(latencyMs / 1000).toFixed(1)}s
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-6 w-6 p-0"
            >
              &times;
            </Button>
          </div>
        </div>

        <CardContent className="max-h-96 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          {answer && (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {answer}
            </div>
          )}

          {sources.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Sources
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((source, i) => (
                  <Badge
                    key={source.chunkId}
                    variant="outline"
                    className="text-xs cursor-default"
                    title={source.content.slice(0, 200)}
                  >
                    [{i + 1}] {source.title ?? 'Untitled post'}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {isStreaming && !answer && !error && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
              Searching workspace knowledge...
            </div>
          )}
        </CardContent>

        <div className="border-t p-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about this workspace..."
              disabled={isStreaming}
              className="flex-1"
            />
            <Button type="submit" disabled={isStreaming || !query.trim()}>
              {isStreaming ? '...' : 'Ask'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
