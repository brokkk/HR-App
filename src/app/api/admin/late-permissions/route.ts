import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export interface AdminLatePermission {
    id: string
    employee_id: string
    employee_name: string
    division_name: string | null
    date: string
    category: string
    max_check_in_time: string
    reason: string
    status: string
    proof_path: string | null
    proof_url: string | null
    has_overtime_yesterday: boolean
    created_at: string
}

interface AdminLatePermissionResponse {
    success: boolean
    items?: AdminLatePermission[]
    total?: number
    error?: string
}

/**
 * Check if user is HR/Owner
 */
async function isHrOrOwner(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    userEmail: string | null
): Promise<boolean> {
    if (ADMIN_EMAILS.includes(userEmail || '')) return true

    const { data: emp } = await supabase
        .from('employees')
        .select('role')
        .eq('id', userId)
        .single()

    return emp?.role === 'hr' || emp?.role === 'owner'
}

/**
 * GET /api/admin/late-permissions
 * List all late permissions (HR only)
 * Query params: start, end, q (search), category
 */
export async function GET(request: NextRequest): Promise<NextResponse<AdminLatePermissionResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        if (!await isHrOrOwner(supabase, user.id, user.email ?? null)) {
            return NextResponse.json({ success: false, error: 'HR/Owner only' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const startDate = searchParams.get('start')
        const endDate = searchParams.get('end')
        const search = searchParams.get('q')
        const category = searchParams.get('category')

        // Build query
        let query = supabase
            .from('late_permissions')
            .select('*')
            .order('date', { ascending: false })
            .limit(100)

        if (startDate) {
            query = query.gte('date', startDate)
        }
        if (endDate) {
            query = query.lte('date', endDate)
        }
        if (category) {
            query = query.eq('category', category)
        }

        const { data: permissions, error } = await query

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        if (!permissions || permissions.length === 0) {
            return NextResponse.json({ success: true, items: [], total: 0 })
        }

        // Get employee details
        const employeeIds = [...new Set(permissions.map(p => p.employee_id))]
        const { data: employees } = await supabase
            .from('employees')
            .select('id, full_name, division_id')
            .in('id', employeeIds)

        const employeeMap = new Map(employees?.map(e => [e.id, e]) || [])

        // Get division names
        const divisionIds = [...new Set(employees?.map(e => e.division_id).filter(Boolean) || [])]
        let divisionMap = new Map<string, string>()
        if (divisionIds.length > 0) {
            const { data: divisions } = await supabase
                .from('divisions')
                .select('id, name')
                .in('id', divisionIds)
            divisionMap = new Map(divisions?.map(d => [d.id, d.name]) || [])
        }

        // Check for overtime on previous day (for habis_lembur category)
        const overtimeChecks = new Map<string, boolean>()
        const habisLemburPermissions = permissions.filter(p => p.category === 'habis_lembur')

        if (habisLemburPermissions.length > 0) {
            for (const perm of habisLemburPermissions) {
                const prevDate = new Date(perm.date)
                prevDate.setDate(prevDate.getDate() - 1)
                const prevDateStr = prevDate.toISOString().split('T')[0]

                const { data: overtime } = await supabase
                    .from('requests')
                    .select('id')
                    .eq('employee_id', perm.employee_id)
                    .eq('type', 'overtime')
                    .eq('status', 'approved')
                    .or(`start_date.eq.${prevDateStr},end_date.eq.${prevDateStr}`)
                    .limit(1)

                const key = `${perm.employee_id}:${perm.date}`
                overtimeChecks.set(key, (overtime?.length || 0) > 0)
            }
        }

        // Map results with employee info and proof URLs
        const items: AdminLatePermission[] = []

        for (const perm of permissions) {
            const emp = employeeMap.get(perm.employee_id)
            const key = `${perm.employee_id}:${perm.date}`

            // Filter by search if provided
            if (search) {
                const searchLower = search.toLowerCase()
                const nameMatch = emp?.full_name?.toLowerCase().includes(searchLower)
                const reasonMatch = perm.reason?.toLowerCase().includes(searchLower)
                if (!nameMatch && !reasonMatch) continue
            }

            // Get signed URL for proof if exists
            let proofUrl: string | null = null
            if (perm.proof_path) {
                const { data: signedData } = await supabase.storage
                    .from('late-proofs')
                    .createSignedUrl(perm.proof_path, 3600)
                proofUrl = signedData?.signedUrl || null
            }

            items.push({
                id: perm.id,
                employee_id: perm.employee_id,
                employee_name: emp?.full_name || 'Unknown',
                division_name: emp?.division_id ? divisionMap.get(emp.division_id) || null : null,
                date: perm.date,
                category: perm.category,
                max_check_in_time: perm.max_check_in_time,
                reason: perm.reason,
                status: perm.status,
                proof_path: perm.proof_path,
                proof_url: proofUrl,
                has_overtime_yesterday: perm.category === 'habis_lembur' ? overtimeChecks.get(key) || false : false,
                created_at: perm.created_at,
            })
        }

        return NextResponse.json({ success: true, items, total: items.length })

    } catch (error) {
        console.error('Admin late permissions API error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
