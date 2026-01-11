-- =============================================================================
-- Migration: attendance_source_tracking
-- Adds check_in_source and check_out_source columns to attendance_daily
-- =============================================================================

-- Add source columns
ALTER TABLE public.attendance_daily
ADD COLUMN IF NOT EXISTS check_in_source text NULL,
ADD COLUMN IF NOT EXISTS check_out_source text NULL;

-- Add check constraint for valid source values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_check_in_source'
  ) THEN
    ALTER TABLE public.attendance_daily
    ADD CONSTRAINT chk_check_in_source 
    CHECK (check_in_source IS NULL OR check_in_source IN ('fingerprint', 'outside', 'manual', 'import'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_check_out_source'
  ) THEN
    ALTER TABLE public.attendance_daily
    ADD CONSTRAINT chk_check_out_source 
    CHECK (check_out_source IS NULL OR check_out_source IN ('fingerprint', 'outside', 'manual', 'import'));
  END IF;
END $$;

-- Update recompute_my_attendance_today to include source tracking
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
