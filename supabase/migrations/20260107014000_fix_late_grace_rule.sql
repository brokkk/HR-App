-- =============================================================================
-- Migration: fix_late_grace_rule
-- Fix late calculation: within grace (<= 09:30) means NOT late at all
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
  
  -- Grace Rule:
  -- If check-in <= 09:30 (570): NOT late at all
  -- If check-in > 09:30: late_minutes = check_in - 540
  IF v_check_in_minutes <= c_grace_minutes THEN
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
    'computed_at', now()
  );

  RETURN v_result;
END;
$$;

-- Also update submit_manual_attendance_fix to use the same grace rule
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

  -- Calculate late/penalty with GRACE RULE
  v_check_in_wib := (v_check_in AT TIME ZONE 'Asia/Jakarta')::time;
  v_check_in_minutes := (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int;
  
  IF v_check_in_minutes <= c_grace_minutes THEN
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
    'daily_id', v_daily_id
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.recompute_my_attendance_today IS 
'Recompute attendance for current user today.
Grace Rule: check-in <= 09:30 = NOT late (lateMinutes=0).
Check-in > 09:30 = late (lateMinutes = checkIn - 540).
Outside attendance has no penalty.';
