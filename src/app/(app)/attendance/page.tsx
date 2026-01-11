import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Calendar, AlertCircle, MapPin, Fingerprint, Upload, Edit } from 'lucide-react'
import { getMyAttendance } from '@/lib/supabase/queries'
import { format, parseISO } from 'date-fns'

function formatTime(timestamp: string | null): string {
    if (!timestamp) return '--:--'
    try {
        return format(parseISO(timestamp), 'HH:mm')
    } catch {
        return '--:--'
    }
}

function formatDate(dateStr: string): string {
    try {
        return format(parseISO(dateStr), 'MMM dd, EEE')
    } catch {
        return dateStr
    }
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(amount)
}

type SourceType = 'fingerprint' | 'outside' | 'manual' | 'import' | null

function SourceBadge({ source }: { source: SourceType }) {
    if (!source) return null

    const config: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'info'; icon: typeof MapPin }> = {
        fingerprint: { label: 'Fingerprint', variant: 'neutral', icon: Fingerprint },
        outside: { label: 'Luar', variant: 'info', icon: MapPin },
        import: { label: 'Import', variant: 'warning', icon: Upload },
        manual: { label: 'Manual', variant: 'neutral', icon: Edit },
    }

    const cfg = config[source]
    if (!cfg) return null

    const Icon = cfg.icon

    return (
        <Badge variant={cfg.variant} className="text-xs gap-1">
            <Icon className="w-3 h-3" />
            {cfg.label}
        </Badge>
    )
}

export default async function AttendancePage() {
    const { data: attendance, error } = await getMyAttendance(30)

    // Error state (RLS or other)
    if (error) {
        return (
            <div className="px-6 py-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-danger-bg rounded-full flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-danger-text" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-text-main">Attendance History</h1>
                        <p className="text-sm text-danger-text">Access restricted</p>
                    </div>
                </div>
                <Card variant="bordered" className="p-6 text-center">
                    <p className="text-text-sub">Unable to load attendance data.</p>
                    <p className="text-xs text-text-sub mt-1">{error}</p>
                </Card>
            </div>
        )
    }

    // Empty state
    if (attendance.length === 0) {
        return (
            <div className="px-6 py-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-text-main">Attendance History</h1>
                        <p className="text-sm text-text-sub">Your check-in/out records</p>
                    </div>
                </div>
                <Card variant="bordered" className="p-12 text-center">
                    <div className="mx-auto w-16 h-16 bg-bg-page rounded-full flex items-center justify-center mb-4">
                        <Calendar className="w-8 h-8 text-text-sub" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-main">No attendance records yet</h3>
                    <p className="text-text-sub mt-2">Your attendance will appear here after check-in</p>
                </Card>
            </div>
        )
    }

    // Data state
    return (
        <div className="px-6 py-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-text-main">Attendance History</h1>
                    <p className="text-sm text-text-sub">Last {attendance.length} records</p>
                </div>
            </div>

            <div className="space-y-3">
                {attendance.map((day) => (
                    <Card key={day.id} variant="bordered" className="p-4">
                        <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-text-main text-sm">{formatDate(day.date)}</h4>
                                <SourceBadge source={day.check_in_source} />
                            </div>
                            {day.is_late && day.late_minutes > 0 && (
                                <Badge variant={day.is_penalized ? 'danger' : 'warning'}>
                                    Late: {day.late_minutes} min
                                </Badge>
                            )}
                            {!day.is_late && <Badge variant="success">On-time</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-bg-page rounded-2xl p-3 text-center">
                                <span className="text-text-sub text-xs">Check In</span>
                                <p className="text-text-main font-bold text-lg">{formatTime(day.check_in)}</p>
                            </div>
                            <div className="bg-bg-page rounded-2xl p-3 text-center">
                                <span className="text-text-sub text-xs">Check Out</span>
                                <p className="text-text-main font-bold text-lg">{formatTime(day.check_out)}</p>
                            </div>
                        </div>
                        {day.is_penalized && day.penalty_amount > 0 && (
                            <div className="mt-3 pt-3 border-t border-border-subtle flex justify-between text-sm">
                                <span className="text-text-sub">Penalty</span>
                                <span className="text-danger-text font-medium">{formatCurrency(day.penalty_amount)}</span>
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    )
}
