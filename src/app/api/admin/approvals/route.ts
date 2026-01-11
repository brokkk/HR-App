import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

interface ApprovalItem {
    id: string
    kind: 'request' | 'late_permission'
    type: string  // leave, overtime, urgent, hujan, habis_lembur
    status: string
    start_date: string
    end_date: string
    reason: string | null
    employee_id: string
    employee_name: string
    division_name: string
    project_id: string | null
    project_name: string | null
    // Late permission specific
    max_check_in_time?: string
    category?: string
    created_at: string
}

interface ApprovalsResponse {
    success: boolean
    page?: number
    pageSize?: number
    total?: number
    items?: ApprovalItem[]
    userRole?: string
    error?: string
}

const VALID_TYPES = ['all', 'leave', 'overtime']
const VALID_STATUSES = ['pending', 'processed', 'all']
const VALID_KINDS = ['all', 'requests', 'late']

/**
 * GET /api/admin/approvals
 * 
 * Access rules:
 * - Admin (ADMIN_EMAILS) / HR / Owner: sees all
 * - Lead: sees leave requests from their division (status=pending) + late_permissions pending_lead
 * - AM: sees overtime requests for their projects (status=pending_am)
 * 
 * Query params:
 * - kind: all|requests|late (default: all)
 * - type: all|leave|overtime (default: all) - only for requests kind
 * - status: pending|all (default: pending)
 * - page, pageSize, q
 */
export async function GET(request: NextRequest): Promise<NextResponse<ApprovalsResponse>> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Determine user role and context
        const isAdmin = ADMIN_EMAILS.includes(user.email || '')
        let userRole = 'employee'
        let userDivisionId: string | null = null
        let amProjectIds: string[] = []

        if (!isAdmin) {
            const { data: employee } = await supabase
                .from('employees')
                .select('role, division_id')
                .eq('id', user.id)
                .single()

            if (!employee) {
                return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
            }

            userRole = employee.role
            userDivisionId = employee.division_id

            // Get projects where user is AM
            const { data: amProjects } = await supabase
                .from('projects')
                .select('id')
                .eq('account_manager_id', user.id)
                .eq('is_active', true)

            amProjectIds = (amProjects || []).map(p => p.id)
        }

        // Determine access level
        const isHrOrOwner = isAdmin || userRole === 'hr' || userRole === 'owner'
        const isLead = userRole === 'lead'
        const isAM = amProjectIds.length > 0
        const isCOO = userRole === 'owner'  // COO approves pending_coo

        // Must have some approval access
        if (!isHrOrOwner && !isLead && !isAM) {
            return NextResponse.json({ success: false, error: 'No approval access' }, { status: 403 })
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const pageParam = parseInt(searchParams.get('page') || '1', 10)
        const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10)
        const typeParam = searchParams.get('type') || 'all'
        const statusParam = searchParams.get('status') || 'pending'
        const kindParam = searchParams.get('kind') || 'all'
        const q = searchParams.get('q')?.trim().toLowerCase() || ''
        const startDate = searchParams.get('startDate') || ''
        const endDate = searchParams.get('endDate') || ''

        const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam)
        const pageSize = Math.min(100, Math.max(1, isNaN(pageSizeParam) ? 20 : pageSizeParam))

        if (!VALID_TYPES.includes(typeParam)) {
            return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 })
        }
        if (!VALID_STATUSES.includes(statusParam)) {
            return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 })
        }
        if (!VALID_KINDS.includes(kindParam)) {
            return NextResponse.json({ success: false, error: 'Invalid kind' }, { status: 400 })
        }

        // Search filter - get employee IDs matching search
        let employeeIdFilter: string[] | null = null
        if (q) {
            const { data: matchingEmployees } = await supabase
                .from('employees')
                .select('id')
                .ilike('full_name', `%${q}%`)

            if (!matchingEmployees || matchingEmployees.length === 0) {
                return NextResponse.json({ success: true, page, pageSize, total: 0, items: [], userRole })
            }
            employeeIdFilter = matchingEmployees.map(e => e.id)
        }

        // Division filter for leads
        let divisionEmployeeIds: string[] | null = null
        if (isLead && userDivisionId) {
            const { data: divEmployees } = await supabase
                .from('employees')
                .select('id')
                .eq('division_id', userDivisionId)
                .neq('id', user.id)

            divisionEmployeeIds = (divEmployees || []).map(e => e.id)
        }

        // Collect all items
        const allItems: ApprovalItem[] = []

        // ====== FETCH REQUESTS (kind=all or requests) ======
        if (kindParam === 'all' || kindParam === 'requests') {
            const requests = await fetchRequests(supabase, {
                isHrOrOwner, isLead, isAM, userDivisionId,
                divisionEmployeeIds, amProjectIds, employeeIdFilter,
                typeParam, statusParam
            })
            allItems.push(...requests)
        }

        // ====== FETCH LATE PERMISSIONS (kind=all or late) ======
        if (kindParam === 'all' || kindParam === 'late') {
            const latePerms = await fetchLatePermissions(supabase, {
                isHrOrOwner, isLead, isCOO, userDivisionId,
                divisionEmployeeIds, employeeIdFilter, statusParam
            })
            allItems.push(...latePerms)
        }

        // Sort by created_at descending
        allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        // Apply date range filter
        let filteredItems = allItems
        if (startDate) {
            filteredItems = filteredItems.filter(item => item.created_at >= startDate)
        }
        if (endDate) {
            filteredItems = filteredItems.filter(item => item.created_at <= endDate + 'T23:59:59')
        }

        const total = filteredItems.length
        const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize)

        // 2-step mapping: employees
        const employeeIds = [...new Set(paginatedItems.map(r => r.employee_id))]
        let empMap = new Map<string, { full_name: string | null; division_id: string | null }>()

        if (employeeIds.length > 0) {
            const { data: employees } = await supabase
                .from('employees')
                .select('id, full_name, division_id')
                .in('id', employeeIds)

            if (employees) {
                empMap = new Map(employees.map(e => [e.id, { full_name: e.full_name, division_id: e.division_id }]))
            }
        }

        // Divisions
        const divisionIds = [...new Set([...empMap.values()].map(e => e.division_id).filter(Boolean))] as string[]
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

        // Projects (only for requests)
        const projectIds = [...new Set(paginatedItems.filter(r => r.project_id).map(r => r.project_id!))]
        let projMap = new Map<string, string>()
        if (projectIds.length > 0) {
            const { data: projects } = await supabase
                .from('projects')
                .select('id, name')
                .in('id', projectIds)
            if (projects) {
                projMap = new Map(projects.map(p => [p.id, p.name]))
            }
        }

        // Enrich items
        const items: ApprovalItem[] = paginatedItems.map(r => {
            const emp = empMap.get(r.employee_id)
            return {
                ...r,
                employee_name: emp?.full_name || 'Unknown',
                division_name: emp?.division_id ? divMap.get(emp.division_id) || 'No Division' : 'No Division',
                project_name: r.project_id ? projMap.get(r.project_id) || null : null,
            }
        })

        return NextResponse.json({ success: true, page, pageSize, total, items, userRole })

    } catch (error) {
        console.error('Approvals API error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

// ====== Helper: Fetch Requests ======
async function fetchRequests(
    supabase: Awaited<ReturnType<typeof createClient>>,
    ctx: {
        isHrOrOwner: boolean
        isLead: boolean
        isAM: boolean
        userDivisionId: string | null
        divisionEmployeeIds: string[] | null
        amProjectIds: string[]
        employeeIdFilter: string[] | null
        typeParam: string
        statusParam: string
    }
): Promise<ApprovalItem[]> {
    const results: ApprovalItem[] = []

    if (ctx.isHrOrOwner) {
        // HR/Owner sees: leave pending + overtime pending_hr (or all for history)
        let query = supabase
            .from('requests')
            .select('id, type, status, start_date, end_date, reason, employee_id, project_id, created_at')

        if (ctx.typeParam !== 'all') {
            query = query.eq('type', ctx.typeParam)
        }

        if (ctx.statusParam === 'pending') {
            query = query.or('and(type.eq.leave,status.eq.pending),and(type.eq.overtime,status.eq.pending_hr)')
        } else if (ctx.statusParam === 'processed') {
            query = query.in('status', ['approved', 'rejected'])
        }

        if (ctx.employeeIdFilter) {
            query = query.in('employee_id', ctx.employeeIdFilter)
        }

        const { data } = await query.order('created_at', { ascending: false }).limit(200)

        for (const r of data || []) {
            results.push({
                id: r.id,
                kind: 'request',
                type: r.type,
                status: r.status,
                start_date: r.start_date,
                end_date: r.end_date || '',
                reason: r.reason,
                employee_id: r.employee_id,
                employee_name: '',
                division_name: '',
                project_id: r.project_id,
                project_name: null,
                created_at: r.created_at,
            })
        }

    } else if (ctx.isLead && ctx.isAM) {
        // Lead + AM: combine leave (division) + overtime (projects)
        if ((ctx.typeParam === 'all' || ctx.typeParam === 'leave') && ctx.divisionEmployeeIds && ctx.divisionEmployeeIds.length > 0) {
            let empFilter = ctx.divisionEmployeeIds
            if (ctx.employeeIdFilter) {
                empFilter = ctx.divisionEmployeeIds.filter(id => ctx.employeeIdFilter!.includes(id))
            }
            if (empFilter.length > 0) {
                const { data } = await supabase
                    .from('requests')
                    .select('id, type, status, start_date, end_date, reason, employee_id, project_id, created_at')
                    .eq('type', 'leave')
                    .eq('status', 'pending')
                    .in('employee_id', empFilter)

                for (const r of data || []) {
                    results.push({
                        id: r.id, kind: 'request', type: r.type, status: r.status,
                        start_date: r.start_date, end_date: r.end_date || '', reason: r.reason,
                        employee_id: r.employee_id, employee_name: '', division_name: '',
                        project_id: r.project_id, project_name: null, created_at: r.created_at,
                    })
                }
            }
        }

        if (ctx.typeParam === 'all' || ctx.typeParam === 'overtime') {
            let query = supabase
                .from('requests')
                .select('id, type, status, start_date, end_date, reason, employee_id, project_id, created_at')
                .eq('type', 'overtime')
                .eq('status', 'pending_am')
                .in('project_id', ctx.amProjectIds)

            if (ctx.employeeIdFilter) {
                query = query.in('employee_id', ctx.employeeIdFilter)
            }

            const { data } = await query
            for (const r of data || []) {
                results.push({
                    id: r.id, kind: 'request', type: r.type, status: r.status,
                    start_date: r.start_date, end_date: r.end_date || '', reason: r.reason,
                    employee_id: r.employee_id, employee_name: '', division_name: '',
                    project_id: r.project_id, project_name: null, created_at: r.created_at,
                })
            }
        }

    } else if (ctx.isLead) {
        // Lead only: leave from division
        if (ctx.typeParam === 'overtime') return results

        if (!ctx.divisionEmployeeIds || ctx.divisionEmployeeIds.length === 0) return results

        let empFilter = ctx.divisionEmployeeIds
        if (ctx.employeeIdFilter) {
            empFilter = ctx.divisionEmployeeIds.filter(id => ctx.employeeIdFilter!.includes(id))
        }
        if (empFilter.length === 0) return results

        const { data } = await supabase
            .from('requests')
            .select('id, type, status, start_date, end_date, reason, employee_id, project_id, created_at')
            .eq('type', 'leave')
            .eq('status', 'pending')
            .in('employee_id', empFilter)
            .order('created_at', { ascending: false })

        for (const r of data || []) {
            results.push({
                id: r.id, kind: 'request', type: r.type, status: r.status,
                start_date: r.start_date, end_date: r.end_date || '', reason: r.reason,
                employee_id: r.employee_id, employee_name: '', division_name: '',
                project_id: r.project_id, project_name: null, created_at: r.created_at,
            })
        }

    } else if (ctx.isAM) {
        // AM only: overtime pending_am
        if (ctx.typeParam === 'leave') return results

        let query = supabase
            .from('requests')
            .select('id, type, status, start_date, end_date, reason, employee_id, project_id, created_at')
            .eq('type', 'overtime')
            .eq('status', 'pending_am')
            .in('project_id', ctx.amProjectIds)

        if (ctx.employeeIdFilter) {
            query = query.in('employee_id', ctx.employeeIdFilter)
        }

        const { data } = await query.order('created_at', { ascending: false })

        for (const r of data || []) {
            results.push({
                id: r.id, kind: 'request', type: r.type, status: r.status,
                start_date: r.start_date, end_date: r.end_date || '', reason: r.reason,
                employee_id: r.employee_id, employee_name: '', division_name: '',
                project_id: r.project_id, project_name: null, created_at: r.created_at,
            })
        }
    }

    return results
}

// ====== Helper: Fetch Late Permissions ======
async function fetchLatePermissions(
    supabase: Awaited<ReturnType<typeof createClient>>,
    ctx: {
        isHrOrOwner: boolean
        isLead: boolean
        isCOO: boolean
        userDivisionId: string | null
        divisionEmployeeIds: string[] | null
        employeeIdFilter: string[] | null
        statusParam: string
    }
): Promise<ApprovalItem[]> {
    const results: ApprovalItem[] = []

    if (ctx.isHrOrOwner) {
        // HR/Owner sees all pending or processed
        let query = supabase
            .from('late_permissions')
            .select('id, employee_id, date, category, max_check_in_time, reason, status, created_at')

        if (ctx.statusParam === 'pending') {
            query = query.in('status', ['pending_lead', 'pending_coo'])
        } else if (ctx.statusParam === 'processed') {
            query = query.in('status', ['approved', 'rejected'])
        }

        if (ctx.employeeIdFilter) {
            query = query.in('employee_id', ctx.employeeIdFilter)
        }

        const { data } = await query.order('created_at', { ascending: false }).limit(200)

        for (const lp of data || []) {
            results.push({
                id: lp.id,
                kind: 'late_permission',
                type: lp.category,
                category: lp.category,
                status: lp.status,
                start_date: lp.date,
                end_date: '',
                reason: lp.reason,
                employee_id: lp.employee_id,
                employee_name: '',
                division_name: '',
                project_id: null,
                project_name: null,
                max_check_in_time: lp.max_check_in_time,
                created_at: lp.created_at,
            })
        }

    } else if (ctx.isCOO) {
        // COO sees pending_coo
        let query = supabase
            .from('late_permissions')
            .select('id, employee_id, date, category, max_check_in_time, reason, status, created_at')
            .eq('status', 'pending_coo')

        if (ctx.employeeIdFilter) {
            query = query.in('employee_id', ctx.employeeIdFilter)
        }

        const { data } = await query.order('created_at', { ascending: false }).limit(100)

        for (const lp of data || []) {
            results.push({
                id: lp.id,
                kind: 'late_permission',
                type: lp.category,
                category: lp.category,
                status: lp.status,
                start_date: lp.date,
                end_date: '',
                reason: lp.reason,
                employee_id: lp.employee_id,
                employee_name: '',
                division_name: '',
                project_id: null,
                project_name: null,
                max_check_in_time: lp.max_check_in_time,
                created_at: lp.created_at,
            })
        }

    } else if (ctx.isLead && ctx.divisionEmployeeIds && ctx.divisionEmployeeIds.length > 0) {
        // Lead sees pending_lead for their division
        let empFilter = ctx.divisionEmployeeIds
        if (ctx.employeeIdFilter) {
            empFilter = ctx.divisionEmployeeIds.filter(id => ctx.employeeIdFilter!.includes(id))
        }
        if (empFilter.length === 0) return results

        const { data } = await supabase
            .from('late_permissions')
            .select('id, employee_id, date, category, max_check_in_time, reason, status, created_at')
            .eq('status', 'pending_lead')
            .in('employee_id', empFilter)
            .order('created_at', { ascending: false })

        for (const lp of data || []) {
            results.push({
                id: lp.id,
                kind: 'late_permission',
                type: lp.category,
                category: lp.category,
                status: lp.status,
                start_date: lp.date,
                end_date: '',
                reason: lp.reason,
                employee_id: lp.employee_id,
                employee_name: '',
                division_name: '',
                project_id: null,
                project_name: null,
                max_check_in_time: lp.max_check_in_time,
                created_at: lp.created_at,
            })
        }
    }

    return results
}
