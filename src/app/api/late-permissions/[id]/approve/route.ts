import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ApprovalResponse {
    success: boolean
    new_status?: string
    error?: string
}

/**
 * POST /api/late-permissions/[id]/approve
 * Approve or reject a late permission (Lead or COO)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApprovalResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()
        const { action, notes } = body

        if (!action || !['approved', 'rejected'].includes(action)) {
            return NextResponse.json({
                success: false,
                error: 'action must be "approved" or "rejected"'
            }, { status: 400 })
        }

        // Call RPC to approve/reject
        const { data: newStatus, error } = await supabase.rpc('approve_late_permission', {
            p_permission_id: id,
            p_action: action,
            p_notes: notes || ''
        })

        if (error) {
            // Return the error message from RPC
            return NextResponse.json({
                success: false,
                error: error.message
            }, { status: 403 })
        }

        return NextResponse.json({
            success: true,
            new_status: newStatus
        })

    } catch (error) {
        console.error('Late permission approval error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
