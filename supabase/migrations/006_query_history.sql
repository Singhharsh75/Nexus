CREATE TABLE query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  query_text TEXT NOT NULL,
  answer_text TEXT,
  sources JSONB DEFAULT '[]',
  cached BOOLEAN DEFAULT FALSE,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
