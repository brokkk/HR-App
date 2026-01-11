-- =============================================================================
-- Migration: RLS Policies for HR App
-- Created: 2026-01-05
-- 
-- HELPER FUNCTIONS (all SECURITY DEFINER, search_path = public)
-- - get_my_role(): returns employee's role, defaults to 'employee' if no row
-- - is_hr_or_owner(): checks if current user has hr/owner role
-- - get_my_division_id(): returns current user's division_id, null if none
-- - is_lead_of(target_emp_id): checks if user is lead of target's division
--
-- POLICIES:
-- - employees: 5 policies (select own, select as lead, select as hr, update own name, all hr)
-- - divisions: 2 policies (select all, all hr)
-- - attendance_logs: 4 policies (select own, select as lead, all hr, insert hr)
-- - attendance_daily: 4 policies (select own, select as lead, all hr, write hr)
-- - attendance_import_batches: 1 policy (all hr)
-- =============================================================================

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get current user's role from employees table
-- Returns 'employee' if no row found (graceful fallback)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role FROM employees WHERE id = auth.uid()),
    'employee'
  );
$$;

-- Check if current user is HR or Owner
CREATE OR REPLACE FUNCTION public.is_hr_or_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.get_my_role() IN ('hr', 'owner');
$$;

-- Get current user's division_id
-- Returns null if no employee row or no division assigned
CREATE OR REPLACE FUNCTION public.get_my_division_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT division_id FROM employees WHERE id = auth.uid();
$$;

-- Check if current user is the lead of the target employee's division
-- Returns false if:
--   - target has no division_id (null)
--   - division has no lead_employee_id
--   - lead_employee_id != auth.uid()
CREATE OR REPLACE FUNCTION public.is_lead_of(target_employee_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM employees e
    INNER JOIN divisions d ON d.id = e.division_id
    WHERE e.id = target_employee_id
      AND e.division_id IS NOT NULL
      AND d.lead_employee_id = auth.uid()
  );
$$;

-- Safe function for employees to update ONLY their own full_name
-- This replaces direct UPDATE policy to prevent column leakage
CREATE OR REPLACE FUNCTION public.update_my_full_name(p_full_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE employees
  SET full_name = p_full_name
  WHERE id = auth.uid();
END;
$$;

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_import_batches ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES: employees
-- =============================================================================

-- Employee can select their own row
CREATE POLICY emp_select_own ON public.employees
  FOR SELECT
  USING (id = auth.uid());

-- Lead can select employees in their division (strict: division_id NOT NULL)
CREATE POLICY emp_select_as_lead ON public.employees
  FOR SELECT
  USING (public.is_lead_of(id));

-- HR/Owner can select all employees
CREATE POLICY emp_select_hr ON public.employees
  FOR SELECT
  USING (public.is_hr_or_owner());

-- NOTE: Employees cannot UPDATE employees table directly.
-- They must use the update_my_full_name() function instead.
-- This prevents updating role, division_id, fingerprint, is_active.

-- HR/Owner has full access (INSERT, UPDATE, DELETE)
CREATE POLICY emp_insert_hr ON public.employees
  FOR INSERT
  WITH CHECK (public.is_hr_or_owner());

CREATE POLICY emp_update_hr ON public.employees
  FOR UPDATE
  USING (public.is_hr_or_owner());

CREATE POLICY emp_delete_hr ON public.employees
  FOR DELETE
  USING (public.is_hr_or_owner());

-- =============================================================================
-- POLICIES: divisions
-- =============================================================================

-- All authenticated users can read divisions (needed for display)
CREATE POLICY div_select_all ON public.divisions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- HR/Owner has full access
CREATE POLICY div_insert_hr ON public.divisions
  FOR INSERT
  WITH CHECK (public.is_hr_or_owner());

CREATE POLICY div_update_hr ON public.divisions
  FOR UPDATE
  USING (public.is_hr_or_owner());

CREATE POLICY div_delete_hr ON public.divisions
  FOR DELETE
  USING (public.is_hr_or_owner());

-- =============================================================================
-- POLICIES: attendance_logs
-- =============================================================================

-- Employee can select their own logs
CREATE POLICY logs_select_own ON public.attendance_logs
  FOR SELECT
  USING (employee_id = auth.uid());

-- Lead can select logs for employees in their division
CREATE POLICY logs_select_as_lead ON public.attendance_logs
  FOR SELECT
  USING (public.is_lead_of(employee_id));

-- HR/Owner can select all logs
CREATE POLICY logs_select_hr ON public.attendance_logs
  FOR SELECT
  USING (public.is_hr_or_owner());

-- HR/Owner can insert logs (for manual entry, import)
CREATE POLICY logs_insert_hr ON public.attendance_logs
  FOR INSERT
  WITH CHECK (public.is_hr_or_owner());

-- HR/Owner can update logs
CREATE POLICY logs_update_hr ON public.attendance_logs
  FOR UPDATE
  USING (public.is_hr_or_owner());

-- HR/Owner can delete logs
CREATE POLICY logs_delete_hr ON public.attendance_logs
  FOR DELETE
  USING (public.is_hr_or_owner());

-- =============================================================================
-- POLICIES: attendance_daily
-- =============================================================================

-- Employee can select their own daily records
CREATE POLICY daily_select_own ON public.attendance_daily
  FOR SELECT
  USING (employee_id = auth.uid());

-- Lead can select daily records for employees in their division
CREATE POLICY daily_select_as_lead ON public.attendance_daily
  FOR SELECT
  USING (public.is_lead_of(employee_id));

-- HR/Owner can select all daily records
CREATE POLICY daily_select_hr ON public.attendance_daily
  FOR SELECT
  USING (public.is_hr_or_owner());

-- HR/Owner can insert daily records (for computation jobs)
CREATE POLICY daily_insert_hr ON public.attendance_daily
  FOR INSERT
  WITH CHECK (public.is_hr_or_owner());

-- HR/Owner can update daily records
CREATE POLICY daily_update_hr ON public.attendance_daily
  FOR UPDATE
  USING (public.is_hr_or_owner());

-- HR/Owner can delete daily records
CREATE POLICY daily_delete_hr ON public.attendance_daily
  FOR DELETE
  USING (public.is_hr_or_owner());

-- =============================================================================
-- POLICIES: attendance_import_batches
-- =============================================================================

-- Only HR/Owner can access import batches
CREATE POLICY batches_select_hr ON public.attendance_import_batches
  FOR SELECT
  USING (public.is_hr_or_owner());

CREATE POLICY batches_insert_hr ON public.attendance_import_batches
  FOR INSERT
  WITH CHECK (public.is_hr_or_owner());

CREATE POLICY batches_update_hr ON public.attendance_import_batches
  FOR UPDATE
  USING (public.is_hr_or_owner());

CREATE POLICY batches_delete_hr ON public.attendance_import_batches
  FOR DELETE
  USING (public.is_hr_or_owner());

-- =============================================================================
-- GRANT USAGE (ensure authenticated users can call helper functions)
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hr_or_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_division_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lead_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_full_name(text) TO authenticated;
