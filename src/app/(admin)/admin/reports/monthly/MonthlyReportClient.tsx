'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Filter, FileText } from 'lucide-react'
import type { MonthlyReportRow, MonthlyReportTotals } from '@/lib/reports/monthly'

interface Props {
    initialYear: number
    initialMonth: number
    rows: MonthlyReportRow[]
    totals: MonthlyReportTotals
}

const MONTHS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
]

// Format currency in IDR
function formatIDR(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`
}

export function MonthlyReportClient({ initialYear, initialMonth, rows, totals }: Props) {
    const router = useRouter()
    const [year, setYear] = useState(initialYear)
    const [month, setMonth] = useState(initialMonth)

    const handleApply = () => {
        router.push(`/admin/reports/monthly?year=${year}&month=${month}`)
    }

    const formatNumber = (n: number) => n.toLocaleString('id-ID')

    return (
        <div className="flex flex-col gap-6">
            {/* Filters */}
            <Card variant="bordered">
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-text-main">Month:</label>
                            <select
                                value={month}
                                onChange={(e) => setMonth(parseInt(e.target.value))}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {MONTHS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-text-main">Year:</label>
                            <input
                                type="number"
                                value={year}
                                onChange={(e) => setYear(parseInt(e.target.value) || initialYear)}
                                min={2020}
                                max={2030}
                                className="w-24 px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>

                        <Button onClick={handleApply} icon={Filter} size="sm">
                            Apply
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Empty State */}
            {rows.length === 0 && (
                <Card variant="bordered">
                    <CardContent className="py-16 text-center">
                        <FileText className="w-16 h-16 text-text-sub mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-text-main mb-2">No data for this period</h2>
                        <p className="text-text-sub">Try selecting a different month or year</p>
                    </CardContent>
                </Card>
            )}

            {/* Table */}
            {rows.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-bg-surface rounded-xl overflow-hidden shadow-sm">
                        <thead>
                            <tr className="bg-bg-page border-b border-border-subtle">
                                <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Employee</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Division</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Days</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Late (min)</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Penalty</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Izin Telat</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Cuti</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Sisa Cuti</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">OT</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Meals</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-text-main">Meal Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.employee_id} className="border-b border-border-subtle hover:bg-bg-page/50 transition-colors">
                                    <td className="px-4 py-3 text-sm text-text-main font-medium">{row.full_name}</td>
                                    <td className="px-4 py-3 text-sm text-text-sub">{row.division_name}</td>
                                    <td className="px-4 py-3 text-sm text-text-main text-right">{row.days_present}</td>
                                    <td className="px-4 py-3 text-sm text-right">
                                        <span className={row.total_late_minutes > 0 ? 'text-orange-600' : 'text-text-main'}>
                                            {formatNumber(row.total_late_minutes)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right">
                                        <span className={row.total_penalty > 0 ? 'text-danger-text' : 'text-text-main'}>
                                            {formatIDR(row.total_penalty)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right">
                                        <span className={row.late_permissions_approved > 0 ? 'text-success-text' : 'text-text-sub'}>
                                            {row.late_permissions_approved}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right">
                                        <span className={row.approved_leave_days > 0 ? 'text-info-text' : 'text-text-sub'}>
                                            {row.approved_leave_days} hari
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right">
                                        <span className={row.leave_balance <= 3 ? 'text-warning-text' : 'text-text-main'}>
                                            {row.leave_balance}/{row.annual_leave_quota}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-text-main text-right">{row.overtime_approved_count}</td>
                                    <td className="px-4 py-3 text-sm text-text-main text-right">{row.meal_claims_paid_count}</td>
                                    <td className="px-4 py-3 text-sm text-primary text-right font-medium">{formatIDR(row.meal_claims_paid_total)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-bg-page font-semibold">
                                <td className="px-4 py-3 text-sm text-text-main" colSpan={2}>Total ({rows.length} employees)</td>
                                <td className="px-4 py-3 text-sm text-text-main text-right">{formatNumber(totals.days_present)}</td>
                                <td className="px-4 py-3 text-sm text-orange-600 text-right">{formatNumber(totals.total_late_minutes)}</td>
                                <td className="px-4 py-3 text-sm text-danger-text text-right">{formatIDR(totals.total_penalty)}</td>
                                <td className="px-4 py-3 text-sm text-success-text text-right">{formatNumber(totals.late_permissions_approved)}</td>
                                <td className="px-4 py-3 text-sm text-info-text text-right">{formatNumber(totals.approved_leave_days)} hari</td>
                                <td className="px-4 py-3 text-sm text-text-sub text-right">-</td>
                                <td className="px-4 py-3 text-sm text-text-main text-right">{formatNumber(totals.overtime_approved_count)}</td>
                                <td className="px-4 py-3 text-sm text-text-main text-right">{formatNumber(totals.meal_claims_paid_count)}</td>
                                <td className="px-4 py-3 text-sm text-primary text-right">{formatIDR(totals.meal_claims_paid_total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}
