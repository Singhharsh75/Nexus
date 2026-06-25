import type { SupabaseClient } from '@supabase/supabase-js';

export async function cleanupUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase.from('refresh_tokens').delete().eq('user_id', userId);
  await supabase.from('query_history').delete().eq('user_id', userId);
  await supabase.from('workspace_members').delete().eq('user_id', userId);
  await supabase.auth.admin.deleteUser(userId);
}

export async function cleanupWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  await supabase.from('webhook_deliveries').delete().match({
    webhook_id: workspaceId,
  });
  await supabase.from('workspace_webhooks').delete().eq('workspace_id', workspaceId);
  await supabase.from('post_chunks').delete().eq('workspace_id', workspaceId);
  await supabase.from('query_history').delete().eq('workspace_id', workspaceId);
  await supabase.from('posts').delete().eq('workspace_id', workspaceId);
  await supabase.from('workspace_members').delete().eq('workspace_id', workspaceId);
  await supabase.from('workspaces').delete().eq('id', workspaceId);
}

export async function cleanupAll(
  supabase: SupabaseClient,
  userIds: string[],
  workspaceIds: string[],
): Promise<void> {
  for (const workspaceId of workspaceIds) {
    await cleanupWorkspace(supabase, workspaceId);
  }
  for (const userId of userIds) {
    await cleanupUser(supabase, userId);
  }
}
