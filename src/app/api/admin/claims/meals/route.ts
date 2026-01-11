import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

interface MealClaimItem {
    id: string
    employee_id: string
    employee_name: string
    request_id: string | null
    amount: number
    status: string
    note: string | null
    created_at: string
    updated_at: string | null
    paid_at: string | null
}

interface MealClaimsResponse {
    success: boolean
    page?: number
    pageSize?: number
    total?: number
    items?: MealClaimItem[]
    error?: string
}

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'paid', 'all']

/**
 * GET /api/admin/claims/meals
 * List meal claims with pagination and filters
 */
export async function GET(request: NextRequest): Promise<NextResponse<MealClaimsResponse>> {
    try {
        const supabase = await createClient()

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const pageParam = parseInt(searchParams.get('page') || '1', 10)
        const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10)
        const statusParam = searchParams.get('status') || 'pending'
        const q = searchParams.get('q')?.trim().toLowerCase() || ''

        // Validate params
        const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam)
        const pageSize = Math.min(100, Math.max(1, isNaN(pageSizeParam) ? 20 : pageSizeParam))

        if (!VALID_STATUSES.includes(statusParam)) {
            return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 })
        }

        // Handle search: get matching employee IDs first
        let employeeIdFilter: string[] | null = null
        if (q) {
            const { data: matchingEmployees } = await supabase
                .from('employees')
                .select('id')
                .ilike('full_name', `%${q}%`)

            if (!matchingEmployees || matchingEmployees.length === 0) {
                return NextResponse.json({
                    success: true,
                    page,
                    pageSize,
                    total: 0,
                    items: [],
                })
            }
            employeeIdFilter = matchingEmployees.map(e => e.id)
        }

        // Build count query
        let countQuery = supabase
            .from('overtime_meal_claims')
            .select('id', { count: 'exact', head: true })

        if (statusParam !== 'all') {
            countQuery = countQuery.eq('status', statusParam)
        }
        if (employeeIdFilter) {
            countQuery = countQuery.in('employee_id', employeeIdFilter)
        }

        const { count, error: countError } = await countQuery

        if (countError) {
            return NextResponse.json({ success: false, error: countError.message }, { status: 500 })
        }

        const total = count ?? 0

        if (total === 0) {
            return NextResponse.json({
                success: true,
                page,
                pageSize,
                total: 0,
                items: [],
            })
        }

        // Build data query
        let dataQuery = supabase
            .from('overtime_meal_claims')
            .select('id, employee_id, request_id, amount, status, note, created_at, updated_at, paid_at')

        if (statusParam !== 'all') {
            dataQuery = dataQuery.eq('status', statusParam)
        }
        if (employeeIdFilter) {
            dataQuery = dataQuery.in('employee_id', employeeIdFilter)
        }

        // Order and paginate
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const { data: claims, error: claimsError } = await dataQuery
            .order('created_at', { ascending: false })
            .range(from, to)

        if (claimsError) {
            return NextResponse.json({ success: false, error: claimsError.message }, { status: 500 })
        }

        // 2-step mapping: fetch employees for this page
        const employeeIds = [...new Set((claims || []).map(c => c.employee_id))]
        let empMap = new Map<string, string>()

        if (employeeIds.length > 0) {
            const { data: employees } = await supabase
                .from('employees')
                .select('id, full_name')
                .in('id', employeeIds)

            if (employees) {
                empMap = new Map(employees.map(e => [e.id, e.full_name || 'Unknown']))
            }
        }

        // Map items
        const items: MealClaimItem[] = (claims || []).map(c => ({
            id: c.id,
            employee_id: c.employee_id,
            employee_name: empMap.get(c.employee_id) || 'Unknown',
            request_id: c.request_id,
            amount: c.amount,
            status: c.status,
            note: c.note,
            created_at: c.created_at,
            updated_at: c.updated_at,
            paid_at: c.paid_at,
        }))

        return NextResponse.json({
            success: true,
            page,
            pageSize,
            total,
            items,
        })

    } catch (error) {
        console.error('Meal claims API error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
