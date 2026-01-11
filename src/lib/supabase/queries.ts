import { createClient } from '@/lib/supabase/server'

// =============================================================================
// Types
// =============================================================================

export interface AttendanceDaily {
    id: string
    employee_id: string
    date: string
    check_in: string | null
    check_out: string | null
    check_in_source: 'fingerprint' | 'outside' | 'manual' | 'import' | null
    check_out_source: 'fingerprint' | 'outside' | 'manual' | 'import' | null
    late_minutes: number
    is_late: boolean
    is_penalized: boolean
    penalty_amount: number
    computed_at: string | null
}

export interface Division {
    id: string
    name: string
}

export interface Employee {
    id: string
    full_name: string | null
    role: string
    is_active: boolean
    division_id: string | null
    created_at: string
    division_name: string | null  // Merged from divisions table
}

export interface MyRequest {
    id: string
    type: 'leave' | 'overtime'
    status: string
    start_date: string
    end_date: string | null
    reason: string
    created_at: string
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get today's date in WIB (Asia/Jakarta)
 */
function getTodayWIB(): string {
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    return wibTime.toISOString().split('T')[0]
}

/**
 * Fetch current user's profile from employees table
 */
export async function getMyProfile(): Promise<{
    data: { id: string; full_name: string | null; role: string; division_name: string | null } | null
    error: string | null
}> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { data: null, error: 'Not authenticated' }
    }

    const { data: employee, error } = await supabase
        .from('employees')
        .select('id, full_name, role, division_id')
        .eq('id', user.id)
        .single()

    if (error) {
        return { data: null, error: error.message }
    }

    // Get division name if assigned
    let division_name: string | null = null
    if (employee?.division_id) {
        const { data: division } = await supabase
            .from('divisions')
            .select('name')
            .eq('id', employee.division_id)
            .single()
        division_name = division?.name || null
    }

    return {
        data: {
            id: employee.id,
            full_name: employee.full_name,
            role: employee.role,
            division_name,
        },
        error: null
    }
}

/**
 * Fetch current user's attendance for today (WIB)
 */
export async function getMyTodayAttendance(): Promise<{
    data: AttendanceDaily | null
    error: string | null
}> {
    const supabase = await createClient()
    const today = getTodayWIB()

    const { data, error } = await supabase
        .from('attendance_daily')
        .select('*')
        .eq('date', today)
        .maybeSingle()

    if (error) {
        return { data: null, error: error.message }
    }

    return { data: data as AttendanceDaily | null, error: null }
}

/**
 * Fetch current user's recent requests
 */
export async function getMyRecentRequests(limit: number = 3): Promise<{
    data: MyRequest[]
    error: string | null
}> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('requests')
        .select('id, type, status, start_date, end_date, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        return { data: [], error: error.message }
    }

    return { data: (data as MyRequest[]) || [], error: null }
}

/**
 * Fetch current user's attendance records for the last N days
 * RLS ensures only own records are returned
 */
export async function getMyAttendance(limit: number = 30): Promise<{
    data: AttendanceDaily[]
    error: string | null
}> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('attendance_daily')
        .select('*')
        .order('date', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('getMyAttendance error:', error.message)
        return { data: [], error: error.message }
    }

    return { data: (data as AttendanceDaily[]) || [], error: null }
}

/**
 * Fetch all employees with division info (HR/Owner only)
 * Uses 2-query approach to avoid ambiguous FK embedding error
 * RLS restricts to authorized roles
 */
export async function getEmployeesWithDivisions(): Promise<{
    data: Employee[]
    error: string | null
}> {
    const supabase = await createClient()

    // Query 1: Get employees
    const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, full_name, role, is_active, division_id, created_at')
        .order('created_at', { ascending: false })

    if (empError) {
        console.error('getEmployeesWithDivisions error:', empError.message)
        // Distinguish RLS errors from other errors
        const isRlsError = empError.message.includes('permission') ||
            empError.code === '42501' ||
            empError.message.includes('policy')
        return {
            data: [],
            error: isRlsError ? 'ACCESS_DENIED' : empError.message
        }
    }

    if (!employees || employees.length === 0) {
        return { data: [], error: null }
    }

    // Query 2: Get all divisions (all authenticated users can read)
    const { data: divisions } = await supabase
        .from('divisions')
        .select('id, name')

    // Create division lookup map
    const divisionMap = new Map<string, string>()
    if (divisions) {
        for (const div of divisions) {
            divisionMap.set(div.id, div.name)
        }
    }

    // Merge division names into employees
    const result: Employee[] = employees.map((emp) => ({
        id: emp.id,
        full_name: emp.full_name,
        role: emp.role,
        is_active: emp.is_active,
        division_id: emp.division_id,
        created_at: emp.created_at,
        division_name: emp.division_id ? divisionMap.get(emp.division_id) || null : null,
    }))

    return { data: result, error: null }
}
