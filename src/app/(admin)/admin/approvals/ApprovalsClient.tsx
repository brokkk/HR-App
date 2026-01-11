'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { FilterChips } from '@/components/app/FilterChips'
import {
    Check, X, Calendar, User, Loader2, Inbox, Filter, Search,
    ChevronLeft, ChevronRight, Clock
} from 'lucide-react'

interface ApprovalItem {
    id: string
    kind: 'request' | 'late_permission'
    type: string  // leave, overtime, urgent, hujan, habis_lembur
    status: string
    start_date: string
    end_date: string
    reason: string | null
    employee_id: string
    employee_name: string
    division_name: string
    project_id?: string | null
    project_name?: string | null
    // Late permission specific
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

const KIND_OPTIONS = ['All', 'Requests', 'Izin Telat']
const TYPE_OPTIONS = [
    { value: 'all', label: 'All Types' },
    { value: 'leave', label: 'Leave' },
    { value: 'overtime', label: 'Overtime' },
]
const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'all', label: 'All' },
]

const categoryLabels: Record<string, string> = {
    urgent: 'Urgent',
    hujan: 'Hujan Deras',
    habis_lembur: 'Habis Lembur',
}

export function ApprovalsClient() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // URL params
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10)
    const kindParam = searchParams.get('kind') || 'all'
    const typeParam = searchParams.get('type') || 'all'
    const statusParam = searchParams.get('status') || 'pending'
    const qParam = searchParams.get('q') || ''

    // State
    const [items, setItems] = useState<ApprovalItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)

    // Pagination
    const [page, setPage] = useState(pageParam)
    const [pageSize] = useState(pageSizeParam)
    const [total, setTotal] = useState(0)

    // Filters
    const [kind, setKind] = useState(kindParam === 'late' ? 'Izin Telat' : kindParam === 'requests' ? 'Requests' : 'All')
    const [type, setType] = useState(typeParam)
    const [status, setStatus] = useState(statusParam)
    const [searchQuery, setSearchQuery] = useState(qParam)

    const totalPages = Math.ceil(total / pageSize) || 1

    // Map UI kind to API kind
    const getApiKind = (uiKind: string): string => {
        if (uiKind === 'Izin Telat') return 'late'
        if (uiKind === 'Requests') return 'requests'
        return 'all'
    }

    const fetchData = useCallback(async (fetchPage: number) => {
        setLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            params.set('page', String(fetchPage))
            params.set('pageSize', String(pageSize))
            params.set('kind', getApiKind(kind))
            if (type !== 'all' && kind !== 'Izin Telat') params.set('type', type)
            if (status !== 'all') params.set('status', status)
            if (searchQuery) params.set('q', searchQuery)

            const res = await fetch(`/api/admin/approvals?${params}`)
            const data: ApiResponse = await res.json()

            if (data.success) {
                setItems(data.items || [])
                setTotal(data.total || 0)
            } else {
                setError(data.error || 'Failed to fetch')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch')
        } finally {
            setLoading(false)
        }
    }, [pageSize, kind, type, status, searchQuery])

    // Update URL
    const updateUrl = useCallback((newPage: number, resetPage = false) => {
        const params = new URLSearchParams()
        params.set('page', String(resetPage ? 1 : newPage))
        const apiKind = getApiKind(kind)
        if (apiKind !== 'all') params.set('kind', apiKind)
        if (type !== 'all' && apiKind !== 'late') params.set('type', type)
        if (status !== 'all') params.set('status', status)
        if (searchQuery) params.set('q', searchQuery)
        router.push(`/admin/approvals?${params}`)
    }, [router, kind, type, status, searchQuery])

    // Initial fetch
    useEffect(() => {
        fetchData(page)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleKindChange = (newKind: string) => {
        setKind(newKind)
        setPage(1)
    }

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

    const handleAction = async (item: ApprovalItem, action: 'approved' | 'rejected') => {
        setProcessingId(item.id)
        setError(null)

        try {
            // Different endpoint for late_permission vs request
            const endpoint = item.kind === 'late_permission'
                ? `/api/late-permissions/${item.id}/approve`
                : `/api/requests/${item.id}/approve`

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })

            const result = await response.json()

            if (result.success) {
                // Refetch current page
                if (items.length === 1 && page > 1) {
                    const newPage = page - 1
                    setPage(newPage)
                    updateUrl(newPage)
                    fetchData(newPage)
                } else {
                    fetchData(page)
                }
            } else {
                setError(result.error || 'Action failed')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Action failed')
        } finally {
            setProcessingId(null)
        }
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    const formatTime = (time: string) => {
        return time?.slice(0, 5) || '--:--'
    }

    // Check if item is actionable
    const isActionable = (item: ApprovalItem) => {
        if (item.kind === 'late_permission') {
            return item.status === 'pending_lead' || item.status === 'pending_coo'
        }
        return item.status === 'pending' || item.status === 'pending_am' || item.status === 'pending_hr'
    }

    // Get status display
    const getStatusDisplay = (item: ApprovalItem) => {
        if (item.kind === 'late_permission') {
            switch (item.status) {
                case 'pending_lead': return { text: 'Pending Lead', variant: 'warning' as const }
                case 'pending_coo': return { text: 'Pending COO', variant: 'info' as const }
                case 'approved': return { text: 'Approved', variant: 'success' as const }
                case 'rejected': return { text: 'Rejected', variant: 'danger' as const }
                default: return { text: item.status, variant: 'neutral' as const }
            }
        }
        switch (item.status) {
            case 'pending': return { text: 'Pending', variant: 'warning' as const }
            case 'pending_am': return { text: 'Pending AM', variant: 'warning' as const }
            case 'pending_hr': return { text: 'Pending HR', variant: 'info' as const }
            case 'approved': return { text: 'Approved', variant: 'success' as const }
            case 'rejected': return { text: 'Rejected', variant: 'danger' as const }
            default: return { text: item.status, variant: 'neutral' as const }
        }
    }

    // Calculate showing range
    const showingFrom = total > 0 ? (page - 1) * pageSize + 1 : 0
    const showingTo = Math.min(page * pageSize, total)

    return (
        <div className="flex flex-col gap-6">
            {/* Kind Tabs */}
            <FilterChips options={KIND_OPTIONS} selected={kind} onChange={handleKindChange} />

            {/* Filters */}
            <Card variant="bordered">
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-end gap-4">
                        {kind !== 'Izin Telat' && (
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
                        )}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-text-sub font-medium">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {STATUS_OPTIONS.map(opt => (
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
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                                    placeholder="Employee name..."
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                <div className="p-4 bg-danger-bg rounded-xl">
                    <p className="text-sm text-danger-text">{error}</p>
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : items.length === 0 ? (
                /* Empty State */
                <Card variant="bordered">
                    <CardContent className="py-16 text-center">
                        <Inbox className="w-16 h-16 text-text-sub mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-text-main mb-2">
                            {status === 'pending' ? 'No pending items' : 'No items found'}
                        </h2>
                        <p className="text-text-sub">
                            {status === 'pending' ? 'All items have been processed' : 'Try different filters'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                /* Items List */
                <div className="flex flex-col gap-4">
                    {items.map((item) => {
                        const statusDisplay = getStatusDisplay(item)
                        const actionable = isActionable(item)

                        return (
                            <Card key={`${item.kind}-${item.id}`} variant="bordered">
                                <CardContent className="py-5">
                                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                        {/* Info */}
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                {/* Kind badge */}
                                                {item.kind === 'late_permission' ? (
                                                    <Badge variant="neutral">
                                                        <Clock className="w-3 h-3 mr-1" />
                                                        Izin Telat
                                                    </Badge>
                                                ) : (
                                                    <Badge variant={item.type === 'leave' ? 'info' : 'neutral'}>
                                                        {item.type === 'leave' ? 'Cuti' : 'Lembur'}
                                                    </Badge>
                                                )}
                                                {/* Category for late permission */}
                                                {item.kind === 'late_permission' && item.category && (
                                                    <Badge variant="warning">
                                                        {categoryLabels[item.category] || item.category}
                                                    </Badge>
                                                )}
                                                {/* Status */}
                                                <Badge variant={statusDisplay.variant}>
                                                    {statusDisplay.text}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center gap-2 text-text-main mb-1">
                                                <User className="w-4 h-4 text-text-sub" />
                                                <span className="font-medium">{item.employee_name}</span>
                                                <span className="text-text-sub text-sm">• {item.division_name}</span>
                                            </div>

                                            <div className="flex items-center gap-2 text-sm text-text-sub mb-2">
                                                <Calendar className="w-4 h-4" />
                                                <span>
                                                    {formatDate(item.start_date)}
                                                    {item.end_date && ` - ${formatDate(item.end_date)}`}
                                                </span>
                                                {/* Max time for late permission */}
                                                {item.kind === 'late_permission' && item.max_check_in_time && (
                                                    <span className="ml-2 px-2 py-0.5 bg-success-bg text-success-text rounded text-xs font-medium">
                                                        Max {formatTime(item.max_check_in_time)} WIB
                                                    </span>
                                                )}
                                            </div>

                                            {item.reason && (
                                                <p className="text-sm text-text-sub bg-bg-page p-3 rounded-xl">
                                                    {item.reason}
                                                </p>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        {actionable && (
                                            <div className="flex gap-2 lg:flex-col">
                                                <Button
                                                    onClick={() => handleAction(item, 'approved')}
                                                    disabled={processingId === item.id}
                                                    icon={processingId === item.id ? Loader2 : Check}
                                                    className={processingId === item.id ? 'animate-pulse' : ''}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => handleAction(item, 'rejected')}
                                                    disabled={processingId === item.id}
                                                    icon={X}
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
