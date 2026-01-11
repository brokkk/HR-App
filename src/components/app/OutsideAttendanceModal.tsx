'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/Button'
import { X, MapPin, LogIn, LogOut, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react'

export interface DailyData {
    employee_id: string
    date: string
    check_in: string | null
    check_out: string | null
    late_minutes: number
    is_late: boolean
    is_penalized: boolean
    penalty_amount: number
    computed_at: string
}

interface OutsideStatus {
    hasInToday: boolean
    hasOutToday: boolean
}

interface Props {
    isOpen: boolean
    onClose: () => void
    onSuccess?: (dailyData: DailyData | null) => void
}

// Map RPC error messages to Indonesian
function mapErrorToIndonesian(message: string): string {
    if (message.includes('ALREADY_CHECKED_IN_TODAY')) {
        return 'Kamu sudah absen masuk hari ini.'
    }
    if (message.includes('CANNOT_CHECK_OUT_BEFORE_CHECK_IN')) {
        return 'Kamu belum absen masuk.'
    }
    if (message.includes('ALREADY_CHECKED_OUT_TODAY')) {
        return 'Kamu sudah absen pulang hari ini.'
    }
    if (message.includes('Too frequent')) {
        return 'Terlalu cepat, coba lagi sebentar.'
    }
    if (message.includes('Authentication')) {
        return 'Silakan login terlebih dahulu.'
    }
    if (message.includes('inactive')) {
        return 'Akun tidak aktif.'
    }
    return message || 'Gagal menyimpan absensi.'
}

export function OutsideAttendanceModal({ isOpen, onClose, onSuccess }: Props) {
    const [eventType, setEventType] = useState<'IN' | 'OUT'>('IN')
    const [note, setNote] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<OutsideStatus>({ hasInToday: false, hasOutToday: false })
    const [statusLoading, setStatusLoading] = useState(false)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Fetch today's outside status when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchTodayStatus()
            // Lock body scroll
            document.body.style.overflow = 'hidden'
        } else {
            // Restore body scroll
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    const fetchTodayStatus = async () => {
        setStatusLoading(true)
        try {
            // Get today's date in WIB (server will use its own, but we need a rough check)
            const now = new Date()
            const wibOffset = 7 * 60 // UTC+7
            const utcOffset = now.getTimezoneOffset()
            const wibTime = new Date(now.getTime() + (wibOffset + utcOffset) * 60 * 1000)
            const todayWIB = wibTime.toISOString().split('T')[0]

            // Query attendance_logs for today's outside entries
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('event_type')
                .eq('source', 'outside')
                .gte('ts', `${todayWIB}T00:00:00+07:00`)
                .lt('ts', `${todayWIB}T23:59:59+07:00`)

            const hasIn = logs?.some(l => l.event_type === 'IN') ?? false
            const hasOut = logs?.some(l => l.event_type === 'OUT') ?? false

            setStatus({ hasInToday: hasIn, hasOutToday: hasOut })

            // Auto-select appropriate event type
            if (!hasIn) {
                setEventType('IN')
            } else if (!hasOut) {
                setEventType('OUT')
            }
        } catch (err) {
            console.error('Failed to fetch status:', err)
        } finally {
            setStatusLoading(false)
        }
    }

    const handleSubmit = async () => {
        setLoading(true)
        setError(null)

        try {
            // Step 1: Submit attendance
            const { error: rpcError } = await supabase.rpc('submit_outside_attendance', {
                p_event_type: eventType,
                p_note: note,
                p_client_ts: new Date().toISOString(),
                p_meta: {},
            })

            if (rpcError) {
                setError(mapErrorToIndonesian(rpcError.message))
                return
            }

            // Step 2: Recompute daily attendance
            const { data: dailyData, error: recomputeError } = await supabase.rpc('recompute_my_attendance_today')

            if (recomputeError) {
                console.warn('Recompute warning:', recomputeError.message)
                // Don't fail - attendance was saved, recompute is optional
            }

            setSuccess(true)
            setTimeout(() => {
                onSuccess?.(dailyData as DailyData | null)
                handleClose()
            }, 1500)

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        setEventType('IN')
        setNote('')
        setError(null)
        setSuccess(false)
        setStatus({ hasInToday: false, hasOutToday: false })
        onClose()
    }

    if (!isOpen) return null

    const allDone = status.hasInToday && status.hasOutToday
    const canCheckIn = !status.hasInToday
    const canCheckOut = status.hasInToday && !status.hasOutToday

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md my-auto bg-bg-surface rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="font-bold text-text-main">Absen Luar Kantor</h2>
                            <p className="text-xs text-text-sub">Outside attendance</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-bg-page rounded-full transition-colors">
                        <X className="w-5 h-5 text-text-sub" />
                    </button>
                </div>

                {/* No Penalty Disclaimer */}
                <div className="flex items-start gap-2 p-3 bg-info-bg rounded-xl mb-5">
                    <Info className="w-4 h-4 text-info-text shrink-0 mt-0.5" />
                    <p className="text-sm text-info-text">
                        Absen luar kantor tidak dikenakan denda keterlambatan.
                    </p>
                </div>

                {/* Loading Status */}
                {statusLoading ? (
                    <div className="py-8 text-center">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                        <p className="text-sm text-text-sub">Memuat status...</p>
                    </div>
                ) : success ? (
                    /* Success State */
                    <div className="py-8 text-center">
                        <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-success-text" />
                        </div>
                        <h3 className="font-bold text-text-main">Berhasil!</h3>
                        <p className="text-sm text-text-sub mt-1">Absensi {eventType === 'IN' ? 'masuk' : 'keluar'} tercatat.</p>
                    </div>
                ) : allDone ? (
                    /* All Done State */
                    <div className="py-8 text-center">
                        <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-success-text" />
                        </div>
                        <h3 className="font-bold text-text-main">Sudah Absen Hari Ini</h3>
                        <p className="text-sm text-text-sub mt-1">Kamu sudah absen masuk dan pulang.</p>
                    </div>
                ) : (
                    <>
                        {/* Event Type Selector */}
                        <div className="mb-5">
                            <label className="text-sm font-medium text-text-main mb-3 block">Jenis Absen</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => canCheckIn && setEventType('IN')}
                                    disabled={!canCheckIn}
                                    className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${!canCheckIn
                                        ? 'border-border-subtle bg-bg-page text-text-sub opacity-50 cursor-not-allowed'
                                        : eventType === 'IN'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border-subtle text-text-sub hover:border-primary/50'
                                        }`}
                                >
                                    <LogIn className="w-5 h-5" />
                                    <span className="font-semibold">Masuk (IN)</span>
                                    {status.hasInToday && <CheckCircle className="w-4 h-4 text-success-text" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => canCheckOut && setEventType('OUT')}
                                    disabled={!canCheckOut}
                                    className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${!canCheckOut
                                        ? 'border-border-subtle bg-bg-page text-text-sub opacity-50 cursor-not-allowed'
                                        : eventType === 'OUT'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border-subtle text-text-sub hover:border-primary/50'
                                        }`}
                                >
                                    <LogOut className="w-5 h-5" />
                                    <span className="font-semibold">Keluar (OUT)</span>
                                    {status.hasOutToday && <CheckCircle className="w-4 h-4 text-success-text" />}
                                </button>
                            </div>
                        </div>

                        {/* Note Input */}
                        <div className="mb-5">
                            <label className="text-sm font-medium text-text-main mb-2 block">Catatan (opsional)</label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Contoh: Meeting dengan klien di lokasi proyek"
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

                        {/* Submit Button */}
                        <Button
                            onClick={handleSubmit}
                            disabled={loading || (!canCheckIn && !canCheckOut)}
                            className={`w-full ${loading ? 'animate-pulse' : ''}`}
                            icon={loading ? Loader2 : MapPin}
                        >
                            {loading ? 'Menyimpan...' : `Simpan Absen ${eventType === 'IN' ? 'Masuk' : 'Keluar'}`}
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}
