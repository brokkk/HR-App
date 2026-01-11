-- =============================================================================
-- Migration: requests
-- Creates requests and request_approvals tables for leave/overtime workflow
-- =============================================================================

-- =============================================================================
-- 1. REQUESTS TABLE
-- =============================================================================

CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('leave', 'overtime')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  start_date date NOT NULL,
  end_date date NULL,
  reason text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure end_date >= start_date if provided
  CONSTRAINT requests_date_range_check CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE public.requests IS 'Employee leave and overtime requests';
COMMENT ON COLUMN public.requests.type IS 'Request type: leave (cuti) or overtime (lembur)';
COMMENT ON COLUMN public.requests.status IS 'Status: draft, pending, approved, rejected';
COMMENT ON COLUMN public.requests.meta IS 'Additional data (e.g., leave type, overtime hours)';

-- =============================================================================
-- 2. REQUEST_APPROVALS TABLE
-- =============================================================================

CREATE TABLE public.request_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  notes text NOT NULL DEFAULT '',
  acted_at timestamptz NOT NULL DEFAULT now(),
  
  -- Only one approval decision per request (MVP)
  UNIQUE(request_id)
);

COMMENT ON TABLE public.request_approvals IS 'Approval/rejection records for requests';
COMMENT ON COLUMN public.request_approvals.action IS 'Approval action: approved or rejected';

-- =============================================================================
-- 3. INDEXES
-- =============================================================================

-- Find requests by employee
CREATE INDEX idx_requests_employee_created 
  ON public.requests(employee_id, created_at DESC);

-- Find requests by status for approval queue
CREATE INDEX idx_requests_status_created 
  ON public.requests(status, created_at DESC);

-- Find approvals by request (covered by unique, but explicit)
CREATE INDEX idx_request_approvals_request 
  ON public.request_approvals(request_id);

-- Find approvals by approver
CREATE INDEX idx_request_approvals_approver 
  ON public.request_approvals(approver_id, acted_at DESC);

-- =============================================================================
-- 4. AUTO-UPDATE updated_at TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_requests_updated_at();
