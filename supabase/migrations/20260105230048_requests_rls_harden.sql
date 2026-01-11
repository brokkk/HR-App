-- =============================================================================
-- Migration: requests_rls_harden
-- Restrict employee DELETE/UPDATE to draft/pending status only
-- =============================================================================

-- =============================================================================
-- DROP existing overly permissive policies (by specific names)
-- =============================================================================

-- Drop the original DELETE policy (was: status = 'draft' only, but let's recreate for consistency)
DROP POLICY IF EXISTS requests_delete_own ON public.requests;

-- Drop the original UPDATE policy (didn't restrict status field changes)
DROP POLICY IF EXISTS requests_update_own ON public.requests;

-- =============================================================================
-- RECREATE hardened policies
-- =============================================================================

-- Employee can DELETE own requests ONLY when status IN ('draft', 'pending')
-- This allows withdrawing a request before it's processed
CREATE POLICY requests_delete_own ON public.requests
  FOR DELETE
  USING (
    employee_id = auth.uid() 
    AND status IN ('draft', 'pending')
  );

-- Employee can UPDATE own requests ONLY when status IN ('draft', 'pending')
-- AND they cannot change status to approved/rejected directly
CREATE POLICY requests_update_own ON public.requests
  FOR UPDATE
  USING (
    employee_id = auth.uid() 
    AND status IN ('draft', 'pending')
  )
  WITH CHECK (
    employee_id = auth.uid()
    -- Allowed status values for employee: draft, pending only
    -- Cannot self-approve or self-reject
    AND status IN ('draft', 'pending')
  );

-- =============================================================================
-- Access Summary (After Hardening)
-- =============================================================================
-- 
-- EMPLOYEE:
--   SELECT: own requests (any status) ✓
--   INSERT: own requests ✓
--   UPDATE: own requests ONLY if status IN (draft, pending), cannot set approved/rejected ✓
--   DELETE: own requests ONLY if status IN (draft, pending) ✓
--
-- LEAD:
--   SELECT: leave requests from division (unchanged) ✓
--   UPDATE: none (approval via trigger)
--   DELETE: none
--
-- HR/OWNER:
--   SELECT: all requests (unchanged) ✓
--   UPDATE: all requests (for admin override) ✓
--   DELETE: none (audit-safe)
--
