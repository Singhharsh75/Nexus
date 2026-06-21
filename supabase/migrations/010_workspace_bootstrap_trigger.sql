-- Auto-insert workspace creator as admin member on workspace creation.
-- Uses SECURITY DEFINER to bypass RLS (the workspace_members INSERT policy
-- requires an existing admin, which doesn't exist yet for new workspaces).

CREATE OR REPLACE FUNCTION add_workspace_creator_as_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_workspace_created
  AFTER INSERT ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION add_workspace_creator_as_admin();
