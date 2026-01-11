'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { FilterChips } from '@/components/app/FilterChips'
import { Clock, Search, Loader2, AlertCircle, Image, ExternalLink, Coffee } from 'lucide-react'
import type { AdminLatePermission } from '@/app/api/admin/late-permissions/route'

const categoryFilters = ['All', 'urgent', 'hujan', 'habis_lembur']

const categoryLabels: Record<string, string> = {
    urgent: 'Urgent',
    hujan: 'Hujan Deras',
    habis_lembur: 'Habis Lembur',
}

const categoryVariants: Record<string, 'warning' | 'info' | 'neutral'> = {
    urgent: 'warning',
    hujan: 'info',
    habis_lembur: 'neutral',
}

export function LatePermissionsClient() {
    const [items, setItems] = useState<AdminLatePermission[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [categoryFilter, setCategoryFilter] = useState('All')
    const [search, setSearch] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    useEffect(() => {
        fetchData()
    }, [categoryFilter, startDate, endDate])

    const fetchData = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (categoryFilter !== 'All') params.set('category', categoryFilter)
            if (startDate) params.set('start', startDate)
            if (endDate) params.set('end', endDate)
            if (search) params.set('q', search)

            const res = await fetch(`/api/admin/late-permissions?${params}`)
            const result = await res.json()

            if (result.success) {
                setItems(result.items || [])
            } else {
                setError(result.error)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch')
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = () => {
        fetchData()
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    const formatTime = (time: string) => {
        // Time is in HH:MM:SS format, return HH:MM
        return time.slice(0, 5)
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-text-main">Izin Telat</h1>
                <p className="text-sm text-text-sub">Daftar izin datang telat karyawan</p>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4">
                <FilterChips
                    options={categoryFilters}
                    selected={categoryFilter}
                    onChange={setCategoryFilter}
                />

                <div className="flex gap-3">
                    <div className="flex-1">
                        <Input
                            placeholder="Cari nama atau alasan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <Button variant="secondary" icon={Search} onClick={handleSearch}>
                        Cari
                    </Button>
                </div>

                <div className="flex gap-3">
                    <Input
                        type="date"
                        label="Dari"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <Input
                        type="date"
                        label="Sampai"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
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
            {loading && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            {/* Empty */}
            {!loading && !error && items.length === 0 && (
                <Card variant="bordered">
                    <CardContent className="py-12 text-center">
                        <Clock className="w-12 h-12 text-text-sub mx-auto mb-4" />
                        <p className="text-text-main font-medium">Tidak ada izin telat</p>
                        <p className="text-sm text-text-sub mt-1">Coba ubah filter</p>
                    </CardContent>
                </Card>
            )}

            {/* List */}
            {!loading && items.length > 0 && (
                <div className="flex flex-col gap-3">
                    {items.map((item) => (
                        <Card key={item.id} variant="bordered">
                            <CardContent className="py-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        {/* Name + Division */}
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-text-main">{item.employee_name}</span>
                                            {item.division_name && (
                                                <span className="text-xs text-text-sub">• {item.division_name}</span>
                                            )}
                                        </div>

                                        {/* Badges */}
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <Badge variant={categoryVariants[item.category] || 'neutral'}>
                                                {categoryLabels[item.category] || item.category}
                                            </Badge>
                                            <Badge variant="success">
                                                Max {formatTime(item.max_check_in_time)} WIB
                                            </Badge>
                                            {item.has_overtime_yesterday && (
                                                <Badge variant="info">
                                                    <Coffee className="w-3 h-3 mr-1" />
                                                    Lembur Kemarin
                                                </Badge>
                                            )}
                                            {item.proof_url && (
                                                <Badge variant="neutral">
                                                    <Image className="w-3 h-3 mr-1" />
                                                    Bukti
                                                </Badge>
                                            )}
                                        </div>

                                        {/* Reason */}
                                        <p className="text-sm text-text-sub">{item.reason}</p>

                                        {/* Date */}
                                        <p className="text-xs text-text-sub mt-2">
                                            Tanggal: {formatDate(item.date)}
                                        </p>
                                    </div>

                                    {/* Proof Link */}
                                    {item.proof_url && (
                                        <a
                                            href={item.proof_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="shrink-0"
                                        >
                                            <Button variant="ghost" size="sm" icon={ExternalLink}>
                                                Lihat
                                            </Button>
                                        </a>
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
