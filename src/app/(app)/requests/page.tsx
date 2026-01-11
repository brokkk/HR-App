'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { FilterChips } from '@/components/app/FilterChips'
import {
    Plus, Calendar, Clock, AlertCircle, Loader2,
    FolderKanban, Utensils, ChevronLeft, ChevronRight, Inbox
} from 'lucide-react'
import type { RequestItem } from '@/app/api/requests/route'
import { DateRangeFilter } from '@/components/app/DateRangeFilter'

const typeLabels: Record<string, string> = {
    leave: 'Cuti',
    overtime: 'Lembur',
}

const statusLabels: Record<string, string> = {
    draft: 'Draft',
    pending: 'Menunggu',
    pending_am: 'Menunggu AM',
    pending_hr: 'Menunggu HR',
    approved: 'Disetujui',
    rejected: 'Ditolak',
}

const statusVariants: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
    draft: 'neutral',
    pending: 'warning',
    pending_am: 'warning',
    pending_hr: 'info',
    approved: 'success',
    rejected: 'danger',
}

interface OvertimeMealClaim {
    id: string
    request_id: string
    amount: number
    status: string
}

export default function RequestsPage() {
    const [requests, setRequests] = useState<RequestItem[]>([])
    const [overtimeClaims, setOvertimeClaims] = useState<OvertimeMealClaim[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Tab and filter state
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active')
    const [typeFilter, setTypeFilter] = useState('all')

    // Pagination state
    const [page, setPage] = useState(1)
    const [pageSize] = useState(10)
    const [total, setTotal] = useState(0)

    // Date filter (for history tab)
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const totalPages = Math.ceil(total / pageSize) || 1

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.set('tab', activeTab)
            params.set('page', String(page))
            params.set('pageSize', String(pageSize))
            if (typeFilter !== 'all') {
                params.set('type', typeFilter)
            }
            if (dateRange?.startDate) {
                params.set('startDate', dateRange.startDate)
            }
            if (dateRange?.endDate) {
                params.set('endDate', dateRange.endDate)
            }

            const reqRes = await fetch(`/api/requests?${params}`)
            const reqResult = await reqRes.json()

            if (reqResult.success) {
                setRequests(reqResult.data || [])
                setTotal(reqResult.total || 0)

                // Fetch overtime meal claims
                const overtimeRequestIds = (reqResult.data || [])
                    .filter((r: RequestItem) => r.type === 'overtime')
                    .map((r: RequestItem) => r.id)

                if (overtimeRequestIds.length > 0) {
                    const { data: claims } = await supabase
                        .from('overtime_meal_claims')
                        .select('id, request_id, amount, status')
                        .in('request_id', overtimeRequestIds)
                    setOvertimeClaims(claims || [])
                } else {
                    setOvertimeClaims([])
                }
            }
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch')
        } finally {
            setLoading(false)
        }
    }, [activeTab, typeFilter, page, pageSize, dateRange, supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Reset page when tab, filter or date changes
    useEffect(() => {
        setPage(1)
    }, [activeTab, typeFilter, dateRange])

    const getOvertimeClaimForRequest = (requestId: string) => {
        return overtimeClaims.find(c => c.request_id === requestId)
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    const mealClaimStatusLabels: Record<string, string> = {
        pending: 'Makan: Pending',
        approved: 'Makan: Approved',
        paid: 'Makan: Paid',
        rejected: 'Makan: Rejected',
    }

    return (
        <div className="flex flex-col gap-4 p-4 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-text-main">Permintaan Saya</h1>
                    <p className="text-sm text-text-sub">Cuti dan lembur</p>
                </div>
                <Link href="/requests/new">
                    <Button icon={Plus} size="sm">Baru</Button>
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-subtle">
                <button
                    onClick={() => setActiveTab('active')}
                    className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${activeTab === 'active'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-text-sub hover:text-text-main'
                        }`}
                >
                    Aktif
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${activeTab === 'history'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-text-sub hover:text-text-main'
                        }`}
                >
                    Riwayat
                </button>
            </div>

            {/* Type Filter */}
            <FilterChips
                options={['all', 'leave', 'overtime']}
                selected={typeFilter}
                onChange={setTypeFilter}
                labels={{ all: 'Semua', leave: 'Cuti', overtime: 'Lembur' }}
            />

            {/* Date Filter (only for history tab) */}
            {activeTab === 'history' && (
                <DateRangeFilter
                    value={dateRange}
                    onChange={setDateRange}
                />
            )}

            {/* Result summary */}
            {!loading && total > 0 && (
                <p className="text-xs text-text-sub">
                    Menampilkan {requests.length} dari {total} permintaan
                </p>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-danger-bg rounded-xl">
                    <AlertCircle className="w-5 h-5 text-danger-text" />
                    <p className="text-sm text-danger-text">{error}</p>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && requests.length === 0 && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Inbox className="w-12 h-12 text-text-sub mx-auto mb-4" />
                        <p className="text-text-main font-medium">
                            {activeTab === 'active'
                                ? 'Tidak ada permintaan aktif'
                                : 'Belum ada riwayat'}
                        </p>
                        <p className="text-sm text-text-sub mt-1">
                            {activeTab === 'active'
                                ? 'Buat permintaan baru'
                                : 'Permintaan yang diproses akan muncul di sini'}
                        </p>
                        {activeTab === 'active' && (
                            <Link href="/requests/new" className="inline-block mt-4">
                                <Button icon={Plus}>Permintaan Baru</Button>
                            </Link>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Request List */}
            {!loading && requests.length > 0 && (
                <div className="flex flex-col gap-3">
                    {requests.map((req) => {
                        const overtimeClaim = req.type === 'overtime' ? getOvertimeClaimForRequest(req.id) : null

                        return (
                            <Card key={req.id} variant="bordered">
                                <CardContent className="py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            {/* Type + Status badges */}
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <Badge variant={req.type === 'leave' ? 'info' : 'neutral'}>
                                                    {typeLabels[req.type] || req.type}
                                                </Badge>
                                                <Badge variant={statusVariants[req.status] || 'neutral'}>
                                                    {statusLabels[req.status] || req.status}
                                                </Badge>
                                                {overtimeClaim && (
                                                    <Badge variant={overtimeClaim.status === 'paid' ? 'success' : 'warning'}>
                                                        <Utensils className="w-3 h-3 mr-1" />
                                                        {mealClaimStatusLabels[overtimeClaim.status] || overtimeClaim.status}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Project name for overtime */}
                                            {req.type === 'overtime' && req.project_name && (
                                                <div className="flex items-center gap-1 text-sm text-text-main mb-1">
                                                    <FolderKanban className="w-4 h-4 text-text-sub" />
                                                    <span className="font-medium">{req.project_name}</span>
                                                </div>
                                            )}

                                            {/* Reason */}
                                            <p className="text-sm text-text-main line-clamp-2">
                                                {req.reason || 'Tidak ada alasan'}
                                            </p>

                                            {/* Dates */}
                                            <div className="flex items-center gap-3 mt-2 text-xs text-text-sub">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatDate(req.start_date)}
                                                    {req.end_date && ` - ${formatDate(req.end_date)}`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right side */}
                                        <div className="shrink-0 text-right">
                                            {overtimeClaim && (
                                                <p className="text-sm font-medium text-text-main">
                                                    Rp {overtimeClaim.amount.toLocaleString('id-ID')}
                                                </p>
                                            )}
                                            <p className="text-xs text-text-sub mt-1">
                                                {formatDate(req.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && total > pageSize && (
                <div className="flex items-center justify-center gap-4 mt-4">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        icon={ChevronLeft}
                    >
                        Prev
                    </Button>
                    <span className="text-sm text-text-sub">
                        {page} / {totalPages}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        icon={ChevronRight}
                    >
                        Next
                    </Button>
                </div>
            )}
        </div>
    )
}
