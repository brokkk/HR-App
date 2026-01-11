'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/Button'
import { X, Loader2, CheckCircle, AlertCircle, Edit3 } from 'lucide-react'

interface Props {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
    employeeId: string
    employeeName: string
    date: string // YYYY-MM-DD
    currentCheckIn?: string | null
    currentCheckOut?: string | null
}

function formatDatetimeLocal(isoString: string | null | undefined): string {
    if (!isoString) return ''
    try {
        // Convert to WIB for display
        const date = new Date(isoString)
        const wibOffset = 7 * 60 // minutes
        const wibDate = new Date(date.getTime() + wibOffset * 60 * 1000)
        return wibDate.toISOString().slice(0, 16)
    } catch {
        return ''
    }
}

function toTimestamptz(datetimeLocal: string): string | null {
    if (!datetimeLocal) return null
    // datetime-local is in local time, we assume WIB (UTC+7)
    // Convert to ISO with timezone
    const date = new Date(datetimeLocal + ':00+07:00')
    return date.toISOString()
}

export function AttendanceFixModal({
    isOpen,
    onClose,
    onSuccess,
    employeeId,
    employeeName,
    date,
    currentCheckIn,
    currentCheckOut,
}: Props) {
    const [checkIn, setCheckIn] = useState(formatDatetimeLocal(currentCheckIn))
    const [checkOut, setCheckOut] = useState(formatDatetimeLocal(currentCheckOut))
    const [note, setNote] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const handleSubmit = async () => {
        // At least one value should be provided
        if (!checkIn && !checkOut) {
            setError('Isi minimal salah satu waktu (Check In atau Check Out)')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const { data, error: rpcError } = await supabase.rpc('submit_manual_attendance_fix', {
                p_employee_id: employeeId,
                p_date: date,
                p_check_in: toTimestamptz(checkIn),
                p_check_out: toTimestamptz(checkOut),
                p_note: note,
            })

            if (rpcError) {
                if (rpcError.message.includes('Permission denied')) {
                    setError('Akses ditolak. Hanya HR/Owner yang dapat memperbaiki absensi.')
                } else {
                    setError(rpcError.message || 'Gagal menyimpan perbaikan.')
                }
                return
            }

            setSuccess(true)
            setTimeout(() => {
                onSuccess?.()
                handleClose()
            }, 1500)

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setCheckIn(formatDatetimeLocal(currentCheckIn))
        setCheckOut(formatDatetimeLocal(currentCheckOut))
        setNote('')
        setError(null)
        setSuccess(false)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-bg-surface rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Edit3 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="font-bold text-text-main">Perbaiki Absensi</h2>
                            <p className="text-xs text-text-sub">Manual attendance fix</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-bg-page rounded-full transition-colors">
                        <X className="w-5 h-5 text-text-sub" />
                    </button>
                </div>

                {/* Success State */}
                {success ? (
                    <div className="py-8 text-center">
                        <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-success-text" />
                        </div>
                        <h3 className="font-bold text-text-main">Berhasil!</h3>
                        <p className="text-sm text-text-sub mt-1">Absensi telah diperbaiki.</p>
                    </div>
                ) : (
                    <>
                        {/* Employee Info */}
                        <div className="mb-5 p-3 bg-bg-page rounded-xl">
                            <div className="text-sm">
                                <span className="text-text-sub">Karyawan: </span>
                                <span className="font-medium text-text-main">{employeeName}</span>
                            </div>
                            <div className="text-sm mt-1">
                                <span className="text-text-sub">Tanggal: </span>
                                <span className="font-medium text-text-main">{date}</span>
                            </div>
                        </div>

                        {/* Check In */}
                        <div className="mb-4">
                            <label className="text-sm font-medium text-text-main mb-2 block">
                                Check In (WIB)
                            </label>
                            <input
                                type="datetime-local"
                                value={checkIn}
                                onChange={(e) => setCheckIn(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>

                        {/* Check Out */}
                        <div className="mb-4">
                            <label className="text-sm font-medium text-text-main mb-2 block">
                                Check Out (WIB)
                            </label>
                            <input
                                type="datetime-local"
                                value={checkOut}
                                onChange={(e) => setCheckOut(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>

                        {/* Note */}
                        <div className="mb-5">
                            <label className="text-sm font-medium text-text-main mb-2 block">
                                Catatan (opsional)
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Alasan perbaikan..."
                                className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-bg-surface text-text-main placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                                rows={2}
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-danger-bg rounded-xl mb-4">
                                <AlertCircle className="w-4 h-4 text-danger-text shrink-0" />
                                <p className="text-sm text-danger-text">{error}</p>
                            </div>
                        )}

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                onClick={handleClose}
                                className="flex-1"
                            >
                                Batal
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={loading}
                                className={`flex-1 ${loading ? 'animate-pulse' : ''}`}
                                icon={loading ? Loader2 : Edit3}
                            >
                                {loading ? 'Menyimpan...' : 'Simpan'}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
