-- Migration: Allow employees to read basic info of other employees
-- This is needed for displaying AM names in overtime requests
-- Date: 2026-01-11

-- Allow any authenticated user to select basic employee info (id, full_name)
-- for employees who are Account Managers of active projects
CREATE POLICY emp_select_as_am ON public.employees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.account_manager_id = employees.id
        AND p.is_active = true
    )
  );

COMMENT ON POLICY emp_select_as_am ON public.employees IS 
'Allow any authenticated user to see employees who are Account Managers of active projects';
