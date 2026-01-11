-- =============================================================================
-- Migration: update_outside_attendance_rules
-- Updates submit_outside_attendance rules (Single IN/OUT) and recompute_my_attendance_today (No Penalty)
-- =============================================================================

-- =============================================================================
-- FUNCTION: submit_outside_attendance
-- Updates: Enforce strict Single IN / Single OUT per day (WIB)
-- Removed: 60-second cooldown (strict per-day rules are sufficient)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_outside_attendance(
  p_event_type text,
  p_note text DEFAULT '',
  p_client_ts timestamptz DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_ts timestamptz;
  v_log_id uuid;
  v_wib_date date;
  v_in_exists boolean;
  v_out_exists boolean;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  -- Reject if not authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Authentication required';
  END IF;
  
  -- Validate event_type
  IF p_event_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid event_type: must be IN or OUT';
  END IF;
  
  -- Validate employee is active
  IF NOT EXISTS (
    SELECT 1 FROM public.employees 
    WHERE id = v_user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Employee not found or inactive';
  END IF;
  
  -- Use server timestamp for consistency
  v_ts := now();
  v_wib_date := (v_ts AT TIME ZONE 'Asia/Jakarta')::date;

  -- Check existing logs for today (WIB) with source='outside'
  SELECT 
    EXISTS(
      SELECT 1 FROM attendance_logs 
      WHERE employee_id = v_user_id 
        AND source = 'outside' 
        AND event_type = 'IN' 
        AND (ts AT TIME ZONE 'Asia/Jakarta')::date = v_wib_date
    ),
    EXISTS(
      SELECT 1 FROM attendance_logs 
      WHERE employee_id = v_user_id 
        AND source = 'outside' 
        AND event_type = 'OUT' 
        AND (ts AT TIME ZONE 'Asia/Jakarta')::date = v_wib_date
    )
  INTO v_in_exists, v_out_exists;

  -- STRICT RULES
  IF p_event_type = 'IN' THEN
    IF v_in_exists THEN
       RAISE EXCEPTION USING MESSAGE = 'ALREADY_CHECKED_IN_TODAY';
    END IF;
  ELSIF p_event_type = 'OUT' THEN
    IF NOT v_in_exists THEN
       RAISE EXCEPTION USING MESSAGE = 'CANNOT_CHECK_OUT_BEFORE_CHECK_IN';
    END IF;
    IF v_out_exists THEN
       RAISE EXCEPTION USING MESSAGE = 'ALREADY_CHECKED_OUT_TODAY';
    END IF;
  END IF;

  -- Insert attendance log
  INSERT INTO public.attendance_logs (
    employee_id,
    ts,
    event_type,
    source,
    meta
  ) VALUES (
    v_user_id,
    v_ts,
    p_event_type,
    'outside',
    jsonb_build_object(
      'note', COALESCE(p_note, ''),
      'client_ts', p_client_ts,
      'extra', p_meta,
      'outside', true
    )
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;


-- =============================================================================
-- FUNCTION: recompute_my_attendance_today
-- Updates: 
--   - check_in = MIN(ts) WHERE event_type='IN'
--   - check_out = MAX(ts) WHERE event_type='OUT' (NULL if no OUT)
--   - Disable penalty if check_in source is 'outside'
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
  v_check_in_wib time;
  v_late_minutes int := 0;
  v_is_late boolean := false;
  v_is_penalized boolean := false;
  v_penalty int := 0;
  v_result jsonb;
  
  -- Constants (same as compute.ts)
  c_start_minutes int := 9 * 60;      -- 09:00 = 540 minutes
  c_grace_minutes int := 9 * 60 + 30; -- 09:30 = 570 minutes
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
  SELECT MIN(ts) INTO v_check_in
  FROM public.attendance_logs
  WHERE employee_id = v_emp
    AND event_type = 'IN'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = v_date;

  -- Get check_out: MAX(ts) where event_type='OUT' for today (WIB)
  SELECT MAX(ts) INTO v_check_out
  FROM public.attendance_logs
  WHERE employee_id = v_emp
    AND event_type = 'OUT'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = v_date;

  -- Determine check_in SOURCE (from the check_in log)
  IF v_check_in IS NOT NULL THEN
    SELECT source INTO v_check_in_source
    FROM public.attendance_logs
    WHERE employee_id = v_emp 
      AND ts = v_check_in 
      AND event_type = 'IN'
    LIMIT 1;
  END IF;

  -- If no check_in for today, return null result
  IF v_check_in IS NULL THEN
    RETURN jsonb_build_object(
      'employee_id', v_emp,
      'date', v_date,
      'check_in', null,
      'check_out', null,
      'late_minutes', 0,
      'is_late', false,
      'is_penalized', false,
      'penalty_amount', 0,
      'computed_at', now()
    );
  END IF;

  -- Calculate check-in time in WIB minutes from midnight
  v_check_in_wib := (v_check_in AT TIME ZONE 'Asia/Jakarta')::time;
  
  -- Calculate late minutes based on 09:00 start
  v_late_minutes := GREATEST(0, 
    (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int 
    - c_start_minutes
  );
  
  v_is_late := v_late_minutes > 0;
  
  -- Penalty logic: disable for outside attendance
  IF v_check_in_source = 'outside' THEN
      v_is_penalized := false;
      v_penalty := 0;
      -- Note: v_is_late remains true if late, but no penalty
  ELSE
      -- Normal rules
      v_is_penalized := (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int > c_grace_minutes;
      v_penalty := CASE WHEN v_is_penalized THEN c_penalty_amount ELSE 0 END;
  END IF;

  -- Upsert attendance_daily
  INSERT INTO public.attendance_daily (
    employee_id,
    date,
    check_in,
    check_out,
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
    'late_minutes', v_late_minutes,
    'is_late', v_is_late,
    'is_penalized', v_is_penalized,
    'penalty_amount', v_penalty,
    'computed_at', now()
  );

  RETURN v_result;
END;
$$;
