import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
const ENABLE_DEV_TOOLS = process.env.ENABLE_DEV_TOOLS === 'true'

/**
 * Validate UUID format
 */
function isValidUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

interface ClearRequest {
    seed_id: string
    range?: { start: string; end: string }
    employee_ids?: string[]
}

/**
 * POST /api/admin/dev/seed/clear
 * Clear demo data by seed_id, with optional range + employee_ids for attendance_daily cleanup
 */
export async function POST(request: NextRequest) {
    try {
        // Production guard
        if (process.env.NODE_ENV === 'production' && !ENABLE_DEV_TOOLS) {
            return NextResponse.json({ error: 'Dev tools disabled in production' }, { status: 404 })
        }

        const supabase = await createClient()

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Parse body
        const body = await request.json() as ClearRequest
        const { seed_id, range, employee_ids } = body

        if (!seed_id || !isValidUUID(seed_id)) {
            return NextResponse.json({ error: 'Valid seed_id required' }, { status: 400 })
        }

        // ===== 1. Delete overtime_meal_claims =====
        // First by meta.seed_id
        const { data: deletedClaimsByMeta } = await supabase
            .from('overtime_meal_claims')
            .delete()
            .contains('meta', { seed_id })
            .select('id')

        // Also delete claims linked to seeded requests
        const { data: seedRequests } = await supabase
            .from('requests')
            .select('id')
            .contains('meta', { seed_id })

        const requestIds = seedRequests?.map(r => r.id) || []

        let claimsByRequest = 0
        if (requestIds.length > 0) {
            const { data: deletedClaimsByReq } = await supabase
                .from('overtime_meal_claims')
                .delete()
                .in('request_id', requestIds)
                .select('id')
            claimsByRequest = deletedClaimsByReq?.length || 0
        }

        const claims_deleted = (deletedClaimsByMeta?.length || 0) + claimsByRequest

        // ===== 2. Delete request_approvals =====
        let approvals_deleted = 0
        if (requestIds.length > 0) {
            const { data: deletedApprovals } = await supabase
                .from('request_approvals')
                .delete()
                .in('request_id', requestIds)
                .select('id')

            approvals_deleted = deletedApprovals?.length || 0
        }

        // ===== 3. Delete requests =====
        const { data: deletedRequests } = await supabase
            .from('requests')
            .delete()
            .contains('meta', { seed_id })
            .select('id')

        const requests_deleted = deletedRequests?.length || 0

        // ===== 4. Delete attendance_logs =====
        const { data: deletedLogs } = await supabase
            .from('attendance_logs')
            .delete()
            .contains('meta', { seed_id })
            .select('id')

        const logs_deleted = deletedLogs?.length || 0

        // ===== 5. Delete attendance_daily =====
        // Use range + employee_ids if provided, otherwise fallback to deriving from logs
        let daily_deleted = 0

        if (range && employee_ids && employee_ids.length > 0) {
            // Direct deletion using provided range and employee_ids
            const { data: deletedDaily } = await supabase
                .from('attendance_daily')
                .delete()
                .in('employee_id', employee_ids)
                .gte('date', range.start)
                .lte('date', range.end)
                .select('id')

            daily_deleted = deletedDaily?.length || 0
        } else {
            // Fallback: try to find pairs from remaining logs (shouldn't happen with new flow)
            // Get affected logs before they were deleted (we already deleted them, so this is a backup)
            // In practice, the frontend should always send range + employee_ids
            console.log('Warning: range/employee_ids not provided, attendance_daily cleanup may be incomplete')
        }

        return NextResponse.json({
            success: true,
            seed_id,
            deleted: {
                logs_deleted,
                daily_deleted,
                requests_deleted,
                approvals_deleted,
                claims_deleted,
            },
        })

    } catch (error) {
        console.error('Clear API error:', error)
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
