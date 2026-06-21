-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WORKSPACES: users can only see workspaces they are members of
-- ============================================================
CREATE POLICY "Users can view their workspaces"
  ON workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update their workspaces"
  ON workspaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete their workspaces"
  ON workspaces FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

-- ============================================================
-- WORKSPACE MEMBERS: users see members of own workspaces; admins manage
-- ============================================================
CREATE POLICY "Users can view members of their workspaces"
  ON workspace_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members AS wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can add members"
  ON workspace_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members AS wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

CREATE POLICY "Admins can update member roles"
  ON workspace_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members AS wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

CREATE POLICY "Admins can remove members"
  ON workspace_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members AS wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

-- ============================================================
-- POSTS: members can read; member+admin can create; author or admin can delete
-- ============================================================
CREATE POLICY "Workspace members can view posts"
  ON posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members and admins can create posts"
  ON posts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role IN ('admin', 'member')
    )
    AND auth.uid() = author_id
  );

CREATE POLICY "Authors and admins can update posts"
  ON posts FOR UPDATE
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

CREATE POLICY "Authors and admins can delete posts"
  ON posts FOR DELETE
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = posts.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

-- ============================================================
-- POST CHUNKS: workspace members can read; writes via service role only
-- ============================================================
CREATE POLICY "Workspace members can view post chunks"
  ON post_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = post_chunks.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- QUERY HISTORY: users can only see and create their own queries
-- ============================================================
CREATE POLICY "Users can view their own queries"
  ON query_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queries"
  ON query_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- WORKSPACE WEBHOOKS: admin only for all operations
-- ============================================================
CREATE POLICY "Admins can view webhooks"
  ON workspace_webhooks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspace_webhooks.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can create webhooks"
  ON workspace_webhooks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspace_webhooks.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can update webhooks"
  ON workspace_webhooks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspace_webhooks.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete webhooks"
  ON workspace_webhooks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspace_webhooks.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

-- ============================================================
-- WEBHOOK DELIVERIES: admin read only
-- ============================================================
CREATE POLICY "Admins can view webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_webhooks
      JOIN workspace_members ON workspace_members.workspace_id = workspace_webhooks.workspace_id
      WHERE workspace_webhooks.id = webhook_deliveries.webhook_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = 'admin'
    )
  );

-- ============================================================
-- REFRESH TOKENS: users can only access their own tokens
-- ============================================================
CREATE POLICY "Users can view their own refresh tokens"
  ON refresh_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own refresh tokens"
  ON refresh_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own refresh tokens"
  ON refresh_tokens FOR UPDATE
  USING (auth.uid() = user_id);
