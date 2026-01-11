-- =============================================================================
-- Migration: manual_attendance_fix
-- Allows HR/Owner to fix attendance for employee+date
-- =============================================================================

-- =============================================================================
-- FUNCTION: submit_manual_attendance_fix
-- HR/Owner can insert/update manual check-in/out and recompute daily
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
  v_late_minutes int := 0;
  v_is_late boolean := false;
  v_is_penalized boolean := false;
  v_penalty int := 0;
  v_result jsonb;
  v_daily_id uuid;
  
  c_start_minutes int := 9 * 60;
  c_grace_minutes int := 9 * 60 + 30;
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
  -- Get check_in: MIN(ts) where event_type='IN' for the date (WIB)
  SELECT ts, source INTO v_check_in, v_check_in_source
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND event_type = 'IN'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = p_date
  ORDER BY ts ASC
  LIMIT 1;

  -- Get check_out: MAX(ts) where event_type='OUT' for the date (WIB)
  SELECT ts, source INTO v_check_out, v_check_out_source
  FROM attendance_logs
  WHERE employee_id = p_employee_id
    AND event_type = 'OUT'
    AND (ts AT TIME ZONE 'Asia/Jakarta')::date = p_date
  ORDER BY ts DESC
  LIMIT 1;

  -- If no check_in, return early with empty result
  IF v_check_in IS NULL THEN
    RETURN jsonb_build_object(
      'employee_id', p_employee_id,
      'date', p_date,
      'check_in', null,
      'check_out', null,
      'message', 'No check-in found for this date'
    );
  END IF;

  -- Calculate late/penalty
  v_check_in_wib := (v_check_in AT TIME ZONE 'Asia/Jakarta')::time;
  v_late_minutes := GREATEST(0, 
    (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int 
    - c_start_minutes
  );
  v_is_late := v_late_minutes > 0;

  -- Manual fix: set penalty based on normal rules (not outside-exempt)
  IF v_check_in_source = 'outside' THEN
    v_is_penalized := false;
    v_penalty := 0;
  ELSE
    v_is_penalized := (EXTRACT(HOUR FROM v_check_in_wib) * 60 + EXTRACT(MINUTE FROM v_check_in_wib))::int > c_grace_minutes;
    v_penalty := CASE WHEN v_is_penalized THEN c_penalty_amount ELSE 0 END;
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

-- Grant
GRANT EXECUTE ON FUNCTION public.submit_manual_attendance_fix(uuid, date, timestamptz, timestamptz, text) TO authenticated;

-- Comment
COMMENT ON FUNCTION public.submit_manual_attendance_fix IS 
'HR/Owner can fix attendance for a specific employee+date.
- Inserts manual logs with source=manual
- Recomputes attendance_daily
- Records audit log entry
Returns the updated daily record as JSON.';
