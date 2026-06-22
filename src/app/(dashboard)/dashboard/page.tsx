'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadWorkspaces() {
    setFetchError(null);
    const res = await fetch('/api/workspaces');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (!res.ok) {
      setFetchError('Failed to load workspaces');
      setLoading(false);
      return;
    }
    const data = await res.json();
    setWorkspaces(data);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetchError(null);
      const res = await fetch('/api/workspaces');
      if (cancelled) return;
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setFetchError('Failed to load workspaces');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setWorkspaces(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);

    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to create workspace');
      setCreating(false);
      return;
    }

    setDialogOpen(false);
    setName('');
    setSlug('');
    setCreating(false);
    loadWorkspaces();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Workspaces
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button />}>
            Create Workspace
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new workspace</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ws-name">Name</Label>
                <Input
                  id="ws-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My Team"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-slug">Slug</Label>
                <Input
                  id="ws-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-team"
                  required
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                />
                <p className="text-xs text-zinc-500">
                  Used in the URL: /workspace/{slug || '...'}
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : fetchError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-600 dark:text-red-400">{fetchError}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => { setLoading(true); loadWorkspaces(); }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : workspaces.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">
              No workspaces yet. Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Card
              key={ws.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/workspace/${ws.slug}`)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">{ws.name}</CardTitle>
                <Badge variant="secondary">{ws.role}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  /{ws.slug}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
