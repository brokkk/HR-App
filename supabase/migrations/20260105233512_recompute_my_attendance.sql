-- =============================================================================
-- Migration: recompute_my_attendance
-- SECURITY DEFINER function for employees to recompute their own daily record
-- =============================================================================

-- =============================================================================
-- FUNCTION: recompute_my_attendance_today
-- Computes attendance_daily for current user and WIB date
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
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate active employee
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_emp AND is_active = true) THEN
    RAISE EXCEPTION 'Inactive employee';
  END IF;

  -- Get min/max timestamps for WIB date
  SELECT min(ts), max(ts)
  INTO v_check_in, v_check_out
  FROM public.attendance_logs
  WHERE employee_id = v_emp
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = v_date;

  -- If no logs for today, return null result
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
  
  -- Check if beyond grace period (09:30)
  v_is_penalized := (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int > c_grace_minutes;
  
  v_penalty := CASE WHEN v_is_penalized THEN c_penalty_amount ELSE 0 END;

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

-- =============================================================================
-- GRANT
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.recompute_my_attendance_today() TO authenticated;

-- =============================================================================
-- COMMENT
-- =============================================================================

COMMENT ON FUNCTION public.recompute_my_attendance_today IS 
'Computes and upserts attendance_daily for the authenticated employee for today (WIB).

Security:
- SECURITY DEFINER: allows employee to update their own daily record
- Only affects own data (employee_id = auth.uid())
- Validates active employee status

Penalty rules (same as compute.ts):
- Start: 09:00 WIB
- Grace period: 30 min (until 09:30)
- Penalty: Rp 50.000 if check_in > 09:30

Returns: JSON object with computed daily record';
