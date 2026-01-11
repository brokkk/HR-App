-- =============================================================================
-- Migration: overtime_v2_projects
-- Creates projects table, updates requests schema, approval triggers, RLS
-- =============================================================================

-- =============================================================================
-- 1. PROJECTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  account_manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.projects IS 'Projects for overtime requests with assigned Account Manager';
COMMENT ON COLUMN public.projects.account_manager_id IS 'Employee who approves overtime for this project (AM stage)';

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active projects
CREATE POLICY projects_select_authenticated ON public.projects
  FOR SELECT
  USING (is_active = true OR public.is_hr_or_owner());

-- HR/Owner can manage projects
CREATE POLICY projects_insert_hr ON public.projects
  FOR INSERT
  WITH CHECK (public.is_hr_or_owner());

CREATE POLICY projects_update_hr ON public.projects
  FOR UPDATE
  USING (public.is_hr_or_owner());

CREATE POLICY projects_delete_hr ON public.projects
  FOR DELETE
  USING (public.is_hr_or_owner());

-- Index for AM lookup
CREATE INDEX IF NOT EXISTS idx_projects_am ON public.projects(account_manager_id);

-- =============================================================================
-- 2. UPDATE REQUESTS TABLE
-- =============================================================================

-- Add project_id column
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Drop existing status constraint
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;

-- Add new status constraint with extended values
ALTER TABLE public.requests 
ADD CONSTRAINT requests_status_check 
CHECK (status IN ('draft', 'pending', 'pending_am', 'pending_hr', 'approved', 'rejected'));

COMMENT ON COLUMN public.requests.project_id IS 'Required for overtime requests - links to project and AM';

-- Index for project lookup
CREATE INDEX IF NOT EXISTS idx_requests_project ON public.requests(project_id) WHERE project_id IS NOT NULL;

-- =============================================================================
-- 3. HELPER FUNCTION: is_am_of_project
-- Checks if current user is AM of a given project
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_am_of_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects 
    WHERE id = p_project_id 
      AND account_manager_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_am_of_project(uuid) TO authenticated;

-- =============================================================================
-- 4. UPDATE can_approve_request FUNCTION
-- Now handles two-stage overtime approval
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_approve_request(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM requests r
    WHERE r.id = p_request_id
      AND (
        -- LEAVE: pending can be approved by lead or HR/Owner
        (r.type = 'leave' AND r.status = 'pending' AND (
          public.is_hr_or_owner() OR public.is_lead_of(r.employee_id)
        ))
        OR
        -- OVERTIME pending_am: AM of project can approve
        (r.type = 'overtime' AND r.status = 'pending_am' AND public.is_am_of_project(r.project_id))
        OR
        -- OVERTIME pending_hr: HR/Owner can approve
        (r.type = 'overtime' AND r.status = 'pending_hr' AND public.is_hr_or_owner())
      )
  );
$$;

-- =============================================================================
-- 5. UPDATE APPROVAL TRIGGER
-- Two-stage flow for overtime, single stage for leave
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_request_status_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_new_status text;
  v_meal_claim_id uuid;
BEGIN
  -- Get request details
  SELECT id, type, status, employee_id INTO v_request
  FROM requests WHERE id = NEW.request_id;

  IF v_request IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine new status based on request type and action
  IF NEW.action = 'rejected' THEN
    v_new_status := 'rejected';
  ELSIF v_request.type = 'leave' THEN
    -- Leave: single stage approval
    IF v_request.status = 'pending' AND NEW.action = 'approved' THEN
      v_new_status := 'approved';
    END IF;
  ELSIF v_request.type = 'overtime' THEN
    -- Overtime: two-stage approval
    IF v_request.status = 'pending_am' AND NEW.action = 'approved' THEN
      v_new_status := 'pending_hr';
    ELSIF v_request.status = 'pending_hr' AND NEW.action = 'approved' THEN
      v_new_status := 'approved';
      
      -- Auto-create meal claim for approved overtime
      INSERT INTO overtime_meal_claims (employee_id, request_id, amount, status)
      VALUES (v_request.employee_id, v_request.id, 50000, 'pending')
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id INTO v_meal_claim_id;
    END IF;
  END IF;

  -- Update request status
  IF v_new_status IS NOT NULL THEN
    UPDATE requests
    SET status = v_new_status,
        updated_at = now()
    WHERE id = NEW.request_id;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 6. OVERTIME MEAL CLAIMS TABLE (if not exists)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.overtime_meal_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_id uuid UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,
  amount integer NOT NULL DEFAULT 50000,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.overtime_meal_claims IS 'Meal claims auto-created when overtime is fully approved';

-- Enable RLS
ALTER TABLE public.overtime_meal_claims ENABLE ROW LEVEL SECURITY;

-- Employee can see own claims
CREATE POLICY omc_select_own ON public.overtime_meal_claims
  FOR SELECT
  USING (employee_id = auth.uid());

-- HR/Owner can see all
CREATE POLICY omc_select_hr ON public.overtime_meal_claims
  FOR SELECT
  USING (public.is_hr_or_owner());

-- Only trigger can insert (no direct insert policy)
-- HR can update status
CREATE POLICY omc_update_hr ON public.overtime_meal_claims
  FOR UPDATE
  USING (public.is_hr_or_owner());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_omc_employee ON public.overtime_meal_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_omc_status ON public.overtime_meal_claims(status);

-- =============================================================================
-- 7. UPDATE RLS POLICIES FOR REQUESTS (overtime-specific)
-- =============================================================================

-- Drop existing overtime-related policies if any
DROP POLICY IF EXISTS requests_select_am ON public.requests;
DROP POLICY IF EXISTS requests_select_overtime_hr ON public.requests;

-- AM can SELECT overtime requests for their projects
CREATE POLICY requests_select_am ON public.requests
  FOR SELECT
  USING (
    type = 'overtime' 
    AND project_id IS NOT NULL 
    AND public.is_am_of_project(project_id)
  );

-- =============================================================================
-- 8. UPDATE RLS POLICIES FOR REQUEST_APPROVALS
-- =============================================================================

-- Drop and recreate to include AM access
DROP POLICY IF EXISTS approvals_select_am ON public.request_approvals;
DROP POLICY IF EXISTS approvals_insert ON public.request_approvals;

-- AM can SELECT approvals for overtime in their projects
CREATE POLICY approvals_select_am ON public.request_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_id
        AND r.type = 'overtime'
        AND public.is_am_of_project(r.project_id)
    )
  );

-- Updated insert policy: includes AM for overtime pending_am
CREATE POLICY approvals_insert ON public.request_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
    AND public.can_approve_request(request_id)
  );

-- =============================================================================
-- 9. AUDIT LOG TRIGGER FOR PROJECT CHANGES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_project_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'project_created', 'projects', NEW.id, 
      jsonb_build_object('name', NEW.name, 'am_id', NEW.account_manager_id));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'project_updated', 'projects', NEW.id,
      jsonb_build_object('name', NEW.name, 'am_id', NEW.account_manager_id, 'is_active', NEW.is_active));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'project_deleted', 'projects', OLD.id,
      jsonb_build_object('name', OLD.name));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_project_changes();

-- =============================================================================
-- 10. SEED SAMPLE PROJECT (for testing)
-- =============================================================================

-- Insert a sample project if none exist
INSERT INTO public.projects (name, account_manager_id, is_active)
SELECT 'Default Project', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.projects LIMIT 1);
