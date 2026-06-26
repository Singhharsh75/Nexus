'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/utils/api-client';

interface Member {
  id: string;
  user_id: string;
  role: string;
  email: string | null;
  joined_at: string;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
}

export default function SettingsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [wsName, setWsName] = useState('');
  const [wsSlug, setWsSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [memberError, setMemberError] = useState<string | null>(null);

  const resolveWorkspace = useCallback(async (): Promise<WorkspaceInfo | null> => {
    const res = await apiFetch('/api/workspaces');
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

  const fetchMembers = useCallback(async (workspaceId: string) => {
    const res = await apiFetch(`/api/workspaces/${workspaceId}/members`);
    if (res.ok) {
      setMembers(await res.json());
    }
  }, []);

  useEffect(() => {
    (async () => {
      const ws = await resolveWorkspace();
      if (!ws) return;
      setWorkspace(ws);
      setWsName(ws.name);
      setWsSlug(ws.slug);
      await fetchMembers(ws.id);
      setLoading(false);
    })();
  }, [resolveWorkspace, fetchMembers]);

  async function handleSaveWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);

    const res = await apiFetch(`/api/workspaces/${workspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wsName, slug: wsSlug }),
    });

    if (!res.ok) {
      const data = await res.json();
      setSaveError(data.error ?? 'Failed to update');
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaveSuccess(true);
    if (wsSlug !== params.slug) {
      router.push(`/workspace/${wsSlug}/settings`);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setInviteError(null);
    setInviting(true);

    const res = await apiFetch(`/api/workspaces/${workspace.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

    if (!res.ok) {
      const data = await res.json();
      setInviteError(data.error ?? 'Failed to invite');
      setInviting(false);
      return;
    }

    setInviteOpen(false);
    setInviteEmail('');
    setInviteRole('member');
    setInviting(false);
    fetchMembers(workspace.id);
  }

  async function handleRoleChange(userId: string, newRole: string) {
    if (!workspace) return;
    setMemberError(null);

    const res = await apiFetch(
      `/api/workspaces/${workspace.id}/members/${userId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      },
    );

    if (!res.ok) {
      const data = await res.json();
      setMemberError(data.error ?? 'Failed to update role');
      return;
    }

    fetchMembers(workspace.id);
  }

  async function handleRemoveMember(userId: string) {
    if (!workspace) return;
    setMemberError(null);

    const res = await apiFetch(
      `/api/workspaces/${workspace.id}/members/${userId}`,
      { method: 'DELETE' },
    );

    if (!res.ok) {
      const data = await res.json();
      setMemberError(data.error ?? 'Failed to remove member');
      return;
    }

    fetchMembers(workspace.id);
  }

  async function handleDeleteWorkspace() {
    if (!workspace) return;
    const res = await apiFetch(`/api/workspaces/${workspace.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      router.push('/dashboard');
    }
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
          Settings
        </h1>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveWorkspace} className="space-y-4">
                {saveError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                    {saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
                    Workspace updated successfully.
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Name</Label>
                  <Input
                    id="ws-name"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-slug">Slug</Label>
                  <Input
                    id="ws-slug"
                    value={wsSlug}
                    onChange={(e) => setWsSlug(e.target.value)}
                    required
                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Members</CardTitle>
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger>
                  Invite Member
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite a member</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleInvite} className="space-y-4">
                    {inviteError && (
                      <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                        {inviteError}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={inviteRole} onValueChange={(val) => { if (val) setInviteRole(val); }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={inviting}>
                        {inviting ? 'Inviting...' : 'Invite'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {memberError && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                  {memberError}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.email ?? m.user_id}</TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          onValueChange={(val) => {
                            if (val) handleRoleChange(m.user_id, val);
                          }}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveMember(m.user_id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger">
          <Card className="border-red-200 dark:border-red-900">
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-400">
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Deleting this workspace is permanent. All posts, members, and data will be lost.
              </p>
              <AlertDialog>
                <AlertDialogTrigger>
                  Delete Workspace
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &quot;{workspace.name}&quot; and all its data.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteWorkspace}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
