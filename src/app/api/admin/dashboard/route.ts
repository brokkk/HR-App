import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

/**
 * Get today's date in WIB (Asia/Jakarta)
 */
function getTodayWIB(): string {
    const now = new Date()
    const wibOffset = 7 * 60 // UTC+7
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    return wibTime.toISOString().split('T')[0]
}

/**
 * Get month boundaries for a date
 */
function getMonthBoundaries(dateStr: string) {
    const [year, month] = dateStr.split('-').map(Number)
    const monthStart = `${year}-${month.toString().padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const nextMonthStart = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`
    return { monthStart, nextMonthStart }
}

/**
 * Get last 7 days as date strings
 */
function getLast7Days(baseDate: string): string[] {
    const dates: string[] = []
    const base = new Date(baseDate)
    for (let i = 6; i >= 0; i--) {
        const d = new Date(base)
        d.setDate(d.getDate() - i)
        dates.push(d.toISOString().split('T')[0])
    }
    return dates
}

export interface DashboardResponse {
    success: boolean
    date?: string
    kpis?: {
        on_time_count: number
        penalized_count: number
        total_penalties_month: number
        overtime_pending_count: number
        checked_in_count: number
        active_employee_count: number
    }
    summary?: {
        attendance_rate_today: number
        last7_rates: number[]
    }
    exceptions?: Array<{
        employee_id: string
        employee_name: string
        division_name: string
        issue: 'Late >30m' | 'Missing Checkout'
        check_in: string | null
        check_out: string | null
        late_minutes: number
        penalty_amount: number
    }>
    approvalsPreview?: Array<{
        id: string
        employee_id: string
        employee_name: string
        type: string
        status: string
        start_date: string
        end_date: string | null
        reason: string
        created_at: string
    }>
    error?: string
}

/**
 * GET /api/admin/dashboard
 * Dashboard data for admin panel
 */
export async function GET(request: NextRequest): Promise<NextResponse<DashboardResponse>> {
    try {
        const supabase = await createClient()

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse date param
        const { searchParams } = new URL(request.url)
        const dateParam = searchParams.get('date')
        const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getTodayWIB()

        const { monthStart, nextMonthStart } = getMonthBoundaries(selectedDate)

        // 1. Fetch active employees count
        const { count: activeCount } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)

        const active_employee_count = activeCount || 0

        // 2. Fetch attendance_daily for selected date
        const { data: dailyRecords } = await supabase
            .from('attendance_daily')
            .select('employee_id, check_in, check_out, late_minutes, is_late, is_penalized, penalty_amount')
            .eq('date', selectedDate)

        const records = dailyRecords || []
        const checked_in_count = records.filter(r => r.check_in).length
        const on_time_count = records.filter(r => r.check_in && r.late_minutes === 0).length
        const penalized_count = records.filter(r => r.is_penalized).length

        // 3. Calculate total penalties for the month
        const { data: monthRecords } = await supabase
            .from('attendance_daily')
            .select('penalty_amount')
            .gte('date', monthStart)
            .lt('date', nextMonthStart)

        const total_penalties_month = (monthRecords || []).reduce((sum, r) => sum + (r.penalty_amount || 0), 0)

        // 4. Overtime pending count
        const { count: overtimePending } = await supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'overtime')
            .eq('status', 'pending')

        const overtime_pending_count = overtimePending || 0

        // 5. Attendance rate today
        const attendance_rate_today = active_employee_count > 0 ? checked_in_count / active_employee_count : 0

        // 6. Last 7 days rates
        const last7Dates = getLast7Days(selectedDate)
        const { data: last7Records } = await supabase
            .from('attendance_daily')
            .select('date, check_in')
            .in('date', last7Dates)

        const last7_rates = last7Dates.map(d => {
            const dayRecords = (last7Records || []).filter(r => r.date === d)
            const checkedIn = dayRecords.filter(r => r.check_in).length
            return active_employee_count > 0 ? checkedIn / active_employee_count : 0
        })

        // 7. Exceptions for selected date (is_penalized OR missing checkout)
        const { data: exceptionRecords } = await supabase
            .from('attendance_daily')
            .select('employee_id, check_in, check_out, late_minutes, penalty_amount, is_penalized')
            .eq('date', selectedDate)
            .or('is_penalized.eq.true,and(check_in.not.is.null,check_out.is.null)')
            .limit(10)

        // 8. Approvals preview (pending requests)
        const { data: pendingRequests } = await supabase
            .from('requests')
            .select('id, employee_id, type, status, start_date, end_date, reason, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5)

        // 9. Collect employee IDs for mapping
        const exceptionEmpIds = (exceptionRecords || []).map(r => r.employee_id)
        const requestEmpIds = (pendingRequests || []).map(r => r.employee_id)
        const allEmpIds = [...new Set([...exceptionEmpIds, ...requestEmpIds])]

        // 10. Fetch employees
        const { data: employees } = await supabase
            .from('employees')
            .select('id, full_name, division_id')
            .in('id', allEmpIds.length > 0 ? allEmpIds : ['00000000-0000-0000-0000-000000000000'])

        const empMap = new Map((employees || []).map(e => [e.id, e]))

        // 11. Fetch divisions
        const divisionIds = [...new Set((employees || []).map(e => e.division_id).filter(Boolean))]
        const { data: divisions } = await supabase
            .from('divisions')
            .select('id, name')
            .in('id', divisionIds.length > 0 ? divisionIds : ['00000000-0000-0000-0000-000000000000'])

        const divMap = new Map((divisions || []).map(d => [d.id, d.name]))

        // 12. Build exceptions array
        const exceptions = (exceptionRecords || []).map(r => {
            const emp = empMap.get(r.employee_id)
            return {
                employee_id: r.employee_id,
                employee_name: emp?.full_name || 'Unknown',
                division_name: emp?.division_id ? divMap.get(emp.division_id) || 'Unknown' : 'No Division',
                issue: (r.is_penalized ? 'Late >30m' : 'Missing Checkout') as 'Late >30m' | 'Missing Checkout',
                check_in: r.check_in,
                check_out: r.check_out,
                late_minutes: r.late_minutes || 0,
                penalty_amount: r.penalty_amount || 0,
            }
        })

        // 13. Build approvals preview
        const approvalsPreview = (pendingRequests || []).map(r => {
            const emp = empMap.get(r.employee_id)
            return {
                id: r.id,
                employee_id: r.employee_id,
                employee_name: emp?.full_name || 'Unknown',
                type: r.type,
                status: r.status,
                start_date: r.start_date,
                end_date: r.end_date,
                reason: r.reason || '',
                created_at: r.created_at,
            }
        })

        return NextResponse.json({
            success: true,
            date: selectedDate,
            kpis: {
                on_time_count,
                penalized_count,
                total_penalties_month,
                overtime_pending_count,
                checked_in_count,
                active_employee_count,
            },
            summary: {
                attendance_rate_today,
                last7_rates,
            },
            exceptions,
            approvalsPreview,
        })

    } catch (error) {
        console.error('Dashboard API error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
