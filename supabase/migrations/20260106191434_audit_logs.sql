-- =============================================================================
-- Migration: Audit Logs
-- Description: Lightweight audit logging for accountability and debugging
-- =============================================================================

-- =============================================================================
-- 1. Create audit_logs table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS 'Audit log for tracking important actions';
COMMENT ON COLUMN public.audit_logs.actor_id IS 'User who performed the action (null if system)';
COMMENT ON COLUMN public.audit_logs.action IS 'Action type (e.g., request_approved, employee_updated)';
COMMENT ON COLUMN public.audit_logs.entity IS 'Entity type (e.g., requests, employees, divisions)';
COMMENT ON COLUMN public.audit_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN public.audit_logs.meta IS 'Additional context as JSON';

-- =============================================================================
-- 2. Indexes for efficient querying
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
    ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created_at 
    ON public.audit_logs (entity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at 
    ON public.audit_logs (actor_id, created_at DESC);

-- =============================================================================
-- 3. Enable Row Level Security
-- =============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. SECURITY DEFINER function for inserting audit logs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_audit(
    p_action text,
    p_entity text,
    p_entity_id uuid DEFAULT NULL,
    p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, meta, created_at)
    VALUES (auth.uid(), p_action, p_entity, p_entity_id, p_meta, now());
END;
$$;

COMMENT ON FUNCTION public.log_audit IS 'Insert audit log entry with current user as actor';

-- =============================================================================
-- 5. Grant execute permission to authenticated users
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO authenticated;

-- =============================================================================
-- 6. RLS Policies (SELECT only, no direct writes)
-- =============================================================================

-- HR/Owner can see all audit logs
CREATE POLICY "HR/Owner can view all audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (public.is_hr_or_owner());

-- Users can see their own audit logs
CREATE POLICY "Users can view own audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (actor_id = auth.uid());

-- =============================================================================
-- No INSERT/UPDATE/DELETE policies - only via log_audit() function
-- =============================================================================
