-- =============================================================================
-- Migration: late_permissions_v2
-- Izin Telat v2: Approval chain (Lead → COO), today-only, status stages
-- =============================================================================

-- =============================================================================
-- 1. UPDATE TABLE: late_permissions (alter status constraint)
-- =============================================================================

-- Drop old check constraint
ALTER TABLE public.late_permissions DROP CONSTRAINT IF EXISTS late_permissions_status_check;

-- Add new status stages check constraint
ALTER TABLE public.late_permissions ADD CONSTRAINT late_permissions_status_check 
  CHECK (status IN ('pending_lead', 'pending_coo', 'approved', 'rejected'));

-- Update default to pending_lead
ALTER TABLE public.late_permissions ALTER COLUMN status SET DEFAULT 'pending_lead';

-- =============================================================================
-- 2. CREATE TABLE: late_permission_approvals
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.late_permission_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  late_permission_id uuid NOT NULL REFERENCES public.late_permissions(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES public.employees(id),
  stage text NOT NULL CHECK (stage IN ('lead', 'coo')),
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  notes text DEFAULT '',
  acted_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (late_permission_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_late_perm_approvals_perm ON public.late_permission_approvals(late_permission_id);
CREATE INDEX IF NOT EXISTS idx_late_perm_approvals_approver ON public.late_permission_approvals(approver_id);

ALTER TABLE public.late_permission_approvals ENABLE ROW LEVEL SECURITY;

-- RLS: HR/Owner can view all
CREATE POLICY late_perm_approvals_select_hr ON public.late_permission_approvals
  FOR SELECT USING (public.is_hr_or_owner());

-- RLS: Employee can view approvals for their own permissions
CREATE POLICY late_perm_approvals_select_own ON public.late_permission_approvals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM late_permissions lp 
      WHERE lp.id = late_permission_id AND lp.employee_id = auth.uid()
    )
  );

-- =============================================================================
-- 3. HELPER: Check if user is COO (using 'owner' role in employees.role)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_coo()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.id = auth.uid()
      AND e.role = 'owner'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_coo() TO authenticated;

-- =============================================================================
-- 4. RPC: submit_late_permission (today-only, category-capped)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_late_permission(
  p_category text,
  p_reason text,
  p_max_time time,
  p_proof_path text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_clamped_time time;
  v_permission_id uuid;
BEGIN
  -- Validate auth
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Not authenticated';
  END IF;

  -- Validate active employee
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = v_user_id AND is_active = true) THEN
    RAISE EXCEPTION USING MESSAGE = 'Inactive or invalid employee';
  END IF;

  -- Validate category
  IF p_category NOT IN ('urgent', 'hujan', 'habis_lembur') THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid category';
  END IF;

  -- Validate reason not empty
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION USING MESSAGE = 'Reason is required';
  END IF;

  -- Clamp max time based on category caps
  v_clamped_time := CASE
    WHEN p_category = 'hujan' AND p_max_time > '10:00'::time THEN '10:00'::time
    WHEN p_category = 'habis_lembur' AND p_max_time > '11:00'::time THEN '11:00'::time
    ELSE p_max_time
  END;

  -- Check if already exists for today
  IF EXISTS (SELECT 1 FROM late_permissions WHERE employee_id = v_user_id AND date = v_today) THEN
    RAISE EXCEPTION USING MESSAGE = 'Late permission already exists for today';
  END IF;

  -- Insert
  INSERT INTO late_permissions (
    employee_id, date, category, max_check_in_time, reason, status, proof_path, meta
  ) VALUES (
    v_user_id, v_today, p_category, v_clamped_time, trim(p_reason), 'pending_lead', p_proof_path, p_meta
  ) RETURNING id INTO v_permission_id;

  RETURN v_permission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_late_permission(text, text, time, text, jsonb) TO authenticated;

-- =============================================================================
-- 5. RPC: approve_late_permission (Lead → COO workflow)
-- Uses existing is_lead_of(employee_id) function from rls_policies migration
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approve_late_permission(
  p_permission_id uuid,
  p_action text,
  p_notes text DEFAULT ''
)
RETURNS text -- returns new status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_perm RECORD;
  v_new_status text;
  v_stage text;
BEGIN
  -- Validate auth
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Not authenticated';
  END IF;

  -- Validate action
  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION USING MESSAGE = 'Action must be approved or rejected';
  END IF;

  -- Get permission
  SELECT * INTO v_perm FROM late_permissions WHERE id = p_permission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission not found';
  END IF;

  -- Determine stage and validate approver
  IF v_perm.status = 'pending_lead' THEN
    v_stage := 'lead';
    -- Check if user is lead of employee's division (uses existing is_lead_of function)
    IF NOT public.is_lead_of(v_perm.employee_id) THEN
      RAISE EXCEPTION USING MESSAGE = 'Only division lead can approve at this stage';
    END IF;
    
    IF p_action = 'approved' THEN
      v_new_status := 'pending_coo';
    ELSE
      v_new_status := 'rejected';
    END IF;

  ELSIF v_perm.status = 'pending_coo' THEN
    v_stage := 'coo';
    -- Check if user is COO (Owner)
    IF NOT public.is_coo() THEN
      RAISE EXCEPTION USING MESSAGE = 'Only COO can approve at this stage';
    END IF;
    
    IF p_action = 'approved' THEN
      v_new_status := 'approved';
    ELSE
      v_new_status := 'rejected';
    END IF;

  ELSE
    RAISE EXCEPTION USING MESSAGE = 'Permission already finalized';
  END IF;

  -- Update permission status
  UPDATE late_permissions SET status = v_new_status, updated_at = now() WHERE id = p_permission_id;

  -- Insert approval record
  INSERT INTO late_permission_approvals (late_permission_id, approver_id, stage, action, notes)
  VALUES (p_permission_id, v_user_id, v_stage, p_action, COALESCE(p_notes, ''));

  -- Audit log
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta)
  VALUES (
    v_user_id,
    CASE WHEN p_action = 'approved' THEN 'late_permission_approved' ELSE 'late_permission_rejected' END,
    'late_permissions',
    p_permission_id,
    jsonb_build_object(
      'stage', v_stage,
      'action', p_action,
      'new_status', v_new_status,
      'employee_id', v_perm.employee_id
    )
  );

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_late_permission(uuid, text, text) TO authenticated;

-- =============================================================================
-- 6. UPDATE RLS: late_permissions
-- =============================================================================

-- Drop old INSERT policy (employees must use RPC now)
DROP POLICY IF EXISTS late_permissions_insert_own ON public.late_permissions;

-- Update DELETE policy: only pending_lead + today
DROP POLICY IF EXISTS late_permissions_delete_own ON public.late_permissions;
CREATE POLICY late_permissions_delete_own ON public.late_permissions
  FOR DELETE
  USING (
    employee_id = auth.uid() 
    AND status = 'pending_lead' 
    AND date = (now() AT TIME ZONE 'Asia/Jakarta')::date
  );

-- Lead can SELECT pending_lead for their division (uses existing is_lead_of)
CREATE POLICY late_permissions_select_lead ON public.late_permissions
  FOR SELECT
  USING (
    status = 'pending_lead' 
    AND public.is_lead_of(employee_id)
  );

-- COO can SELECT pending_coo
CREATE POLICY late_permissions_select_coo ON public.late_permissions
  FOR SELECT
  USING (
    status = 'pending_coo' 
    AND public.is_coo()
  );

-- =============================================================================
-- 7. UPDATE: Penalty override check (only approved status)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_late_permission_max_time(p_employee_id uuid, p_date date)
RETURNS time
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT max_check_in_time
  FROM late_permissions
  WHERE employee_id = p_employee_id
    AND date = p_date
    AND status = 'approved'  -- Only approved permissions override penalty
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.submit_late_permission IS 
'Submit late permission for TODAY only. Auto-sets date to current WIB date.
Clamps max_time: hujan<=10:00, habis_lembur<=11:00.
Returns permission ID.';

COMMENT ON FUNCTION public.approve_late_permission IS 
'Approve or reject late permission.
Lead approves pending_lead -> pending_coo.
COO approves pending_coo -> approved.
Any rejection -> rejected.';
