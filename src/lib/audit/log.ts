import type { SupabaseClient } from '@supabase/supabase-js'

interface AuditLogParams {
    action: string
    entity: string
    entity_id?: string | null
    meta?: Record<string, unknown>
}

/**
 * Safely log an audit event - never throws, never blocks main operation
 */
export async function safeAuditLog(
    supabase: SupabaseClient,
    { action, entity, entity_id, meta }: AuditLogParams
): Promise<void> {
    try {
        await supabase.rpc('log_audit', {
            p_action: action,
            p_entity: entity,
            p_entity_id: entity_id ?? null,
            p_meta: meta ?? {},
        })
    } catch (e) {
        console.warn('Audit log failed:', e)
    }
}
