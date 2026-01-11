'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { FilterChips } from '@/components/app/FilterChips'
import {
    CheckCircle2, XCircle, Loader2, AlertCircle, Calendar,
    Clock, FileText, Inbox, ChevronLeft, ChevronRight, Search
} from 'lucide-react'
import { DateRangeFilter } from '@/components/app/DateRangeFilter'

// Types
interface ApprovalItem {
    id: string
    kind: 'request' | 'late_permission'
    type?: string
    category?: string
    status: string
    employee_id: string
    employee_name: string
    division_name: string | null
    start_date?: string
    date?: string
    end_date?: string | null
    max_check_in_time?: string
    reason: string
    created_at: string
    project_name?: string | null
}

const statusLabels: Record<string, string> = {
    pending: 'Menunggu',
    pending_am: 'Menunggu AM',
    pending_hr: 'Menunggu HR',
    pending_lead: 'Menunggu Lead',
    pending_coo: 'Menunggu COO',
    approved: 'Disetujui',
    rejected: 'Ditolak',
}

const statusVariants: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
    pending: 'warning',
    pending_am: 'warning',
    pending_hr: 'info',
    pending_lead: 'warning',
    pending_coo: 'info',
    approved: 'success',
    rejected: 'danger',
}

const categoryLabels: Record<string, string> = {
    urgent: 'Urgent',
    hujan: 'Hujan',
    habis_lembur: 'Habis Lembur',
}

const typeLabels: Record<string, string> = {
    leave: 'Cuti',
    overtime: 'Lembur',
}

export default function ApprovalsPage() {
    const [items, setItems] = useState<ApprovalItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processing, setProcessing] = useState<string | null>(null)

    // Tab and filter state
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
    const [kindFilter, setKindFilter] = useState('all')
    const [userRole, setUserRole] = useState<string | null>(null)

    // Pagination
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const pageSize = 10
    const totalPages = Math.ceil(total / pageSize) || 1

    // Search and date filter (for history tab)
    const [searchQuery, setSearchQuery] = useState('')
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const fetchApprovals = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            params.set('kind', kindFilter)
            // For pending tab, show all pending statuses
            // For history tab, show approved/rejected
            if (activeTab === 'pending') {
                params.set('status', 'pending')
            } else {
                params.set('status', 'processed')
            }
            params.set('page', String(page))
            params.set('pageSize', String(pageSize))

            // Search and date filter (for history)
            if (searchQuery.trim()) {
                params.set('q', searchQuery.trim())
            }
            if (dateRange?.startDate) {
                params.set('startDate', dateRange.startDate)
            }
            if (dateRange?.endDate) {
                params.set('endDate', dateRange.endDate)
            }

            const res = await fetch(`/api/admin/approvals?${params}`)
            const result = await res.json()

            if (result.success) {
                setItems(result.items || [])
                setTotal(result.total || 0)
            } else {
                setError(result.error || 'Gagal memuat data')
            }
        } catch (err) {
            setError('Gagal memuat data')
        } finally {
            setLoading(false)
        }
    }, [kindFilter, activeTab, page, searchQuery, dateRange])

    const fetchUserRole = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: emp } = await supabase
                .from('employees')
                .select('role')
                .eq('id', user.id)
                .single()
            setUserRole(emp?.role || null)
        }
    }, [supabase])

    useEffect(() => {
        fetchUserRole()
        fetchApprovals()
    }, [fetchApprovals, fetchUserRole])

    // Reset page when tab, filter, search or date changes
    useEffect(() => {
        setPage(1)
    }, [activeTab, kindFilter, searchQuery, dateRange])

    const handleAction = async (item: ApprovalItem, action: 'approved' | 'rejected') => {
        setProcessing(item.id)
        setError(null)

        try {
            const endpoint = item.kind === 'late_permission'
                ? `/api/late-permissions/${item.id}/approve`
                : `/api/requests/${item.id}/approve`

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })

            const result = await res.json()

            if (result.success) {
                setItems(prev => prev.filter(i => i.id !== item.id))
                setTotal(prev => prev - 1)
            } else {
                setError(result.error || 'Gagal memproses')
            }
        } catch (err) {
            setError('Gagal memproses')
        } finally {
            setProcessing(null)
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    // Check if user has approval access
    const hasApprovalAccess = userRole && ['lead', 'hr', 'owner'].includes(userRole)

    if (!hasApprovalAccess && !loading) {
        return (
            <div className="flex flex-col gap-5 px-5 pt-5 pb-24">
                <Card>
                    <CardContent className="py-12 text-center">
                        <AlertCircle className="w-12 h-12 text-warning-text mx-auto mb-4" />
                        <p className="text-text-main font-medium">Akses Terbatas</p>
                        <p className="text-text-sub text-sm mt-1">
                            Halaman ini hanya untuk Lead, HR, atau Owner
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-5 px-5 pt-5 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-text-main">Approval</h1>
                    <p className="text-sm text-text-sub">
                        {activeTab === 'pending'
                            ? `${items.length} permintaan menunggu`
                            : `${total} riwayat approval`}
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-subtle">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${activeTab === 'pending'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-text-sub hover:text-text-main'
                        }`}
                >
                    Pending
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

            {/* Filter */}
            <FilterChips
                options={['all', 'requests', 'late']}
                selected={kindFilter}
                onChange={setKindFilter}
                labels={{ all: 'Semua', requests: 'Cuti/Lembur', late: 'Izin Telat' }}
            />

            {/* Search and Date Filter (history tab only) */}
            {activeTab === 'history' && (
                <>
                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-sub" />
                        <input
                            type="text"
                            placeholder="Cari nama karyawan..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-border-subtle rounded-lg 
                                       bg-bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                    </div>

                    {/* Date Filter */}
                    <DateRangeFilter
                        value={dateRange}
                        onChange={setDateRange}
                    />
                </>
            )}

            {/* Result summary */}
            {!loading && total > 0 && (
                <p className="text-xs text-text-sub">
                    Menampilkan {items.length} dari {total} riwayat
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
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : items.length === 0 ? (
                /* Empty State */
                <Card>
                    <CardContent className="py-12 text-center">
                        <Inbox className="w-12 h-12 text-text-sub mx-auto mb-4" />
                        <p className="text-text-main font-medium">
                            {activeTab === 'pending'
                                ? 'Tidak ada permintaan pending'
                                : 'Belum ada riwayat'}
                        </p>
                        <p className="text-text-sub text-sm mt-1">
                            {activeTab === 'pending'
                                ? 'Semua permintaan sudah diproses'
                                : 'Approval yang diproses akan muncul di sini'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                /* Items List */
                <div className="flex flex-col gap-3">
                    {items.map((item) => (
                        <Card key={item.id} variant="bordered">
                            <CardContent className="py-4">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <p className="font-medium text-text-main">
                                            {item.employee_name}
                                        </p>
                                        <p className="text-xs text-text-sub">
                                            {item.division_name || 'No Division'}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        {item.kind === 'late_permission' ? (
                                            <Badge variant="info">Izin Telat</Badge>
                                        ) : (
                                            <Badge variant={item.type === 'leave' ? 'warning' : 'info'}>
                                                {typeLabels[item.type || ''] || item.type}
                                            </Badge>
                                        )}
                                        {item.category && (
                                            <Badge variant="neutral">
                                                {categoryLabels[item.category] || item.category}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Details */}
                                <div className="flex flex-col gap-2 mb-4">
                                    <div className="flex items-center gap-2 text-sm text-text-sub">
                                        <Calendar className="w-4 h-4" />
                                        <span>
                                            {item.kind === 'late_permission'
                                                ? formatDate(item.date || item.created_at)
                                                : `${formatDate(item.start_date || '')}${item.end_date ? ` - ${formatDate(item.end_date)}` : ''}`
                                            }
                                        </span>
                                    </div>
                                    {item.max_check_in_time && (
                                        <div className="flex items-center gap-2 text-sm text-text-sub">
                                            <Clock className="w-4 h-4" />
                                            <span>Max check-in: {item.max_check_in_time}</span>
                                        </div>
                                    )}
                                    {item.project_name && (
                                        <div className="flex items-center gap-2 text-sm text-text-sub">
                                            <FileText className="w-4 h-4" />
                                            <span>{item.project_name}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Reason */}
                                <p className="text-sm text-text-main bg-bg-page p-3 rounded-lg mb-4">
                                    {item.reason}
                                </p>

                                {/* Status Badge + Actions */}
                                <div className="flex items-center justify-between">
                                    <Badge variant={statusVariants[item.status] || 'neutral'}>
                                        {statusLabels[item.status] || item.status}
                                    </Badge>

                                    {/* Actions - only for pending tab */}
                                    {activeTab === 'pending' && (
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleAction(item, 'rejected')}
                                                disabled={processing === item.id}
                                                icon={processing === item.id ? Loader2 : XCircle}
                                                className="text-danger-text"
                                            >
                                                Tolak
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleAction(item, 'approved')}
                                                disabled={processing === item.id}
                                                icon={processing === item.id ? Loader2 : CheckCircle2}
                                            >
                                                Setuju
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Pagination - only for history tab with many items */}
            {!loading && activeTab === 'history' && total > pageSize && (
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
