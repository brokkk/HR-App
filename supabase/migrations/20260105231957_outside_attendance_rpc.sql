-- =============================================================================
-- Migration: outside_attendance_rpc
-- SECURITY DEFINER function for employees to submit outside attendance
-- =============================================================================

-- =============================================================================
-- FUNCTION: submit_outside_attendance
-- Allows employees to submit "Absen Luar Kantor" securely
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
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  -- Reject if not authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Validate event_type
  IF p_event_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Invalid event_type: must be IN or OUT';
  END IF;
  
  -- Validate employee is active
  IF NOT EXISTS (
    SELECT 1 FROM public.employees 
    WHERE id = v_user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Employee not found or inactive';
  END IF;
  
  -- Anti-spam: reject if submitted within last 60 seconds
  IF EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE employee_id = v_user_id
      AND source = 'outside'
      AND ts > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Too frequent: please wait before submitting again';
  END IF;
  
  -- Use server timestamp for consistency
  v_ts := now();
  
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
      'extra', p_meta
    )
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- =============================================================================
-- GRANT
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.submit_outside_attendance(text, text, timestamptz, jsonb) 
  TO authenticated;

-- =============================================================================
-- COMMENT
-- =============================================================================

COMMENT ON FUNCTION public.submit_outside_attendance IS 
'Allows authenticated employees to submit outside attendance (Absen Luar Kantor).

Security:
- SECURITY DEFINER: executes with owner privileges to bypass RLS
- Validates authenticated user exists and is active employee
- Anti-spam: rejects submissions within 60 seconds of previous
- Uses server timestamp for consistency

Parameters:
- p_event_type: ''IN'' or ''OUT''
- p_note: optional description
- p_client_ts: client timestamp (stored in meta for audit)
- p_meta: additional metadata

Returns: UUID of created attendance_logs record';
