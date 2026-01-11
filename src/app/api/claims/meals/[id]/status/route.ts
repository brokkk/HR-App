import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeAuditLog } from '@/lib/audit/log'

export interface UpdateStatusResponse {
    success: boolean
    error?: string
}

/**
 * POST /api/claims/meals/[id]/status
 * HR/Owner updates claim status
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<UpdateStatusResponse>> {
    try {
        const { id: claimId } = await params
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { status, amount, note } = body as {
            status: 'approved' | 'rejected' | 'paid'
            amount?: number
            note?: string
        }

        if (!status || !['approved', 'rejected', 'paid'].includes(status)) {
            return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 })
        }

        // Build update object
        const updateData: Record<string, unknown> = { status }

        if (amount !== undefined) {
            updateData.amount = amount
        }
        if (note !== undefined) {
            updateData.note = note
        }
        if (status === 'paid') {
            updateData.paid_at = new Date().toISOString()
        }

        // Update claim - RLS enforces HR/Owner only
        const { error: updateError } = await supabase
            .from('overtime_meal_claims')
            .update(updateData)
            .eq('id', claimId)

        if (updateError) {
            if (updateError.code === '42501') {
                return NextResponse.json({
                    success: false,
                    error: 'You do not have permission to update claims'
                }, { status: 403 })
            }
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
        }

        // Audit log
        await safeAuditLog(supabase, {
            action: 'meal_claim_status_changed',
            entity: 'overtime_meal_claims',
            entity_id: claimId,
            meta: { status, amount: amount ?? null },
        })

        return NextResponse.json({ success: true })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
