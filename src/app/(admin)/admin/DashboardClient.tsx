'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Clock, TimerOff, Wallet, Hourglass, Plane, Clock4, Loader2, AlertCircle, Inbox, Check, X } from 'lucide-react'
import { DateStrip } from '@/components/layout/DateStrip'
import { KpiCard } from '@/components/admin/KpiCard'
import { AttendanceSummary } from '@/components/admin/AttendanceSummary'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import type { DashboardResponse } from '@/app/api/admin/dashboard/route'

type DashboardData = NonNullable<{
    date: string
    kpis: NonNullable<DashboardResponse['kpis']>
    summary: NonNullable<DashboardResponse['summary']>
    exceptions: NonNullable<DashboardResponse['exceptions']>
    approvalsPreview: NonNullable<DashboardResponse['approvalsPreview']>
}>

export function DashboardClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const dateParam = searchParams.get('date')

    const [data, setData] = useState<DashboardData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)

    const fetchDashboard = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const url = dateParam ? `/api/admin/dashboard?date=${dateParam}` : '/api/admin/dashboard'
            const res = await fetch(url)
            const result: DashboardResponse = await res.json()
            if (result.success && result.kpis && result.summary && result.exceptions && result.approvalsPreview) {
                setData({
                    date: result.date!,
                    kpis: result.kpis,
                    summary: result.summary,
                    exceptions: result.exceptions,
                    approvalsPreview: result.approvalsPreview,
                })
            } else {
                setError(result.error || 'Failed to load dashboard')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load')
        } finally {
            setLoading(false)
        }
    }, [dateParam])

    useEffect(() => {
        fetchDashboard()
    }, [fetchDashboard])

    const handleDateChange = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0]
        router.push(`/admin?date=${dateStr}`)
    }

    const handleApprovalAction = async (requestId: string, action: 'approved' | 'rejected') => {
        setProcessingId(requestId)
        try {
            const res = await fetch(`/api/requests/${requestId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            const result = await res.json()
            if (result.success) {
                fetchDashboard() // Refresh
            } else {
                setError(result.error || 'Action failed')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Action failed')
        } finally {
            setProcessingId(null)
        }
    }

    const formatPenalty = (amount: number): string => {
        if (amount >= 1000000) {
            return `${(amount / 1000000).toFixed(1)}M Rp`
        }
        if (amount >= 1000) {
            return `${(amount / 1000).toFixed(0)}K Rp`
        }
        return `${amount.toLocaleString('id-ID')} Rp`
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    const selectedDate = dateParam ? new Date(dateParam) : new Date()

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 p-4 bg-danger-bg rounded-xl">
                    <AlertCircle className="w-5 h-5 text-danger-text" />
                    <p className="text-sm text-danger-text">{error || 'No data'}</p>
                </div>
                <Button onClick={fetchDashboard}>Retry</Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-8">
            {/* Heading & Filters */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-text-main tracking-tight">Dashboard</h1>
                    <p className="text-text-sub mt-1">
                        {data.date === new Date().toISOString().split('T')[0] ? "Today's" : formatDate(data.date)} HR overview
                    </p>
                </div>
                <DateStrip selectedDate={selectedDate} onDateChange={handleDateChange} />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title="On-time"
                    value={data.kpis.on_time_count}
                    subtitle={`of ${data.kpis.active_employee_count} employees`}
                    icon={Clock}
                    iconBgColor="bg-blue-50"
                    iconColor="text-primary"
                    badge={data.kpis.checked_in_count > 0 ? { text: `${data.kpis.checked_in_count} checked in`, variant: 'success' } : undefined}
                />
                <KpiCard
                    title="Late >30m"
                    value={data.kpis.penalized_count}
                    subtitle="Penalized today"
                    icon={TimerOff}
                    iconBgColor="bg-orange-50"
                    iconColor="text-orange-500"
                    badge={data.kpis.penalized_count > 0 ? { text: 'Penalized', variant: 'danger' } : undefined}
                />
                <KpiCard
                    title="Total penalties"
                    value={formatPenalty(data.kpis.total_penalties_month)}
                    subtitle="Deducted this month"
                    icon={Wallet}
                    iconBgColor="bg-purple-50"
                    iconColor="text-purple-600"
                />
                <KpiCard
                    title="Overtime pending"
                    value={data.kpis.overtime_pending_count}
                    subtitle="Requests queued"
                    icon={Hourglass}
                    iconBgColor="bg-pink-50"
                    iconColor="text-pink-500"
                    badge={data.kpis.overtime_pending_count > 0 ? { text: 'Action needed', variant: 'info' } : undefined}
                />
            </div>

            {/* Attendance Summary */}
            <AttendanceSummary
                percentage={Math.round(data.summary.attendance_rate_today * 100)}
                change={0}
            />

            {/* Bottom Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-8">
                {/* Exceptions Table */}
                <div className="lg:col-span-2">
                    <Card variant="bordered">
                        <CardHeader
                            title="Exceptions"
                            subtitle="Requires review"
                            action={
                                <a href="/admin/exceptions" className="text-sm text-primary hover:underline">
                                    View all
                                </a>
                            }
                        />
                        <CardContent>
                            {data.exceptions.length === 0 ? (
                                <div className="py-8 text-center">
                                    <Inbox className="w-12 h-12 text-text-sub mx-auto mb-2" />
                                    <p className="text-text-sub">No exceptions for this date</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-text-sub border-b border-border-subtle">
                                                <th className="px-4 py-3 text-left font-medium">Employee</th>
                                                <th className="px-4 py-3 text-left font-medium">Division</th>
                                                <th className="px-4 py-3 text-left font-medium">Issue</th>
                                                <th className="px-4 py-3 text-right font-medium">Penalty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.exceptions.map((exc, i) => (
                                                <tr key={i} className="border-b border-border-subtle hover:bg-bg-page/50">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <Avatar name={exc.employee_name} size="sm" />
                                                            <span className="font-medium text-text-main">{exc.employee_name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-text-sub">{exc.division_name}</td>
                                                    <td className="px-4 py-3">
                                                        <Badge variant={exc.issue === 'Late >30m' ? 'danger' : 'warning'}>
                                                            {exc.issue}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-danger-text font-medium">
                                                        {exc.penalty_amount > 0 ? `Rp ${exc.penalty_amount.toLocaleString('id-ID')}` : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Approvals Queue */}
                <Card variant="bordered" className="flex flex-col">
                    <CardHeader
                        title="Approvals"
                        subtitle="Pending requests"
                        action={<Badge variant="info">{data.approvalsPreview.length}</Badge>}
                    />
                    <CardContent className="flex flex-col gap-3">
                        {data.approvalsPreview.length === 0 ? (
                            <div className="py-8 text-center">
                                <Inbox className="w-10 h-10 text-text-sub mx-auto mb-2" />
                                <p className="text-text-sub text-sm">No pending approvals</p>
                            </div>
                        ) : (
                            data.approvalsPreview.map((req) => (
                                <div key={req.id} className="p-3 bg-bg-page rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${req.type === 'leave' ? 'bg-blue-100' : 'bg-purple-100'
                                            }`}>
                                            {req.type === 'leave' ? (
                                                <Plane className="w-4 h-4 text-primary" />
                                            ) : (
                                                <Clock4 className="w-4 h-4 text-purple-600" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-text-main">{req.employee_name}</p>
                                            <p className="text-xs text-text-sub">{req.type === 'leave' ? 'Cuti' : 'Lembur'} • {formatDate(req.start_date)}</p>
                                        </div>
                                    </div>
                                    {req.reason && (
                                        <p className="text-xs text-text-sub mb-2 line-clamp-2">{req.reason}</p>
                                    )}
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => handleApprovalAction(req.id, 'approved')}
                                            disabled={processingId === req.id}
                                            icon={processingId === req.id ? Loader2 : Check}
                                            className="flex-1"
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleApprovalAction(req.id, 'rejected')}
                                            disabled={processingId === req.id}
                                            icon={X}
                                            className="flex-1"
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
