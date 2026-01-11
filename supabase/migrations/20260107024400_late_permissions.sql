-- =============================================================================
-- Migration: late_permissions
-- Izin Datang Telat (Late Permission) - Auto-approved, overrides penalty
-- =============================================================================

-- =============================================================================
-- 1. LATE_PERMISSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.late_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  category text NOT NULL CHECK (category IN ('urgent', 'hujan', 'habis_lembur')),
  max_check_in_time time NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status = 'approved'),
  proof_path text DEFAULT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One late permission per employee per date
  UNIQUE (employee_id, date)
);

COMMENT ON TABLE public.late_permissions IS 'Late permission (izin telat) - auto-approved, overrides penalty if check-in within max time';
COMMENT ON COLUMN public.late_permissions.category IS 'urgent=macet/ban/antar anak, hujan=max 10:00, habis_lembur=max 11:00';
COMMENT ON COLUMN public.late_permissions.max_check_in_time IS 'Maximum allowed check-in time (clamped by category caps)';
COMMENT ON COLUMN public.late_permissions.proof_path IS 'Optional proof photo storage path';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_late_permissions_employee ON public.late_permissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_late_permissions_date ON public.late_permissions(date);

-- =============================================================================
-- 2. RLS POLICIES
-- =============================================================================

ALTER TABLE public.late_permissions ENABLE ROW LEVEL SECURITY;

-- Employee: SELECT own
CREATE POLICY late_permissions_select_own ON public.late_permissions
  FOR SELECT
  USING (employee_id = auth.uid());

-- Employee: INSERT own (auto-approved)
CREATE POLICY late_permissions_insert_own ON public.late_permissions
  FOR INSERT
  WITH CHECK (employee_id = auth.uid());

-- Employee: DELETE own (only future dates)
CREATE POLICY late_permissions_delete_own ON public.late_permissions
  FOR DELETE
  USING (employee_id = auth.uid() AND date >= CURRENT_DATE);

-- HR/Owner: SELECT all
CREATE POLICY late_permissions_select_hr ON public.late_permissions
  FOR SELECT
  USING (public.is_hr_or_owner());

-- =============================================================================
-- 3. HELPER FUNCTION: Check late permission for penalty override
-- Returns max_check_in_time if permission exists, NULL otherwise
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
    AND status = 'approved'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_late_permission_max_time(uuid, date) TO authenticated;

-- =============================================================================
-- 4. UPDATE RPC: recompute_my_attendance_today with late permission check
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recompute_my_attendance_today()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid := auth.uid();
  v_date date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_check_in_source text;
  v_check_out_source text;
  v_check_in_wib time;
  v_check_in_minutes int;
  v_late_minutes int := 0;
  v_is_late boolean := false;
  v_is_penalized boolean := false;
  v_penalty int := 0;
  v_result jsonb;
  v_late_permission_max time;
  
  -- Constants (WIB times)
  c_start_minutes int := 9 * 60;      -- 09:00 = 540 minutes from midnight
  c_grace_minutes int := 9 * 60 + 30; -- 09:30 = 570 minutes from midnight
  c_penalty_amount int := 50000;
BEGIN
  -- Validate authentication
  IF v_emp IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Not authenticated';
  END IF;

  -- Validate active employee
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_emp AND is_active = true) THEN
    RAISE EXCEPTION USING MESSAGE = 'Inactive employee';
  END IF;

  -- Get check_in: MIN(ts) where event_type='IN' for today (WIB)
  SELECT ts, source INTO v_check_in, v_check_in_source
  FROM public.attendance_logs
  WHERE employee_id = v_emp
    AND event_type = 'IN'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = v_date
  ORDER BY ts ASC
  LIMIT 1;

  -- Get check_out: MAX(ts) where event_type='OUT' for today (WIB)
  SELECT ts, source INTO v_check_out, v_check_out_source
  FROM public.attendance_logs
  WHERE employee_id = v_emp
    AND event_type = 'OUT'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = v_date
  ORDER BY ts DESC
  LIMIT 1;

  -- If no check_in for today, return null result
  IF v_check_in IS NULL THEN
    RETURN jsonb_build_object(
      'employee_id', v_emp,
      'date', v_date,
      'check_in', null,
      'check_out', null,
      'check_in_source', null,
      'check_out_source', null,
      'late_minutes', 0,
      'is_late', false,
      'is_penalized', false,
      'penalty_amount', 0,
      'computed_at', now()
    );
  END IF;

  -- Calculate check-in time in WIB
  v_check_in_wib := (v_check_in AT TIME ZONE 'Asia/Jakarta')::time;
  v_check_in_minutes := (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int;
  
  -- Check for late permission
  v_late_permission_max := public.get_late_permission_max_time(v_emp, v_date);
  
  -- Penalty calculation with late permission check
  IF v_late_permission_max IS NOT NULL AND v_check_in_wib <= v_late_permission_max THEN
    -- Late permission covers this check-in
    v_late_minutes := 0;
    v_is_late := false;
    v_is_penalized := false;
    v_penalty := 0;
  ELSIF v_check_in_minutes <= c_grace_minutes THEN
    -- Within grace: not late
    v_late_minutes := 0;
    v_is_late := false;
    v_is_penalized := false;
    v_penalty := 0;
  ELSE
    -- After grace: late
    v_late_minutes := v_check_in_minutes - c_start_minutes;
    v_is_late := true;
    
    -- Check source for penalty
    IF v_check_in_source = 'outside' THEN
      v_is_penalized := false;
      v_penalty := 0;
    ELSE
      v_is_penalized := true;
      v_penalty := c_penalty_amount;
    END IF;
  END IF;

  -- Upsert attendance_daily
  INSERT INTO public.attendance_daily (
    employee_id,
    date,
    check_in,
    check_out,
    check_in_source,
    check_out_source,
    late_minutes,
    is_late,
    is_penalized,
    penalty_amount,
    computed_at
  ) VALUES (
    v_emp,
    v_date,
    v_check_in,
    v_check_out,
    v_check_in_source,
    v_check_out_source,
    v_late_minutes,
    v_is_late,
    v_is_penalized,
    v_penalty,
    now()
  )
  ON CONFLICT (employee_id, date)
  DO UPDATE SET
    check_in = EXCLUDED.check_in,
    check_out = EXCLUDED.check_out,
    check_in_source = EXCLUDED.check_in_source,
    check_out_source = EXCLUDED.check_out_source,
    late_minutes = EXCLUDED.late_minutes,
    is_late = EXCLUDED.is_late,
    is_penalized = EXCLUDED.is_penalized,
    penalty_amount = EXCLUDED.penalty_amount,
    computed_at = EXCLUDED.computed_at;

  -- Return the result as JSON
  v_result := jsonb_build_object(
    'employee_id', v_emp,
    'date', v_date,
    'check_in', v_check_in,
    'check_out', v_check_out,
    'check_in_source', v_check_in_source,
    'check_out_source', v_check_out_source,
    'late_minutes', v_late_minutes,
    'is_late', v_is_late,
    'is_penalized', v_is_penalized,
    'penalty_amount', v_penalty,
    'late_permission_max', v_late_permission_max,
    'computed_at', now()
  );

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 5. UPDATE RPC: submit_manual_attendance_fix with late permission check
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_manual_attendance_fix(
  p_employee_id uuid,
  p_date date,
  p_check_in timestamptz DEFAULT NULL,
  p_check_out timestamptz DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_check_in_source text;
  v_check_out_source text;
  v_check_in_wib time;
  v_check_in_minutes int;
  v_late_minutes int := 0;
  v_is_late boolean := false;
  v_is_penalized boolean := false;
  v_penalty int := 0;
  v_result jsonb;
  v_daily_id uuid;
  v_late_permission_max time;
  
  c_start_minutes int := 9 * 60;      -- 09:00 = 540
  c_grace_minutes int := 9 * 60 + 30; -- 09:30 = 570
  c_penalty_amount int := 50000;
BEGIN
  -- Only HR/Owner allowed
  IF NOT public.is_hr_or_owner() THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission denied: HR or Owner only';
  END IF;

  -- Validate employee exists
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id) THEN
    RAISE EXCEPTION USING MESSAGE = 'Employee not found';
  END IF;

  -- Insert manual check-in log if provided
  IF p_check_in IS NOT NULL THEN
    INSERT INTO attendance_logs (employee_id, ts, event_type, source, meta)
    VALUES (
      p_employee_id,
      p_check_in,
      'IN',
      'manual',
      jsonb_build_object('note', p_note, 'fixed', true, 'fixed_by', v_user_id, 'fixed_at', now())
    );
  END IF;

  -- Insert manual check-out log if provided
  IF p_check_out IS NOT NULL THEN
    INSERT INTO attendance_logs (employee_id, ts, event_type, source, meta)
    VALUES (
      p_employee_id,
      p_check_out,
      'OUT',
      'manual',
      jsonb_build_object('note', p_note, 'fixed', true, 'fixed_by', v_user_id, 'fixed_at', now())
    );
  END IF;

  -- Recompute daily for this employee+date
  SELECT ts, source INTO v_check_in, v_check_in_source
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND event_type = 'IN'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = p_date
  ORDER BY ts ASC
  LIMIT 1;

  SELECT ts, source INTO v_check_out, v_check_out_source
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND event_type = 'OUT'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = p_date
  ORDER BY ts DESC
  LIMIT 1;

  IF v_check_in IS NULL THEN
    RETURN jsonb_build_object(
      'employee_id', p_employee_id,
      'date', p_date,
      'check_in', null,
      'check_out', null,
      'message', 'No check-in found for this date'
    );
  END IF;

  -- Calculate late/penalty with GRACE RULE + LATE PERMISSION
  v_check_in_wib := (v_check_in AT TIME ZONE 'Asia/Jakarta')::time;
  v_check_in_minutes := (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int;
  
  -- Check for late permission
  v_late_permission_max := public.get_late_permission_max_time(p_employee_id, p_date);
  
  IF v_late_permission_max IS NOT NULL AND v_check_in_wib <= v_late_permission_max THEN
    -- Late permission covers this check-in
    v_late_minutes := 0;
    v_is_late := false;
    v_is_penalized := false;
    v_penalty := 0;
  ELSIF v_check_in_minutes <= c_grace_minutes THEN
    -- Within grace: not late
    v_late_minutes := 0;
    v_is_late := false;
    v_is_penalized := false;
    v_penalty := 0;
  ELSE
    -- After grace: late
    v_late_minutes := v_check_in_minutes - c_start_minutes;
    v_is_late := true;
    
    IF v_check_in_source = 'outside' THEN
      v_is_penalized := false;
      v_penalty := 0;
    ELSE
      v_is_penalized := true;
      v_penalty := c_penalty_amount;
    END IF;
  END IF;

  -- Upsert attendance_daily
  INSERT INTO attendance_daily (
    employee_id, date, check_in, check_out, 
    check_in_source, check_out_source,
    late_minutes, is_late, is_penalized, penalty_amount, computed_at
  ) VALUES (
    p_employee_id, p_date, v_check_in, v_check_out,
    v_check_in_source, v_check_out_source,
    v_late_minutes, v_is_late, v_is_penalized, v_penalty, now()
  )
  ON CONFLICT (employee_id, date)
  DO UPDATE SET
    check_in = EXCLUDED.check_in,
    check_out = EXCLUDED.check_out,
    check_in_source = EXCLUDED.check_in_source,
    check_out_source = EXCLUDED.check_out_source,
    late_minutes = EXCLUDED.late_minutes,
    is_late = EXCLUDED.is_late,
    is_penalized = EXCLUDED.is_penalized,
    penalty_amount = EXCLUDED.penalty_amount,
    computed_at = EXCLUDED.computed_at
  RETURNING id INTO v_daily_id;

  -- Audit log
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta)
  VALUES (
    v_user_id,
    'attendance_manual_fixed',
    'attendance_daily',
    v_daily_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'date', p_date,
      'check_in', v_check_in,
      'check_out', v_check_out,
      'note', p_note
    )
  );

  -- Return result
  v_result := jsonb_build_object(
    'employee_id', p_employee_id,
    'date', p_date,
    'check_in', v_check_in,
    'check_out', v_check_out,
    'check_in_source', v_check_in_source,
    'check_out_source', v_check_out_source,
    'late_minutes', v_late_minutes,
    'is_late', v_is_late,
    'is_penalized', v_is_penalized,
    'penalty_amount', v_penalty,
    'late_permission_max', v_late_permission_max,
    'daily_id', v_daily_id
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.recompute_my_attendance_today IS 
'Recompute attendance for current user today.
Checks late_permissions for penalty override.
Grace Rule: check-in <= 09:30 = NOT late.
Outside attendance has no penalty.';
