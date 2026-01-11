import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeAuditLog } from '@/lib/audit/log'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export interface EmployeeWithDivision {
    id: string
    full_name: string | null
    division_id: string | null
    division_name: string | null
    role: string
    is_active: boolean
    fingerprint_external_id: string | null
    created_at: string
}

export interface DivisionOption {
    id: string
    name: string
}

export interface EmployeesResponse {
    success: boolean
    page?: number
    pageSize?: number
    total?: number
    items?: EmployeeWithDivision[]
    divisions?: DivisionOption[]
    error?: string
}

/**
 * GET /api/admin/employees
 * List employees with pagination and search
 * Query params: page (default 1), pageSize (default 20, max 100), q (optional search)
 */
export async function GET(request: NextRequest): Promise<NextResponse<EmployeesResponse>> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const pageParam = parseInt(searchParams.get('page') || '1', 10)
        const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10)
        const q = searchParams.get('q')?.trim() || ''

        // Validate
        const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam)
        const pageSize = Math.min(100, Math.max(1, isNaN(pageSizeParam) ? 20 : pageSizeParam))

        // Build query with count
        let query = supabase
            .from('employees')
            .select('id, full_name, division_id, role, is_active, fingerprint_external_id, created_at', { count: 'exact' })

        // Apply search filter
        if (q) {
            query = query.ilike('full_name', `%${q}%`)
        }

        // Order and paginate
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const { data: employees, error: empError, count } = await query
            .order('full_name', { ascending: true, nullsFirst: false })
            .range(from, to)

        if (empError) {
            return NextResponse.json({ success: false, error: empError.message }, { status: 500 })
        }

        const total = count ?? 0

        // Fetch divisions for mapping (only for returned employees)
        const divisionIds = [...new Set((employees || []).map(e => e.division_id).filter(Boolean))]
        let divMap = new Map<string, string>()

        if (divisionIds.length > 0) {
            const { data: divisions } = await supabase
                .from('divisions')
                .select('id, name')
                .in('id', divisionIds)

            if (divisions) {
                divMap = new Map(divisions.map(d => [d.id, d.name]))
            }
        }

        // Also fetch all divisions for dropdown
        const { data: allDivisions } = await supabase
            .from('divisions')
            .select('id, name')
            .order('name')

        // Map division names onto employees
        const items: EmployeeWithDivision[] = (employees || []).map(e => ({
            ...e,
            division_name: e.division_id ? divMap.get(e.division_id) || null : null,
        }))

        return NextResponse.json({
            success: true,
            page,
            pageSize,
            total,
            items,
            divisions: allDivisions || [],
        })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * PATCH /api/admin/employees
 * Update employee fields
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { id, full_name, role, division_id, is_active, fingerprint_external_id } = body as {
            id: string
            full_name?: string
            role?: 'employee' | 'lead' | 'hr' | 'owner'
            division_id?: string | null
            is_active?: boolean
            fingerprint_external_id?: string | null
        }

        if (!id) {
            return NextResponse.json({ success: false, error: 'Employee id required' }, { status: 400 })
        }

        const updateData: Record<string, unknown> = {}

        if (full_name !== undefined) {
            updateData.full_name = full_name.trim() || null
        }
        if (role !== undefined) {
            if (!['employee', 'lead', 'hr', 'owner'].includes(role)) {
                return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 })
            }
            updateData.role = role
        }
        if (division_id !== undefined) {
            updateData.division_id = division_id
        }
        if (is_active !== undefined) {
            updateData.is_active = is_active
        }
        if (fingerprint_external_id !== undefined) {
            updateData.fingerprint_external_id = fingerprint_external_id?.trim() || null
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('employees')
            .update(updateData)
            .eq('id', id)
            .select()
            .single()

        if (error) {
            if (error.code === '23505' && error.message.includes('fingerprint')) {
                return NextResponse.json({
                    success: false,
                    error: 'Fingerprint ID sudah dipakai oleh karyawan lain.'
                }, { status: 400 })
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        // Audit log
        await safeAuditLog(supabase, {
            action: 'employee_updated',
            entity: 'employees',
            entity_id: id,
            meta: { changed_fields: Object.keys(updateData) },
        })

        return NextResponse.json({ success: true, data })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * DELETE /api/admin/employees
 * Delete an employee (removes from employees table and optionally from auth)
 * Query params: id (required), deleteAuth (optional, default false)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        const deleteAuth = searchParams.get('deleteAuth') === 'true'

        if (!id) {
            return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
        }

        // Get employee name for audit log
        const { data: emp } = await supabase
            .from('employees')
            .select('full_name')
            .eq('id', id)
            .single()

        // Delete from employees table
        const { error: deleteError } = await supabase
            .from('employees')
            .delete()
            .eq('id', id)

        if (deleteError) {
            return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 })
        }

        // Optionally delete from auth (requires service role)
        if (deleteAuth) {
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

            if (serviceRoleKey && supabaseUrl) {
                const { createClient: createAdminClient } = await import('@supabase/supabase-js')
                const adminClient = createAdminClient(supabaseUrl, serviceRoleKey, {
                    auth: { autoRefreshToken: false, persistSession: false }
                })

                await adminClient.auth.admin.deleteUser(id)
            }
        }

        // Audit log
        await safeAuditLog(supabase, {
            action: 'employee_deleted',
            entity: 'employees',
            entity_id: id,
            meta: { full_name: emp?.full_name, delete_auth: deleteAuth },
        })

        return NextResponse.json({ success: true })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
