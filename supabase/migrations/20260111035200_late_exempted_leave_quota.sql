-- Migration: Add late_exempted and annual_leave_quota
-- Date: 2026-01-11

-- Add late_exempted flag to attendance_daily
-- When true, this day has approved late permission and penalty is exempted
ALTER TABLE public.attendance_daily 
ADD COLUMN IF NOT EXISTS late_exempted BOOLEAN DEFAULT FALSE;

-- Add annual_leave_quota to employees
-- Default 12 days annual leave quota
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS annual_leave_quota INTEGER DEFAULT 12;

-- Add comment for clarity
COMMENT ON COLUMN public.attendance_daily.late_exempted IS 'True if late permission was approved, penalty exempted';
COMMENT ON COLUMN public.employees.annual_leave_quota IS 'Annual leave days quota, default 12';
