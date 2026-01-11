import { SupabaseClient } from '@supabase/supabase-js'

export interface MonthlyReportRow {
    employee_id: string
    full_name: string
    division_name: string
    days_present: number
    total_late_minutes: number
    total_penalty: number
    overtime_approved_count: number
    meal_claims_paid_count: number
    meal_claims_paid_total: number
    // New fields
    approved_leave_days: number
    late_permissions_approved: number
    annual_leave_quota: number
    leave_taken_ytd: number
    leave_balance: number
}

export interface MonthlyReportTotals {
    days_present: number
    total_late_minutes: number
    total_penalty: number
    overtime_approved_count: number
    meal_claims_paid_count: number
    meal_claims_paid_total: number
    // New fields
    approved_leave_days: number
    late_permissions_approved: number
}

export interface MonthlyReportResult {
    rows: MonthlyReportRow[]
    totals: MonthlyReportTotals
    month: number
    year: number
}

interface GetMonthlyReportParams {
    year: number
    month: number
    supabase: SupabaseClient
}

/**
 * Compute WIB month boundaries
 * Returns date strings for date columns and ISO strings for timestamptz columns
 */
function getMonthBoundaries(year: number, month: number) {
    // Month start: YYYY-MM-01 (for date columns)
    const monthStartDate = `${year}-${month.toString().padStart(2, '0')}-01`

    // Next month start
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const nextMonthStartDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`

    // For timestamptz columns, we need ISO strings with +07:00 offset
    // Month start at 00:00:00 WIB
    const monthStartTS = `${monthStartDate}T00:00:00+07:00`
    // Next month start at 00:00:00 WIB (exclusive)
    const nextMonthStartTS = `${nextMonthStartDate}T00:00:00+07:00`

    // Year start for YTD calculations
    const yearStartDate = `${year}-01-01`

    return {
        monthStartDate,
        nextMonthStartDate,
        monthStartTS,
        nextMonthStartTS,
        yearStartDate,
    }
}

/**
 * Calculate leave days from a request (end_date - start_date + 1)
 */
function calculateLeaveDays(startDate: string, endDate: string | null): number {
    if (!endDate) return 1
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = end.getTime() - start.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return Math.max(1, diffDays)
}

/**
 * Get monthly attendance report with aggregations
 */
export async function getMonthlyReport({
    year,
    month,
    supabase,
}: GetMonthlyReportParams): Promise<MonthlyReportResult> {
    const boundaries = getMonthBoundaries(year, month)

    // 1. Fetch active employees with annual_leave_quota
    const { data: employees } = await supabase
        .from('employees')
        .select('id, full_name, division_id, role, is_active, annual_leave_quota')
        .eq('is_active', true)
        .order('full_name')

    if (!employees || employees.length === 0) {
        return {
            rows: [],
            totals: {
                days_present: 0,
                total_late_minutes: 0,
                total_penalty: 0,
                overtime_approved_count: 0,
                meal_claims_paid_count: 0,
                meal_claims_paid_total: 0,
                approved_leave_days: 0,
                late_permissions_approved: 0,
            },
            month,
            year,
        }
    }

    // 2. Fetch divisions
    const divisionIds = [...new Set(employees.map(e => e.division_id).filter(Boolean))]
    const { data: divisions } = await supabase
        .from('divisions')
        .select('id, name')
        .in('id', divisionIds.length > 0 ? divisionIds : ['00000000-0000-0000-0000-000000000000'])

    const divisionMap = new Map(divisions?.map(d => [d.id, d.name]) || [])

    // 3. Fetch attendance_daily for the month
    const { data: dailyRecords } = await supabase
        .from('attendance_daily')
        .select('employee_id, check_in, late_minutes, penalty_amount')
        .gte('date', boundaries.monthStartDate)
        .lt('date', boundaries.nextMonthStartDate)

    // Aggregate by employee
    const attendanceMap = new Map<string, { days: number; late: number; penalty: number }>()
    for (const rec of dailyRecords || []) {
        const existing = attendanceMap.get(rec.employee_id) || { days: 0, late: 0, penalty: 0 }
        if (rec.check_in) {
            existing.days += 1
        }
        existing.late += rec.late_minutes || 0
        existing.penalty += rec.penalty_amount || 0
        attendanceMap.set(rec.employee_id, existing)
    }

    // 4. Fetch approved overtime requests for the month
    const { data: overtimeRequests } = await supabase
        .from('requests')
        .select('employee_id')
        .eq('type', 'overtime')
        .eq('status', 'approved')
        .gte('start_date', boundaries.monthStartDate)
        .lt('start_date', boundaries.nextMonthStartDate)

    // Aggregate by employee
    const overtimeMap = new Map<string, number>()
    for (const req of overtimeRequests || []) {
        overtimeMap.set(req.employee_id, (overtimeMap.get(req.employee_id) || 0) + 1)
    }

    // 5. Fetch meal claims for the month (approved or paid)
    const { data: mealClaims } = await supabase
        .from('overtime_meal_claims')
        .select('employee_id, amount')
        .in('status', ['approved', 'paid'])
        .gte('created_at', boundaries.monthStartTS)
        .lt('created_at', boundaries.nextMonthStartTS)

    // Aggregate by employee
    const claimsMap = new Map<string, { count: number; total: number }>()
    for (const claim of mealClaims || []) {
        const existing = claimsMap.get(claim.employee_id) || { count: 0, total: 0 }
        existing.count += 1
        existing.total += claim.amount || 0
        claimsMap.set(claim.employee_id, existing)
    }

    // 6. Fetch approved leave requests for the month
    const { data: leaveRequestsMonth } = await supabase
        .from('requests')
        .select('employee_id, start_date, end_date')
        .eq('type', 'leave')
        .eq('status', 'approved')
        .gte('start_date', boundaries.monthStartDate)
        .lt('start_date', boundaries.nextMonthStartDate)

    // Aggregate leave days by employee (this month)
    const leaveMonthMap = new Map<string, number>()
    for (const req of leaveRequestsMonth || []) {
        const days = calculateLeaveDays(req.start_date, req.end_date)
        leaveMonthMap.set(req.employee_id, (leaveMonthMap.get(req.employee_id) || 0) + days)
    }

    // 7. Fetch approved leave requests YTD (for leave balance calculation)
    const { data: leaveRequestsYTD } = await supabase
        .from('requests')
        .select('employee_id, start_date, end_date')
        .eq('type', 'leave')
        .eq('status', 'approved')
        .gte('start_date', boundaries.yearStartDate)
        .lt('start_date', boundaries.nextMonthStartDate)

    // Aggregate leave days YTD by employee
    const leaveYTDMap = new Map<string, number>()
    for (const req of leaveRequestsYTD || []) {
        const days = calculateLeaveDays(req.start_date, req.end_date)
        leaveYTDMap.set(req.employee_id, (leaveYTDMap.get(req.employee_id) || 0) + days)
    }

    // 8. Fetch approved late permissions for the month
    const { data: latePermissions } = await supabase
        .from('late_permissions')
        .select('employee_id')
        .eq('status', 'approved')
        .gte('date', boundaries.monthStartDate)
        .lt('date', boundaries.nextMonthStartDate)

    // Aggregate by employee
    const latePermMap = new Map<string, number>()
    for (const lp of latePermissions || []) {
        latePermMap.set(lp.employee_id, (latePermMap.get(lp.employee_id) || 0) + 1)
    }

    // 9. Build rows
    const rows: MonthlyReportRow[] = employees.map(emp => {
        const attendance = attendanceMap.get(emp.id) || { days: 0, late: 0, penalty: 0 }
        const overtime = overtimeMap.get(emp.id) || 0
        const claims = claimsMap.get(emp.id) || { count: 0, total: 0 }
        const leaveMonth = leaveMonthMap.get(emp.id) || 0
        const leaveYTD = leaveYTDMap.get(emp.id) || 0
        const latePerm = latePermMap.get(emp.id) || 0
        const quota = emp.annual_leave_quota ?? 12

        return {
            employee_id: emp.id,
            full_name: emp.full_name || emp.id.slice(0, 8),
            division_name: emp.division_id ? (divisionMap.get(emp.division_id) || 'Unknown') : 'No Division',
            days_present: attendance.days,
            total_late_minutes: attendance.late,
            total_penalty: attendance.penalty,
            overtime_approved_count: overtime,
            meal_claims_paid_count: claims.count,
            meal_claims_paid_total: claims.total,
            // New fields
            approved_leave_days: leaveMonth,
            late_permissions_approved: latePerm,
            annual_leave_quota: quota,
            leave_taken_ytd: leaveYTD,
            leave_balance: quota - leaveYTD,
        }
    })

    // 10. Compute totals
    const totals: MonthlyReportTotals = {
        days_present: rows.reduce((sum, r) => sum + r.days_present, 0),
        total_late_minutes: rows.reduce((sum, r) => sum + r.total_late_minutes, 0),
        total_penalty: rows.reduce((sum, r) => sum + r.total_penalty, 0),
        overtime_approved_count: rows.reduce((sum, r) => sum + r.overtime_approved_count, 0),
        meal_claims_paid_count: rows.reduce((sum, r) => sum + r.meal_claims_paid_count, 0),
        meal_claims_paid_total: rows.reduce((sum, r) => sum + r.meal_claims_paid_total, 0),
        approved_leave_days: rows.reduce((sum, r) => sum + r.approved_leave_days, 0),
        late_permissions_approved: rows.reduce((sum, r) => sum + r.late_permissions_approved, 0),
    }

    return { rows, totals, month, year }
}

/**
 * Format currency in IDR
 */
export function formatIDR(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`
}

/**
 * Get current WIB date info
 */
export function getCurrentWIBDate(): { year: number; month: number } {
    // Create date in WIB (UTC+7)
    const now = new Date()
    const wibOffset = 7 * 60 // WIB is UTC+7
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)

    return {
        year: wibTime.getFullYear(),
        month: wibTime.getMonth() + 1, // 1-indexed
    }
}
