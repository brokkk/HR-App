import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMonthlyReport, getCurrentWIBDate } from '@/lib/reports/monthly'
import { MonthlyReportClient } from './MonthlyReportClient'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

interface Props {
    searchParams: Promise<{ year?: string; month?: string }>
}

export default async function MonthlyReportPage({ searchParams }: Props) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        redirect('/home')
    }

    const params = await searchParams
    const currentDate = getCurrentWIBDate()

    const year = params.year ? parseInt(params.year) : currentDate.year
    const month = params.month ? parseInt(params.month) : currentDate.month

    const report = await getMonthlyReport({ year, month, supabase })

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-text-main tracking-tight">Monthly Report</h1>
                    <p className="text-text-sub mt-1">Attendance summary for {getMonthName(month)} {year}</p>
                </div>
                <a
                    href={`/api/reports/monthly.csv?year=${year}&month=${month}`}
                    className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark transition-colors"
                >
                    Export CSV
                </a>
            </div>

            <MonthlyReportClient
                initialYear={year}
                initialMonth={month}
                rows={report.rows}
                totals={report.totals}
            />
        </div>
    )
}

function getMonthName(month: number): string {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ]
    return months[month - 1] || 'Unknown'
}
