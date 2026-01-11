-- =============================================================================
-- Migration: requests_rls
-- RLS policies for requests and request_approvals tables
-- =============================================================================

-- =============================================================================
-- ENABLE RLS
-- =============================================================================

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_approvals ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- HELPER FUNCTION: can_approve_request
-- Checks if current user can approve a specific request
-- - Leave requests: must be lead of the employee's division
-- - Overtime requests: must be HR/Owner
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
      AND r.status = 'pending'
      AND (
        -- HR/Owner can approve any request
        public.is_hr_or_owner()
        OR
        -- Lead can approve leave requests for their division
        (r.type = 'leave' AND public.is_lead_of(r.employee_id))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_approve_request(uuid) TO authenticated;

-- =============================================================================
-- TRIGGER: Update request status when approval is inserted
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_request_status_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE requests
  SET status = NEW.action,
      updated_at = now()
  WHERE id = NEW.request_id
    AND status = 'pending';
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_request_status
  AFTER INSERT ON public.request_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_request_status_on_approval();

-- =============================================================================
-- POLICIES: requests
-- =============================================================================

-- Employee can SELECT own requests
CREATE POLICY requests_select_own ON public.requests
  FOR SELECT
  USING (employee_id = auth.uid());

-- Lead can SELECT leave requests from their division
CREATE POLICY requests_select_lead ON public.requests
  FOR SELECT
  USING (type = 'leave' AND public.is_lead_of(employee_id));

-- HR/Owner can SELECT all requests
CREATE POLICY requests_select_hr ON public.requests
  FOR SELECT
  USING (public.is_hr_or_owner());

-- Employee can INSERT own requests
CREATE POLICY requests_insert_own ON public.requests
  FOR INSERT
  WITH CHECK (employee_id = auth.uid());

-- Employee can UPDATE own requests (draft/pending only, limited fields)
CREATE POLICY requests_update_own ON public.requests
  FOR UPDATE
  USING (
    employee_id = auth.uid() 
    AND status IN ('draft', 'pending')
  )
  WITH CHECK (
    employee_id = auth.uid()
    AND status IN ('draft', 'pending')
  );

-- HR/Owner can UPDATE any request (for status changes via approval)
CREATE POLICY requests_update_hr ON public.requests
  FOR UPDATE
  USING (public.is_hr_or_owner());

-- Employee can DELETE own draft requests only
CREATE POLICY requests_delete_own ON public.requests
  FOR DELETE
  USING (employee_id = auth.uid() AND status = 'draft');

-- =============================================================================
-- POLICIES: request_approvals
-- =============================================================================

-- Employee can SELECT approvals for their own requests
CREATE POLICY approvals_select_own ON public.request_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_id
        AND r.employee_id = auth.uid()
    )
  );

-- Lead can SELECT approvals for leave requests in their division
CREATE POLICY approvals_select_lead ON public.request_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_id
        AND r.type = 'leave'
        AND public.is_lead_of(r.employee_id)
    )
  );

-- HR/Owner can SELECT all approvals
CREATE POLICY approvals_select_hr ON public.request_approvals
  FOR SELECT
  USING (public.is_hr_or_owner());

-- Lead can INSERT approval for leave requests in their division
-- HR/Owner can INSERT approval for any request
CREATE POLICY approvals_insert ON public.request_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
    AND public.can_approve_request(request_id)
  );
