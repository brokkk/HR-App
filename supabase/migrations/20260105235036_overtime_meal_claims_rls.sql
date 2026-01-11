-- =============================================================================
-- Migration: overtime_meal_claims_rls
-- RLS policies for overtime_meal_claims table
-- =============================================================================

-- =============================================================================
-- ENABLE RLS
-- =============================================================================

ALTER TABLE public.overtime_meal_claims ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- EMPLOYEE POLICIES
-- =============================================================================

-- Employee can SELECT own claims
CREATE POLICY meal_claims_select_own ON public.overtime_meal_claims
  FOR SELECT
  USING (employee_id = auth.uid());

-- Employee can INSERT claim only for their own approved overtime request
CREATE POLICY meal_claims_insert_own ON public.overtime_meal_claims
  FOR INSERT
  WITH CHECK (
    employee_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_id
        AND r.employee_id = auth.uid()
        AND r.type = 'overtime'
        AND r.status = 'approved'
    )
  );

-- NOTE: Employees cannot UPDATE or DELETE claims

-- =============================================================================
-- HR/OWNER POLICIES
-- =============================================================================

-- HR/Owner can SELECT all claims
CREATE POLICY meal_claims_select_hr ON public.overtime_meal_claims
  FOR SELECT
  USING (public.is_hr_or_owner());

-- HR/Owner can UPDATE all claims (status, amount, note)
CREATE POLICY meal_claims_update_hr ON public.overtime_meal_claims
  FOR UPDATE
  USING (public.is_hr_or_owner())
  WITH CHECK (public.is_hr_or_owner());

-- HR/Owner can DELETE claims (for admin cleanup if needed)
CREATE POLICY meal_claims_delete_hr ON public.overtime_meal_claims
  FOR DELETE
  USING (public.is_hr_or_owner());

-- =============================================================================
-- ACCESS SUMMARY
-- =============================================================================
-- 
-- EMPLOYEE:
--   SELECT: own claims only
--   INSERT: own claims only (request must be own, type='overtime', status='approved')
--   UPDATE: none
--   DELETE: none
--
-- HR/OWNER:
--   SELECT: all claims
--   INSERT: none (claims created by employees only)
--   UPDATE: all claims (status, amount, note, paid_at)
--   DELETE: all claims
--
