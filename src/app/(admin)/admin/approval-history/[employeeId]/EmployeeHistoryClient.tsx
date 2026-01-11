'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DateRangeFilter } from '@/components/app/DateRangeFilter'
import {
    Calendar, Loader2, Inbox, ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle
} from 'lucide-react'

interface ApprovalItem {
    id: string
    kind: 'request' | 'late_permission'
    type?: string
    status: string
    start_date?: string
    end_date?: string
    date?: string
    reason?: string | null
    employee_id: string
    employee_name: string
    division_name: string
    project_name?: string | null
    max_check_in_time?: string
    category?: string
    created_at: string
}

interface ApiResponse {
    success: boolean
    page?: number
    pageSize?: number
    total?: number
    items?: ApprovalItem[]
    error?: string
}

interface Props {
    employeeId: string
    employeeName: string
}

const categoryLabels: Record<string, string> = {
    urgent: 'Urgent',
    hujan: 'Hujan Deras',
    habis_lembur: 'Habis Lembur',
}

export function EmployeeHistoryClient({ employeeId, employeeName }: Props) {
    const [items, setItems] = useState<ApprovalItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Filters
    const [kindFilter, setKindFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null)

    // Pagination
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const pageSize = 20
    const totalPages = Math.ceil(total / pageSize) || 1

    const fetchData = useCallback(async (fetchPage: number) => {
        setLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            params.set('kind', kindFilter)
            params.set('status', 'processed')
            params.set('page', String(fetchPage))
            params.set('pageSize', String(pageSize))
            params.set('q', employeeName) // Filter by employee name

            if (dateRange?.startDate) {
                params.set('startDate', dateRange.startDate)
            }
            if (dateRange?.endDate) {
                params.set('endDate', dateRange.endDate)
            }

            const res = await fetch(`/api/admin/approvals?${params}`)
            const result: ApiResponse = await res.json()

            if (result.success) {
                // Filter to only this employee and by status
                let filteredItems = (result.items || []).filter(item => item.employee_id === employeeId)
                if (statusFilter !== 'all') {
                    filteredItems = filteredItems.filter(item => item.status === statusFilter)
                }
                setItems(filteredItems)
                setTotal(filteredItems.length)
            } else {
                setError(result.error || 'Failed to load')
            }
        } catch (err) {
            setError('Failed to load data')
        } finally {
            setLoading(false)
        }
    }, [employeeId, employeeName, kindFilter, statusFilter, dateRange])

    useEffect(() => {
        fetchData(page)
    }, [fetchData, page])

    useEffect(() => {
        setPage(1)
    }, [kindFilter, statusFilter, dateRange])

    const handlePrev = () => {
        if (page > 1) setPage(page - 1)
    }

    const handleNext = () => {
        if (page < totalPages) setPage(page + 1)
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    const formatTime = (time: string) => time?.slice(0, 5) || '-'

    const getStatusBadge = (status: string) => {
        if (status === 'approved') {
            return <Badge variant="success">Approved</Badge>
        }
        return <Badge variant="danger">Rejected</Badge>
    }

    const getTypeBadge = (item: ApprovalItem) => {
        if (item.kind === 'late_permission') {
            return <Badge variant="info">Izin Telat</Badge>
        }
        return item.type === 'leave'
            ? <Badge variant="neutral">Cuti</Badge>
            : <Badge variant="warning">Lembur</Badge>
    }

    const getTypeLabel = (item: ApprovalItem) => {
        if (item.kind === 'late_permission') {
            return categoryLabels[item.category || ''] || 'Izin Telat'
        }
        return item.type === 'leave' ? 'Cuti' : 'Lembur'
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Filters Card */}
            <Card variant="bordered">
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Kind Filter */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-text-main">Jenis:</label>
                            <select
                                value={kindFilter}
                                onChange={(e) => setKindFilter(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="all">Semua</option>
                                <option value="requests">Cuti/Lembur</option>
                                <option value="late">Izin Telat</option>
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-text-main">Status:</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="all">Semua</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Date Filter */}
            <DateRangeFilter value={dateRange} onChange={setDateRange} />

            {/* Summary */}
            {!loading && (
                <p className="text-sm text-text-sub">
                    {total} riwayat ditemukan
                </p>
            )}

            {/* Loading */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : error ? (
                <Card variant="bordered">
                    <CardContent className="py-8 text-center text-danger-text">
                        {error}
                    </CardContent>
                </Card>
            ) : items.length === 0 ? (
                <Card variant="bordered">
                    <CardContent className="py-16 text-center">
                        <Inbox className="w-16 h-16 text-text-sub mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-text-main mb-2">Tidak ada riwayat</h2>
                        <p className="text-text-sub">Karyawan ini belum memiliki riwayat approval</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse bg-bg-surface rounded-xl overflow-hidden shadow-sm">
                            <thead>
                                <tr className="bg-bg-page border-b border-border-subtle">
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Jenis</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Tanggal</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-main">Alasan</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-text-main">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={`${item.kind}-${item.id}`} className="border-b border-border-subtle hover:bg-bg-page/50 transition-colors">
                                        <td className="px-4 py-3 text-sm">
                                            {getTypeBadge(item)}
                                            {item.kind === 'late_permission' && (
                                                <span className="ml-1 text-xs text-text-sub">
                                                    ({getTypeLabel(item)})
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-sub">
                                            {item.kind === 'request' ? (
                                                <>
                                                    {formatDate(item.start_date!)}
                                                    {item.end_date && item.end_date !== item.start_date && (
                                                        <span className="text-text-muted"> - {formatDate(item.end_date)}</span>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    {formatDate(item.date!)}
                                                    <span className="text-text-muted ml-1">
                                                        (max {formatTime(item.max_check_in_time!)})
                                                    </span>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-text-sub max-w-[300px] truncate">
                                            {item.reason || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {getStatusBadge(item.status)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between py-4">
                            <p className="text-sm text-text-sub">Page {page} of {totalPages}</p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePrev}
                                    disabled={page <= 1}
                                    className="px-4 py-2 rounded-lg bg-bg-page hover:bg-border-subtle disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                >
                                    <ChevronLeft className="w-4 h-4 inline mr-1" />
                                    Previous
                                </button>
                                <button
                                    onClick={handleNext}
                                    disabled={page >= totalPages}
                                    className="px-4 py-2 rounded-lg bg-bg-page hover:bg-border-subtle disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                >
                                    Next
                                    <ChevronRight className="w-4 h-4 inline ml-1" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
