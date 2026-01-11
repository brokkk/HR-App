import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

/**
 * Get today's date in WIB
 */
function getTodayWIB(): string {
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    return wibTime.toISOString().split('T')[0]
}

/**
 * Validate date format YYYY-MM-DD
 */
function isValidDate(dateStr: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr))
}

/**
 * Generate array of dates between start and end (inclusive)
 */
function generateDateRange(start: string, end: string): string[] {
    const dates: string[] = []
    const startDate = new Date(start)
    const endDate = new Date(end)
    const current = new Date(startDate)

    while (current <= endDate) {
        dates.push(current.toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
    }
    return dates
}

export interface ExceptionItem {
    employee_id: string
    employee_name: string
    division_name: string
    date: string
    issue: 'Late >30m' | 'Missing Checkout' | 'No Check-in'
    check_in: string | null
    check_out: string | null
    check_in_source: 'fingerprint' | 'outside' | 'manual' | 'import' | null
    late_minutes: number
    penalty_amount: number
}

export interface ExceptionsResponse {
    success: boolean
    range?: { start: string; end: string }
    page?: number
    pageSize?: number
    total?: number
    items?: ExceptionItem[]
    error?: string
}

const VALID_TYPES = ['all', 'late', 'missing', 'no_checkin']

/**
 * GET /api/admin/exceptions
 * List attendance exceptions with filters and pagination
 */
export async function GET(request: NextRequest): Promise<NextResponse<ExceptionsResponse>> {
    try {
        const supabase = await createClient()

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const startParam = searchParams.get('start')
        const endParam = searchParams.get('end')
        const typeParam = searchParams.get('type') || 'all'
        const searchQuery = searchParams.get('q')?.trim().toLowerCase() || ''
        const pageParam = parseInt(searchParams.get('page') || '1', 10)
        const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10)

        // Default dates
        const today = getTodayWIB()
        const start = startParam || today
        const end = endParam || start

        // Validate dates
        if (!isValidDate(start)) {
            return NextResponse.json({ success: false, error: 'Invalid start date format' }, { status: 400 })
        }
        if (!isValidDate(end)) {
            return NextResponse.json({ success: false, error: 'Invalid end date format' }, { status: 400 })
        }
        if (end < start) {
            return NextResponse.json({ success: false, error: 'End date must be >= start date' }, { status: 400 })
        }

        // Validate type
        if (!VALID_TYPES.includes(typeParam)) {
            return NextResponse.json({ success: false, error: 'Invalid type (all|late|missing|no_checkin)' }, { status: 400 })
        }

        // Validate pagination
        const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam)
        const pageSize = Math.min(100, Math.max(1, isNaN(pageSizeParam) ? 20 : pageSizeParam))

        // Handle search: get matching employee IDs first
        let employeeIdFilter: string[] | null = null
        if (searchQuery) {
            const { data: matchingEmployees } = await supabase
                .from('employees')
                .select('id')
                .eq('is_active', true)
                .ilike('full_name', `%${searchQuery}%`)

            if (!matchingEmployees || matchingEmployees.length === 0) {
                return NextResponse.json({
                    success: true,
                    range: { start, end },
                    page,
                    pageSize,
                    total: 0,
                    items: [],
                })
            }
            employeeIdFilter = matchingEmployees.map(e => e.id)
        }

        // Handle no_checkin type separately
        if (typeParam === 'no_checkin') {
            return handleNoCheckinExceptions(supabase, start, end, page, pageSize, employeeIdFilter)
        }

        // Standard exceptions (late, missing checkout)
        return handleStandardExceptions(supabase, start, end, typeParam, page, pageSize, employeeIdFilter)

    } catch (error) {
        console.error('Exceptions API error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * Handle no_checkin exceptions - employees without attendance for each date
 */
async function handleNoCheckinExceptions(
    supabase: Awaited<ReturnType<typeof createClient>>,
    start: string,
    end: string,
    page: number,
    pageSize: number,
    employeeIdFilter: string[] | null
): Promise<NextResponse<ExceptionsResponse>> {
    // Get all active employees
    let empQuery = supabase
        .from('employees')
        .select('id, full_name, division_id')
        .eq('is_active', true)

    if (employeeIdFilter) {
        empQuery = empQuery.in('id', employeeIdFilter)
    }

    const { data: employees } = await empQuery
    if (!employees || employees.length === 0) {
        return NextResponse.json({
            success: true,
            range: { start, end },
            page,
            pageSize,
            total: 0,
            items: [],
        })
    }

    const empMap = new Map(employees.map(e => [e.id, e]))
    const employeeIds = employees.map(e => e.id)

    // Generate date range
    const dates = generateDateRange(start, end)

    // Get all attendance_daily records for these employees in date range
    const { data: dailyRecords } = await supabase
        .from('attendance_daily')
        .select('employee_id, date')
        .in('employee_id', employeeIds)
        .gte('date', start)
        .lte('date', end)

    // Build set of (employee_id:date) that have attendance
    const hasAttendance = new Set(
        (dailyRecords || []).map(r => `${r.employee_id}:${r.date}`)
    )

    // Find missing combinations
    const missingItems: { employee_id: string; date: string }[] = []
    for (const date of dates) {
        for (const empId of employeeIds) {
            if (!hasAttendance.has(`${empId}:${date}`)) {
                missingItems.push({ employee_id: empId, date })
            }
        }
    }

    const total = missingItems.length

    if (total === 0) {
        return NextResponse.json({
            success: true,
            range: { start, end },
            page,
            pageSize,
            total: 0,
            items: [],
        })
    }

    // Sort by date desc, then employee name
    missingItems.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        const nameA = empMap.get(a.employee_id)?.full_name || ''
        const nameB = empMap.get(b.employee_id)?.full_name || ''
        return nameA.localeCompare(nameB)
    })

    // Paginate
    const from = (page - 1) * pageSize
    const paged = missingItems.slice(from, from + pageSize)

    // Fetch divisions
    const divisionIds = [...new Set(employees.map(e => e.division_id).filter(Boolean))] as string[]
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

    // Build items
    const items: ExceptionItem[] = paged.map(m => {
        const emp = empMap.get(m.employee_id)
        return {
            employee_id: m.employee_id,
            employee_name: emp?.full_name || 'Unknown',
            division_name: emp?.division_id ? divMap.get(emp.division_id) || 'No Division' : 'No Division',
            date: m.date,
            issue: 'No Check-in' as const,
            check_in: null,
            check_out: null,
            check_in_source: null,
            late_minutes: 0,
            penalty_amount: 0,
        }
    })

    return NextResponse.json({
        success: true,
        range: { start, end },
        page,
        pageSize,
        total,
        items,
    })
}

/**
 * Handle standard exceptions (late, missing checkout)
 */
async function handleStandardExceptions(
    supabase: Awaited<ReturnType<typeof createClient>>,
    start: string,
    end: string,
    typeParam: string,
    page: number,
    pageSize: number,
    employeeIdFilter: string[] | null
): Promise<NextResponse<ExceptionsResponse>> {
    // Build base query for counting
    let countQuery = supabase
        .from('attendance_daily')
        .select('id', { count: 'exact', head: true })
        .gte('date', start)
        .lte('date', end)

    if (employeeIdFilter) {
        countQuery = countQuery.in('employee_id', employeeIdFilter)
    }

    // Apply type filter
    if (typeParam === 'late') {
        countQuery = countQuery.eq('is_penalized', true)
    } else if (typeParam === 'missing') {
        countQuery = countQuery.not('check_in', 'is', null).is('check_out', null)
    } else {
        // all: is_penalized OR missing checkout
        countQuery = countQuery.or('is_penalized.eq.true,and(check_in.not.is.null,check_out.is.null)')
    }

    const { count, error: countError } = await countQuery

    if (countError) {
        return NextResponse.json({ success: false, error: countError.message }, { status: 500 })
    }

    const total = count ?? 0

    if (total === 0) {
        return NextResponse.json({
            success: true,
            range: { start, end },
            page,
            pageSize,
            total: 0,
            items: [],
        })
    }

    // Build data query
    let dataQuery = supabase
        .from('attendance_daily')
        .select('employee_id, date, check_in, check_out, check_in_source, late_minutes, penalty_amount, is_penalized')
        .gte('date', start)
        .lte('date', end)

    if (employeeIdFilter) {
        dataQuery = dataQuery.in('employee_id', employeeIdFilter)
    }

    if (typeParam === 'late') {
        dataQuery = dataQuery.eq('is_penalized', true)
    } else if (typeParam === 'missing') {
        dataQuery = dataQuery.not('check_in', 'is', null).is('check_out', null)
    } else {
        dataQuery = dataQuery.or('is_penalized.eq.true,and(check_in.not.is.null,check_out.is.null)')
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: dailyRecords, error: dailyError } = await dataQuery
        .order('date', { ascending: false })
        .order('late_minutes', { ascending: false })
        .range(from, to)

    if (dailyError) {
        return NextResponse.json({ success: false, error: dailyError.message }, { status: 500 })
    }

    const records = dailyRecords || []
    const employeeIds = [...new Set(records.map(r => r.employee_id))]

    // Fetch employees
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

    // Fetch divisions
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

    // Build items
    const items: ExceptionItem[] = records.map(r => {
        const emp = empMap.get(r.employee_id)
        return {
            employee_id: r.employee_id,
            employee_name: emp?.full_name || 'Unknown',
            division_name: emp?.division_id ? divMap.get(emp.division_id) || 'Unknown' : 'No Division',
            date: r.date,
            issue: r.is_penalized ? 'Late >30m' : 'Missing Checkout' as const,
            check_in: r.check_in,
            check_out: r.check_out,
            check_in_source: r.check_in_source,
            late_minutes: r.late_minutes || 0,
            penalty_amount: r.penalty_amount || 0,
        }
    })

    return NextResponse.json({
        success: true,
        range: { start, end },
        page,
        pageSize,
        total,
        items,
    })
}
