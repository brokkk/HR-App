'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, Clock, Loader2, CheckCircle, AlertCircle, Upload, CloudRain, AlertTriangle, Coffee } from 'lucide-react'
import Link from 'next/link'

type Category = 'urgent' | 'hujan' | 'habis_lembur'

interface CategoryOption {
    value: Category
    label: string
    icon: typeof Clock
    maxTime: string
    description: string
}

const CATEGORIES: CategoryOption[] = [
    {
        value: 'urgent',
        label: 'Urgent',
        icon: AlertTriangle,
        maxTime: '12:00',
        description: 'Macet, ban bocor, antar anak, klinik, dll',
    },
    {
        value: 'hujan',
        label: 'Hujan Deras',
        icon: CloudRain,
        maxTime: '10:00',
        description: 'Max check-in 10:00 WIB',
    },
    {
        value: 'habis_lembur',
        label: 'Habis Lembur',
        icon: Coffee,
        maxTime: '11:00',
        description: 'Max check-in 11:00 WIB (lembur kemarin)',
    },
]

export default function NewLatePermissionPage() {
    const router = useRouter()
    const [category, setCategory] = useState<Category | ''>('')
    const [maxTime, setMaxTime] = useState('')
    const [reason, setReason] = useState('')
    const [proofFile, setProofFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const selectedCategory = CATEGORIES.find(c => c.value === category)

    // Get today's date in WIB for display
    const today = new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    })

    // Set default max time when category changes
    const handleCategoryChange = (cat: Category) => {
        setCategory(cat)
        const catOption = CATEGORIES.find(c => c.value === cat)
        if (catOption) {
            setMaxTime(catOption.maxTime)
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                setError('File terlalu besar (max 5MB)')
                return
            }
            setProofFile(file)
            setError(null)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!category || !maxTime || !reason) {
            setError('Semua field wajib diisi')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append('category', category)
            formData.append('max_time', maxTime)
            formData.append('reason', reason)
            if (proofFile) {
                formData.append('proof', proofFile)
            }

            const res = await fetch('/api/late-permissions', {
                method: 'POST',
                body: formData,
            })
            const result = await res.json()

            if (result.success) {
                setSuccess(true)
                setTimeout(() => router.push('/requests'), 1500)
            } else {
                setError(result.error || 'Gagal membuat izin telat')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-success-text" />
                </div>
                <h2 className="text-xl font-bold text-text-main">Izin Telat Diajukan!</h2>
                <p className="text-text-sub text-center">Menunggu approval Lead...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/home">
                    <Button variant="ghost" size="icon" icon={ChevronLeft} />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-text-main">Izin Datang Telat</h1>
                    <p className="text-sm text-text-sub">Perlu approval Lead → COO</p>
                </div>
            </div>

            {/* Info Banner */}
            <div className="p-4 bg-info-bg rounded-xl">
                <p className="text-sm text-info-text">
                    ℹ️ Izin telat memerlukan approval dari Lead divisi, kemudian COO. Penalti akan dihapus jika check-in sebelum waktu max yang dipilih setelah disetujui.
                </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
                <Card variant="bordered">
                    <CardHeader title="Detail Izin" />
                    <CardContent>
                        <div className="flex flex-col gap-5">
                            {/* Date - Read Only */}
                            <div>
                                <label className="text-sm font-medium text-text-main mb-2 block">
                                    Tanggal
                                </label>
                                <div className="p-4 bg-bg-page rounded-xl text-text-main font-medium">
                                    📅 Hari ini — {today}
                                </div>
                                <p className="text-xs text-text-sub mt-1">
                                    Izin telat hanya bisa diajukan untuk hari ini
                                </p>
                            </div>

                            {/* Category Selector */}
                            <div>
                                <label className="text-sm font-medium text-text-main mb-2 block">
                                    Kategori <span className="text-danger-text">*</span>
                                </label>
                                <div className="grid gap-3">
                                    {CATEGORIES.map((cat) => {
                                        const Icon = cat.icon
                                        return (
                                            <button
                                                key={cat.value}
                                                type="button"
                                                onClick={() => handleCategoryChange(cat.value)}
                                                className={`p-4 rounded-xl border-2 transition-colors text-left ${category === cat.value
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-border-subtle hover:border-primary/50'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <Icon className={`w-5 h-5 mt-0.5 ${category === cat.value ? 'text-primary' : 'text-text-sub'}`} />
                                                    <div>
                                                        <p className={`font-medium ${category === cat.value ? 'text-primary' : 'text-text-main'}`}>
                                                            {cat.label}
                                                        </p>
                                                        <p className="text-xs text-text-sub mt-0.5">{cat.description}</p>
                                                    </div>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Max Time */}
                            {category && (
                                <div>
                                    <label className="text-sm font-medium text-text-main mb-2 block">
                                        Jam Masuk Paling Lambat <span className="text-danger-text">*</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="time"
                                            value={maxTime}
                                            onChange={(e) => setMaxTime(e.target.value)}
                                            max={selectedCategory?.maxTime}
                                            className="flex-1 px-4 py-3 rounded-xl border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            required
                                        />
                                        <span className="text-sm text-text-sub">WIB</span>
                                    </div>
                                    {selectedCategory && (
                                        <p className="text-xs text-text-sub mt-1">
                                            Maksimum untuk {selectedCategory.label}: {selectedCategory.maxTime} WIB
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Reason */}
                            <div>
                                <label className="text-sm font-medium text-text-main mb-2 block">
                                    Alasan <span className="text-danger-text">*</span>
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Jelaskan alasan izin telat..."
                                    className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-bg-surface text-text-main placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                                    rows={3}
                                    required
                                />
                            </div>

                            {/* Proof Upload (Optional) */}
                            <div>
                                <label className="text-sm font-medium text-text-main mb-2 block">
                                    Bukti Foto (Opsional)
                                </label>
                                <div className="flex items-center gap-3">
                                    <label className="flex-1 p-4 border-2 border-dashed border-border-subtle rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Upload className="w-5 h-5 text-text-sub" />
                                            <span className="text-sm text-text-sub">
                                                {proofFile ? proofFile.name : 'Upload foto bukti (max 5MB)'}
                                            </span>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </label>
                                    {proofFile && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setProofFile(null)}
                                        >
                                            ✕
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-danger-bg rounded-xl">
                                    <AlertCircle className="w-4 h-4 text-danger-text flex-shrink-0" />
                                    <p className="text-sm text-danger-text">{error}</p>
                                </div>
                            )}

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={loading || !category || !maxTime || !reason}
                                icon={loading ? Loader2 : Clock}
                                className={loading ? 'animate-pulse' : ''}
                            >
                                {loading ? 'Mengajukan...' : 'Ajukan Izin Telat'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    )
}
