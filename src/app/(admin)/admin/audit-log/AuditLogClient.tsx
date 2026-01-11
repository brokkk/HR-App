'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Search, Filter, Loader2, AlertCircle, Inbox, ChevronDown, ChevronUp, Copy, ChevronLeft, ChevronRight } from 'lucide-react'

interface AuditLogItem {
    id: string
    created_at: string
    actor_id: string | null
    actor_name: string | null
    action: string
    entity: string
    entity_id: string | null
    meta: Record<string, unknown>
}

interface ApiResponse {
    success: boolean
    range?: { start: string; end: string }
    page?: number
    pageSize?: number
    total?: number
    items?: AuditLogItem[]
    error?: string
}

const ENTITY_OPTIONS = [
    { value: 'all', label: 'All Entities' },
    { value: 'employees', label: 'Employees' },
    { value: 'divisions', label: 'Divisions' },
    { value: 'requests', label: 'Requests' },
    { value: 'overtime_meal_claims', label: 'Meal Claims' },
    { value: 'attendance_import_batches', label: 'Attendance' },
]

function getTodayWIB(): string {
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    return wibTime.toISOString().split('T')[0]
}

function getDaysAgoWIB(days: number): string {
    const now = new Date()
    const wibOffset = 7 * 60
    const utcOffset = now.getTimezoneOffset()
    const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
    wibTime.setDate(wibTime.getDate() - days)
    return wibTime.toISOString().split('T')[0]
}

function formatWIBTime(isoString: string): string {
    const date = new Date(isoString)
    return date.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function getActionBadgeVariant(action: string): 'success' | 'warning' | 'danger' | 'neutral' {
    if (action.includes('approved') || action.includes('created')) return 'success'
    if (action.includes('rejected') || action.includes('deleted')) return 'danger'
    if (action.includes('updated') || action.includes('changed')) return 'warning'
    return 'neutral'
}

function MetaViewer({ meta }: { meta: Record<string, unknown> }) {
    const [expanded, setExpanded] = useState(false)

    if (!meta || Object.keys(meta).length === 0) {
        return <span className="text-text-sub text-xs">—</span>
    }

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? 'Hide' : 'View'}
            </button>
            {expanded && (
                <pre className="mt-2 p-2 bg-bg-page rounded text-xs overflow-auto max-w-xs max-h-32">
                    {JSON.stringify(meta, null, 2)}
                </pre>
            )}
        </div>
    )
}

export function AuditLogClient() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // URL params
    const [startDate, setStartDate] = useState(searchParams.get('start') || getDaysAgoWIB(7))
    const [endDate, setEndDate] = useState(searchParams.get('end') || getTodayWIB())
    const [entity, setEntity] = useState(searchParams.get('entity') || 'all')
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')

    // Pagination
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const [page, setPage] = useState(pageParam)
    const pageSize = 50
    const [total, setTotal] = useState(0)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [items, setItems] = useState<AuditLogItem[]>([])
    const [range, setRange] = useState<{ start: string; end: string } | null>(null)

    const totalPages = Math.ceil(total / pageSize) || 1

    const fetchData = useCallback(async (fetchPage: number) => {
        setLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            params.set('start', startDate)
            params.set('end', endDate)
            params.set('page', String(fetchPage))
            params.set('pageSize', String(pageSize))
            if (entity !== 'all') params.set('entity', entity)
            if (searchQuery) params.set('q', searchQuery)

            const res = await fetch(`/api/admin/audit-logs?${params}`)
            const data: ApiResponse = await res.json()

            if (data.success) {
                setItems(data.items || [])
                setTotal(data.total || 0)
                setRange(data.range || null)
            } else {
                setError(data.error || 'Failed to fetch logs')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch')
        } finally {
            setLoading(false)
        }
    }, [startDate, endDate, entity, searchQuery, pageSize])

    // Update URL
    const updateUrl = useCallback((newPage: number, resetPage = false) => {
        const params = new URLSearchParams()
        params.set('start', startDate)
        params.set('end', endDate)
        params.set('page', String(resetPage ? 1 : newPage))
        if (entity !== 'all') params.set('entity', entity)
        if (searchQuery) params.set('q', searchQuery)
        router.push(`/admin/audit-log?${params}`)
    }, [router, startDate, endDate, entity, searchQuery])

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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
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
                        <div>
                            <label className="block text-sm font-medium text-text-sub mb-1">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-sub mb-1">End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-sub mb-1">Entity</label>
                            <select
                                value={entity}
                                onChange={(e) => setEntity(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {ENTITY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium text-text-sub mb-1">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-sub" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                                    placeholder="Search by action..."
                                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-main text-sm placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20"
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

            {/* Results */}
            <Card variant="bordered">
                <CardHeader
                    title="Audit Logs"
                    subtitle={range ? `${range.start} to ${range.end}` : undefined}
                />
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 p-4 bg-danger-bg rounded-xl">
                            <AlertCircle className="w-5 h-5 text-danger-text" />
                            <p className="text-sm text-danger-text">{error}</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Inbox className="w-12 h-12 text-text-sub mb-2" />
                            <p className="text-text-sub">No audit logs found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border-subtle">
                                        <th className="text-left py-3 px-2 font-medium text-text-sub">Time</th>
                                        <th className="text-left py-3 px-2 font-medium text-text-sub">Actor</th>
                                        <th className="text-left py-3 px-2 font-medium text-text-sub">Action</th>
                                        <th className="text-left py-3 px-2 font-medium text-text-sub">Entity</th>
                                        <th className="text-left py-3 px-2 font-medium text-text-sub">Entity ID</th>
                                        <th className="text-left py-3 px-2 font-medium text-text-sub">Meta</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item) => (
                                        <tr key={item.id} className="border-b border-border-subtle hover:bg-bg-page/50">
                                            <td className="py-3 px-2 text-text-main whitespace-nowrap">
                                                {formatWIBTime(item.created_at)}
                                            </td>
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-2">
                                                    <Avatar name={item.actor_name || 'S'} size="sm" />
                                                    <span className="text-text-main">{item.actor_name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2">
                                                <Badge variant={getActionBadgeVariant(item.action)}>
                                                    {item.action}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-2 text-text-sub">
                                                {item.entity}
                                            </td>
                                            <td className="py-3 px-2">
                                                {item.entity_id ? (
                                                    <div className="flex items-center gap-1">
                                                        <code className="text-xs bg-bg-page px-1 rounded">
                                                            {item.entity_id.slice(0, 8)}...
                                                        </code>
                                                        <button
                                                            onClick={() => copyToClipboard(item.entity_id!)}
                                                            className="p-1 hover:bg-bg-page rounded"
                                                            title="Copy full ID"
                                                        >
                                                            <Copy className="w-3 h-3 text-text-sub" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-text-sub">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-2">
                                                <MetaViewer meta={item.meta} />
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
    )
}
