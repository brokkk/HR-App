import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeAuditLog } from '@/lib/audit/log'

export interface ApproveResponse {
    success: boolean
    error?: string
}

/**
 * POST /api/requests/[id]/approve
 * Approve or reject a request
 * Inserts into request_approvals — trigger updates requests.status
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApproveResponse>> {
    try {
        const { id: requestId } = await params
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { action, notes } = body as {
            action: 'approved' | 'rejected'
            notes?: string
        }

        // Validation
        if (!action || !['approved', 'rejected'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
        }

        // Get request type for audit
        const { data: req } = await supabase
            .from('requests')
            .select('type')
            .eq('id', requestId)
            .single()

        // Insert approval record (RLS + trigger will handle status update)
        const { error: approvalError } = await supabase
            .from('request_approvals')
            .insert({
                request_id: requestId,
                approver_id: user.id,
                action,
                notes: notes || '',
            })

        if (approvalError) {
            console.error('Approval error:', approvalError)

            // Check for unique constraint violation (already approved)
            if (approvalError.code === '23505') {
                return NextResponse.json({
                    success: false,
                    error: 'Request has already been processed'
                }, { status: 400 })
            }

            // Check for RLS violation
            if (approvalError.code === '42501') {
                return NextResponse.json({
                    success: false,
                    error: 'You do not have permission to approve this request'
                }, { status: 403 })
            }

            return NextResponse.json({ success: false, error: approvalError.message }, { status: 500 })
        }

        // Audit log
        await safeAuditLog(supabase, {
            action: action === 'approved' ? 'request_approved' : 'request_rejected',
            entity: 'requests',
            entity_id: requestId,
            meta: { type: req?.type || 'unknown', status: action },
        })

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Approve error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
