-- =============================================================================
-- Migration: overtime_meal_claims
-- Table for overtime meal allowance claims
-- =============================================================================

-- =============================================================================
-- TABLE
-- =============================================================================

CREATE TABLE public.overtime_meal_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  amount int NOT NULL DEFAULT 50000 CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  note text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  
  -- Prevent double claim per request
  UNIQUE(request_id)
);

COMMENT ON TABLE public.overtime_meal_claims IS 'Overtime meal allowance claims (uang makan lembur)';
COMMENT ON COLUMN public.overtime_meal_claims.amount IS 'Claim amount in IDR, default 50000';
COMMENT ON COLUMN public.overtime_meal_claims.status IS 'pending, approved, rejected, or paid';
COMMENT ON COLUMN public.overtime_meal_claims.paid_at IS 'Timestamp when claim was marked as paid';

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_meal_claims_employee_created 
  ON public.overtime_meal_claims(employee_id, created_at DESC);

CREATE INDEX idx_meal_claims_status_created 
  ON public.overtime_meal_claims(status, created_at DESC);

-- =============================================================================
-- AUTO-UPDATE updated_at TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_meal_claims_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meal_claims_updated_at
  BEFORE UPDATE ON public.overtime_meal_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meal_claims_updated_at();

-- =============================================================================
-- VALIDATE REQUEST TYPE TRIGGER (optional safety check)
-- Ensures claim can only be created for overtime requests
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_meal_claim_request()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verify the linked request is type 'overtime'
  IF NOT EXISTS (
    SELECT 1 FROM public.requests
    WHERE id = NEW.request_id
      AND type = 'overtime'
  ) THEN
    RAISE EXCEPTION 'Meal claims can only be made for overtime requests';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_meal_claim_request
  BEFORE INSERT ON public.overtime_meal_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_meal_claim_request();
