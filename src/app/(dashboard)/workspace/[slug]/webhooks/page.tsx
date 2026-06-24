'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

interface Delivery {
  id: string;
  event_type: string;
  status: string;
  attempts: number;
  response_status: number | null;
  created_at: string;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
}

const EVENT_OPTIONS = [
  { value: 'post.created', label: 'Post Created' },
  { value: 'member.joined', label: 'Member Joined' },
  { value: 'query.completed', label: 'Query Completed' },
] as const;

export default function WebhooksPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [viewingWebhookId, setViewingWebhookId] = useState<string | null>(null);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const resolveWorkspace = useCallback(async (): Promise<WorkspaceInfo | null> => {
    const res = await fetch('/api/workspaces');
    if (!res.ok) return null;
    const list = await res.json();
    const ws = list.find((w: { slug: string }) => w.slug === params.slug);
    if (!ws) return null;
    if (ws.role !== 'admin') {
      router.push(`/workspace/${params.slug}`);
      return null;
    }
    return { id: ws.id, name: ws.name ?? ws.slug, slug: ws.slug };
  }, [params.slug, router]);

  const fetchWebhooks = useCallback(async (workspaceId: string) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/webhooks`);
    if (res.ok) {
      const data = await res.json();
      setWebhooks(data.data ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const ws = await resolveWorkspace();
      if (!ws) return;
      setWorkspace(ws);
      await fetchWebhooks(ws.id);
      setLoading(false);
    })();
  }, [resolveWorkspace, fetchWebhooks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setCreateError(null);
    setCreating(true);

    const res = await fetch(`/api/workspaces/${workspace.id}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: newUrl,
        secret: newSecret,
        events: Array.from(newEvents),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setCreateError(data.error ?? 'Failed to create webhook');
      setCreating(false);
      return;
    }

    setCreateOpen(false);
    setNewUrl('');
    setNewSecret('');
    setNewEvents(new Set());
    setCreating(false);
    fetchWebhooks(workspace.id);
  }

  async function handleDelete(webhookId: string) {
    if (!workspace) return;
    setError(null);

    const res = await fetch(
      `/api/workspaces/${workspace.id}/webhooks/${webhookId}`,
      { method: 'DELETE' },
    );

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to delete webhook');
      return;
    }

    fetchWebhooks(workspace.id);
    if (viewingWebhookId === webhookId) {
      setViewingWebhookId(null);
      setDeliveries([]);
    }
  }

  async function handleViewDeliveries(webhookId: string) {
    if (!workspace) return;
    setViewingWebhookId(webhookId);
    setDeliveriesLoading(true);

    const res = await fetch(
      `/api/workspaces/${workspace.id}/webhooks/${webhookId}/deliveries`,
    );

    if (res.ok) {
      const data = await res.json();
      setDeliveries(data.data ?? []);
    }
    setDeliveriesLoading(false);
  }

  function toggleEvent(event: string) {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/workspace/${params.slug}`)}
        >
          &larr; Back
        </Button>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Webhooks
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Registered Webhooks</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger>
              Add Webhook
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register a webhook</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                {createError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                    {createError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="webhook-url">URL</Label>
                  <Input
                    id="webhook-url"
                    type="url"
                    placeholder="https://example.com/webhook"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhook-secret">Secret (min 16 characters)</Label>
                  <Input
                    id="webhook-secret"
                    type="password"
                    placeholder="Your webhook secret"
                    value={newSecret}
                    onChange={(e) => setNewSecret(e.target.value)}
                    required
                    minLength={16}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Events</Label>
                  <div className="flex flex-wrap gap-2">
                    {EVENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleEvent(opt.value)}
                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                          newEvents.has(opt.value)
                            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                            : 'border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating || newEvents.size === 0}>
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No webhooks registered yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((wh) => (
                  <TableRow key={wh.id}>
                    <TableCell className="max-w-[200px] truncate font-mono text-sm">
                      {wh.url}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {wh.events.map((ev) => (
                          <Badge key={ev} variant="secondary" className="text-xs">
                            {ev}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={wh.active ? 'default' : 'outline'}>
                        {wh.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {new Date(wh.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDeliveries(wh.id)}
                        >
                          Deliveries
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger>
                              Delete
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove the webhook and all its delivery history.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(wh.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {viewingWebhookId && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery Log</CardTitle>
          </CardHeader>
          <CardContent>
            {deliveriesLoading ? (
              <Skeleton className="h-40" />
            ) : deliveries.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No deliveries yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>HTTP Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {d.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            d.status === 'delivered'
                              ? 'default'
                              : d.status === 'failed'
                                ? 'destructive'
                                : 'outline'
                          }
                        >
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.attempts}</TableCell>
                      <TableCell>{d.response_status ?? '-'}</TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {new Date(d.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
