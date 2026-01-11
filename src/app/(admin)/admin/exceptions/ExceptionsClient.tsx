'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Search, Filter, Loader2, AlertCircle, Inbox, Calendar, ChevronLeft, ChevronRight, MapPin, Fingerprint, Upload, Edit, Edit3 } from 'lucide-react'
import type { ExceptionsResponse, ExceptionItem } from '@/app/api/admin/exceptions/route'
import { AttendanceFixModal } from '@/components/admin/AttendanceFixModal'

type SourceType = 'fingerprint' | 'outside' | 'manual' | 'import' | null

function SourceBadge({ source }: { source: SourceType }) {
    if (!source) return <span className="text-text-sub">—</span>

    const config: Record<string, { label: string; variant: 'neutral' | 'info' | 'warning' }> = {
        fingerprint: { label: 'FP', variant: 'neutral' },
        outside: { label: 'Luar', variant: 'info' },
        import: { label: 'Import', variant: 'warning' },
        manual: { label: 'Manual', variant: 'neutral' },
    }

    const cfg = config[source]
    if (!cfg) return <span className="text-text-sub">—</span>

    return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
}

const TYPE_OPTIONS = [
    { value: 'all', label: 'All Types' },
    { value: 'late', label: 'Late >30m' },
    { value: 'missing', label: 'Missing Checkout' },
    { value: 'no_checkin', label: 'Tidak ada absen' },
]

function getTodayWIB(): string {
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    return wibTime.toISOString().split('T')[0]
}

export function ExceptionsClient() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const today = getTodayWIB()

    // URL params
    const [start, setStart] = useState(searchParams.get('start') || today)
    const [end, setEnd] = useState(searchParams.get('end') || start)
    const [type, setType] = useState(searchParams.get('type') || 'all')
    const [search, setSearch] = useState(searchParams.get('q') || '')

    // Pagination
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10)
    const [page, setPage] = useState(pageParam)
    const [pageSize] = useState(pageSizeParam)
    const [total, setTotal] = useState(0)

    const [data, setData] = useState<ExceptionItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Fix modal state
    const [fixModalOpen, setFixModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<ExceptionItem | null>(null)

    const totalPages = Math.ceil(total / pageSize) || 1

    const fetchData = useCallback(async (fetchPage: number) => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams()
            params.set('start', start)
            params.set('end', end)
            params.set('page', String(fetchPage))
            params.set('pageSize', String(pageSize))
            if (type !== 'all') params.set('type', type)
            if (search) params.set('q', search)

            const res = await fetch(`/api/admin/exceptions?${params.toString()}`)
            const result: ExceptionsResponse = await res.json()

            if (result.success) {
                setData(result.items || [])
                setTotal(result.total || 0)
            } else {
                setError(result.error || 'Failed to load')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load')
        } finally {
            setLoading(false)
        }
    }, [start, end, type, search, pageSize])

    // Update URL
    const updateUrl = useCallback((newPage: number, resetPage = false) => {
        const params = new URLSearchParams()
        params.set('start', start)
        params.set('end', end)
        params.set('page', String(resetPage ? 1 : newPage))
        if (pageSize !== 20) params.set('pageSize', String(pageSize))
        if (type !== 'all') params.set('type', type)
        if (search) params.set('q', search)
        router.push(`/admin/exceptions?${params.toString()}`)
    }, [router, start, end, type, search, pageSize])

    // Initial fetch
    useEffect(() => {
        fetchData(page)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleApply = () => {
        setPage(1)
        updateUrl(1, true)
        fetchData(1)
    }

    const handlePrev = () => {
        if (page > 1) {
            const newPage = page - 1
            setPage(newPage)
            updateUrl(newPage)
            fetchData(newPage)
        }
    }

    const handleNext = () => {
        if (page < totalPages) {
            const newPage = page + 1
            setPage(newPage)
            updateUrl(newPage)
            fetchData(newPage)
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    const formatTime = (timeStr: string | null) => {
        if (!timeStr) return '—'
        return new Date(timeStr).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })
    }

    // Calculate showing range
    const showingFrom = total > 0 ? (page - 1) * pageSize + 1 : 0
    const showingTo = Math.min(page * pageSize, total)

    return (
        <div className="flex flex-col gap-6">
            {/* Filters */}
            <Card variant="bordered">
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-text-sub font-medium">Start Date</label>
                            <input
                                type="date"
                                value={start}
                                onChange={(e) => setStart(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-text-sub font-medium">End Date</label>
                            <input
                                type="date"
                                value={end}
                                onChange={(e) => setEnd(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-text-sub font-medium">Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label className="text-xs text-text-sub font-medium">Search Employee</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-sub" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Employee name..."
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                                />
                            </div>
                        </div>
                        <Button onClick={handleApply} icon={Filter}>
                            Apply
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between">
                <span className="text-sm text-text-sub">
                    {total > 0 ? `Showing ${showingFrom}–${showingTo} of ${total}` : 'No results'}
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handlePrev}
                        disabled={page <= 1 || loading}
                        icon={ChevronLeft}
                    >
                        Prev
                    </Button>
                    <span className="text-sm text-text-main font-medium px-2">
                        Page {page} of {totalPages}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleNext}
                        disabled={page >= totalPages || loading}
                        icon={ChevronRight}
                    >
                        Next
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-4 bg-danger-bg rounded-xl">
                    <AlertCircle className="w-5 h-5 text-danger-text" />
                    <p className="text-sm text-danger-text">{error}</p>
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : data.length === 0 ? (
                /* Empty State */
                <Card variant="bordered">
                    <CardContent className="py-16 text-center">
                        <Inbox className="w-12 h-12 text-text-sub mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-text-main mb-2">No exceptions found</h3>
                        <p className="text-text-sub">No attendance exceptions in the selected date range.</p>
                    </CardContent>
                </Card>
            ) : (
                /* Data Table */
                <Card variant="bordered">
                    <CardHeader
                        title="Exceptions"
                        subtitle={`${start} to ${end}`}
                    />
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-bg-page border-b border-border-subtle">
                                        <th className="px-4 py-3 text-left font-medium text-text-main">Employee</th>
                                        <th className="px-4 py-3 text-left font-medium text-text-main">Division</th>
                                        <th className="px-4 py-3 text-left font-medium text-text-main">Date</th>
                                        <th className="px-4 py-3 text-left font-medium text-text-main">Issue</th>
                                        <th className="px-4 py-3 text-left font-medium text-text-main">Source</th>
                                        <th className="px-4 py-3 text-left font-medium text-text-main">Check-in</th>
                                        <th className="px-4 py-3 text-left font-medium text-text-main">Check-out</th>
                                        <th className="px-4 py-3 text-right font-medium text-text-main">Late</th>
                                        <th className="px-4 py-3 text-right font-medium text-text-main">Penalty</th>
                                        <th className="px-4 py-3 text-center font-medium text-text-main">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((item, i) => (
                                        <tr key={`${item.employee_id}-${item.date}-${i}`} className="border-b border-border-subtle hover:bg-bg-page/50">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Avatar name={item.employee_name} size="sm" />
                                                    <span className="font-medium text-text-main">{item.employee_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-text-sub">{item.division_name}</td>
                                            <td className="px-4 py-3 text-text-sub">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4" />
                                                    {formatDate(item.date)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={
                                                    item.issue === 'Late >30m' ? 'danger' :
                                                        item.issue === 'No Check-in' ? 'neutral' : 'warning'
                                                }>
                                                    {item.issue}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <SourceBadge source={item.check_in_source} />
                                            </td>
                                            <td className="px-4 py-3 text-text-sub font-mono">{formatTime(item.check_in)}</td>
                                            <td className="px-4 py-3 text-text-sub font-mono">{formatTime(item.check_out)}</td>
                                            <td className="px-4 py-3 text-right text-text-main">
                                                {item.late_minutes > 0 ? `${item.late_minutes} min` : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right text-danger-text font-medium">
                                                {item.penalty_amount > 0 ? `Rp ${item.penalty_amount.toLocaleString('id-ID')}` : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    icon={Edit3}
                                                    onClick={() => {
                                                        setSelectedItem(item)
                                                        setFixModalOpen(true)
                                                    }}
                                                >
                                                    Perbaiki
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Fix Modal */}
            {selectedItem && (
                <AttendanceFixModal
                    isOpen={fixModalOpen}
                    onClose={() => {
                        setFixModalOpen(false)
                        setSelectedItem(null)
                    }}
                    onSuccess={() => {
                        setFixModalOpen(false)
                        setSelectedItem(null)
                        fetchData(page)
                    }}
                    employeeId={selectedItem.employee_id}
                    employeeName={selectedItem.employee_name}
                    date={selectedItem.date}
                    currentCheckIn={selectedItem.check_in}
                    currentCheckOut={selectedItem.check_out}
                />
            )}
        </div>
    )
}
