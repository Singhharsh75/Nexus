CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(768),
  target_workspace_id UUID,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  post_id UUID,
  chunk_index INTEGER,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    pc.id,
    pc.post_id,
    pc.chunk_index,
    pc.content,
    pc.metadata,
    (1 - (pc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM post_chunks pc
  WHERE pc.workspace_id = target_workspace_id
    AND (1 - (pc.embedding <=> query_embedding)) > match_threshold
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
$$;
