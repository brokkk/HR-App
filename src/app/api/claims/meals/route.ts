import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export interface MealClaim {
    id: string
    employee_id: string
    request_id: string
    amount: number
    status: 'pending' | 'approved' | 'rejected' | 'paid'
    note: string
    created_at: string
    updated_at: string
    paid_at: string | null
}

export interface MealClaimsListResponse {
    success: boolean
    data?: MealClaim[]
    error?: string
}

export interface CreateMealClaimResponse {
    success: boolean
    data?: MealClaim
    error?: string
}

/**
 * GET /api/claims/meals
 * HR: all claims, Employee: own claims only
 */
export async function GET(request: NextRequest): Promise<NextResponse<MealClaimsListResponse>> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const isHR = ADMIN_EMAILS.includes(user.email || '')
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')

        let query = supabase
            .from('overtime_meal_claims')
            .select('*')
            .order('created_at', { ascending: false })

        // Filter by status if provided
        if (status) {
            query = query.eq('status', status)
        }

        // RLS will filter: HR sees all, employee sees own
        const { data, error } = await query

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data: data as MealClaim[] })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * POST /api/claims/meals
 * Employee creates a meal claim for approved overtime request
 */
export async function POST(request: NextRequest): Promise<NextResponse<CreateMealClaimResponse>> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { requestId, note } = body as { requestId: string; note?: string }

        if (!requestId) {
            return NextResponse.json({ success: false, error: 'requestId required' }, { status: 400 })
        }

        // Insert claim - RLS enforces request must be approved overtime
        const { data, error } = await supabase
            .from('overtime_meal_claims')
            .insert({
                employee_id: user.id,
                request_id: requestId,
                amount: 50000,
                status: 'pending',
                note: note || '',
            })
            .select()
            .single()

        if (error) {
            // Handle specific errors
            if (error.code === '23505') {
                return NextResponse.json({
                    success: false,
                    error: 'Claim already exists for this request'
                }, { status: 400 })
            }
            if (error.message.includes('overtime')) {
                return NextResponse.json({
                    success: false,
                    error: 'Meal claims can only be made for overtime requests'
                }, { status: 400 })
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data: data as MealClaim })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
