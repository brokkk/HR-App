-- Migration: Update approve_late_permission to exempt penalty
-- When late permission is finally approved (by COO), set attendance penalty to 0
-- Date: 2026-01-11

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
      
      -- =====================================================
      -- NEW: Exempt penalty when finally approved
      -- Set penalty_amount = 0 and late_exempted = true
      -- =====================================================
      UPDATE attendance_daily 
      SET penalty_amount = 0, 
          late_exempted = true,
          updated_at = now()
      WHERE employee_id = v_perm.employee_id 
        AND date = v_perm.date;
        
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
      'employee_id', v_perm.employee_id,
      'penalty_exempted', (v_new_status = 'approved')
    )
  );

  RETURN v_new_status;
END;
$$;

COMMENT ON FUNCTION public.approve_late_permission IS 
'Approve or reject late permission.
Lead approves pending_lead -> pending_coo.
COO approves pending_coo -> approved (exempts penalty).
Any rejection -> rejected.';
