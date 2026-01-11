'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
    Check, X, Banknote, User, Calendar, Loader2, Inbox, Filter, Search,
    ChevronLeft, ChevronRight
} from 'lucide-react'

interface MealClaimItem {
    id: string
    employee_id: string
    employee_name: string
    request_id: string | null
    amount: number
    status: string
    note: string | null
    created_at: string
    updated_at: string | null
    paid_at: string | null
}

interface ApiResponse {
    success: boolean
    page?: number
    pageSize?: number
    total?: number
    items?: MealClaimItem[]
    error?: string
}

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'paid', label: 'Paid' },
    { value: 'all', label: 'All' },
]

const statusVariants: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
    pending: 'warning',
    approved: 'info',
    rejected: 'danger',
    paid: 'success',
}

export function MealClaimsClient() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // URL params
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const statusParam = searchParams.get('status') || 'pending'
    const qParam = searchParams.get('q') || ''

    // State
    const [items, setItems] = useState<MealClaimItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)

    // Pagination
    const [page, setPage] = useState(pageParam)
    const pageSize = 20
    const [total, setTotal] = useState(0)

    // Filters
    const [status, setStatus] = useState(statusParam)
    const [searchQuery, setSearchQuery] = useState(qParam)

    const totalPages = Math.ceil(total / pageSize) || 1

    const fetchData = useCallback(async (fetchPage: number) => {
        setLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            params.set('page', String(fetchPage))
            params.set('pageSize', String(pageSize))
            if (status !== 'all') params.set('status', status)
            if (searchQuery) params.set('q', searchQuery)

            const res = await fetch(`/api/admin/claims/meals?${params}`)
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
    }, [pageSize, status, searchQuery])

    // Update URL
    const updateUrl = useCallback((newPage: number, resetPage = false) => {
        const params = new URLSearchParams()
        params.set('page', String(resetPage ? 1 : newPage))
        if (status !== 'all') params.set('status', status)
        if (searchQuery) params.set('q', searchQuery)
        router.push(`/admin/claims/meals?${params}`)
    }, [router, status, searchQuery])

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

    const handleAction = async (claimId: string, newStatus: 'approved' | 'rejected' | 'paid') => {
        setProcessingId(claimId)
        setError(null)

        try {
            const response = await fetch(`/api/claims/meals/${claimId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })

            const result = await response.json()

            if (result.success) {
                // If last item and page > 1, decrement page
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
                            {status === 'pending' ? 'No pending claims' : 'No claims found'}
                        </h2>
                        <p className="text-text-sub">
                            {status === 'pending' ? 'All claims have been processed' : 'Try different filters'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                /* Claims List */
                <div className="flex flex-col gap-4">
                    {items.map((claim) => (
                        <Card key={claim.id} variant="bordered">
                            <CardContent className="py-5">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                    {/* Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge variant={statusVariants[claim.status] || 'neutral'}>
                                                {claim.status}
                                            </Badge>
                                            <span className="font-bold text-text-main">
                                                Rp {claim.amount.toLocaleString('id-ID')}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 text-text-main mb-1">
                                            <User className="w-4 h-4 text-text-sub" />
                                            <span className="font-medium">{claim.employee_name}</span>
                                        </div>

                                        <div className="flex items-center gap-2 text-sm text-text-sub">
                                            <Calendar className="w-4 h-4" />
                                            <span>Submitted: {formatDate(claim.created_at)}</span>
                                            {claim.paid_at && (
                                                <span className="text-success-text">• Paid: {formatDate(claim.paid_at)}</span>
                                            )}
                                        </div>

                                        {claim.note && (
                                            <p className="text-sm text-text-sub bg-bg-page p-2 rounded-lg mt-2">
                                                {claim.note}
                                            </p>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    {claim.status === 'pending' && (
                                        <div className="flex gap-2 lg:flex-col">
                                            <Button
                                                onClick={() => handleAction(claim.id, 'approved')}
                                                disabled={processingId === claim.id}
                                                icon={processingId === claim.id ? Loader2 : Check}
                                                className={processingId === claim.id ? 'animate-pulse' : ''}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                onClick={() => handleAction(claim.id, 'rejected')}
                                                disabled={processingId === claim.id}
                                                icon={X}
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    )}

                                    {claim.status === 'approved' && (
                                        <Button
                                            onClick={() => handleAction(claim.id, 'paid')}
                                            disabled={processingId === claim.id}
                                            icon={processingId === claim.id ? Loader2 : Banknote}
                                            className={processingId === claim.id ? 'animate-pulse' : ''}
                                        >
                                            Mark Paid
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
