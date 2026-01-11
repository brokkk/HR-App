import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMonthlyReport } from '@/lib/reports/monthly'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

/**
 * Escape a value for CSV
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double any quotes
 */
function escapeCsv(value: unknown): string {
    const str = String(value ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

/**
 * GET /api/reports/monthly.csv?year=YYYY&month=MM
 * Export monthly report as CSV (HR/Owner only)
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if HR/Owner
        const isHR = ADMIN_EMAILS.includes(user.email || '')
        if (!isHR) {
            // Double-check via database role
            const { data: employee } = await supabase
                .from('employees')
                .select('role')
                .eq('id', user.id)
                .single()

            const role = employee?.role || ''
            if (!['hr', 'owner'].includes(role)) {
                return NextResponse.json({ error: 'Access denied: HR/Owner only' }, { status: 403 })
            }
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const yearStr = searchParams.get('year')
        const monthStr = searchParams.get('month')

        if (!yearStr || !monthStr) {
            return NextResponse.json({ error: 'year and month required' }, { status: 400 })
        }

        const year = parseInt(yearStr)
        const month = parseInt(monthStr)

        if (isNaN(year) || year < 2000 || year > 2100) {
            return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
        }
        if (isNaN(month) || month < 1 || month > 12) {
            return NextResponse.json({ error: 'Invalid month (1-12)' }, { status: 400 })
        }

        // Get report data
        const report = await getMonthlyReport({ year, month, supabase })

        // Build CSV
        const headers = [
            'employee_id',
            'full_name',
            'division_name',
            'days_present',
            'total_late_minutes',
            'total_penalty',
            'late_permissions_approved',
            'approved_leave_days',
            'annual_leave_quota',
            'leave_taken_ytd',
            'leave_balance',
            'overtime_approved_count',
            'meal_claims_paid_count',
            'meal_claims_paid_total',
        ]

        const rows: string[] = []

        // Header row
        rows.push(headers.join(','))

        // Data rows
        for (const row of report.rows) {
            rows.push([
                escapeCsv(row.employee_id),
                escapeCsv(row.full_name),
                escapeCsv(row.division_name),
                escapeCsv(row.days_present),
                escapeCsv(row.total_late_minutes),
                escapeCsv(row.total_penalty),
                escapeCsv(row.late_permissions_approved),
                escapeCsv(row.approved_leave_days),
                escapeCsv(row.annual_leave_quota),
                escapeCsv(row.leave_taken_ytd),
                escapeCsv(row.leave_balance),
                escapeCsv(row.overtime_approved_count),
                escapeCsv(row.meal_claims_paid_count),
                escapeCsv(row.meal_claims_paid_total),
            ].join(','))
        }

        // Totals row
        rows.push([
            escapeCsv(''),
            escapeCsv('TOTAL'),
            escapeCsv(''),
            escapeCsv(report.totals.days_present),
            escapeCsv(report.totals.total_late_minutes),
            escapeCsv(report.totals.total_penalty),
            escapeCsv(report.totals.late_permissions_approved),
            escapeCsv(report.totals.approved_leave_days),
            escapeCsv(''),
            escapeCsv(''),
            escapeCsv(''),
            escapeCsv(report.totals.overtime_approved_count),
            escapeCsv(report.totals.meal_claims_paid_count),
            escapeCsv(report.totals.meal_claims_paid_total),
        ].join(','))

        const csvContent = rows.join('\r\n')
        const filename = `attendance_report_${year}_${month.toString().padStart(2, '0')}.csv`

        return new Response(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        })

    } catch (error) {
        console.error('CSV export error:', error)
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Export failed'
        }, { status: 500 })
    }
}
