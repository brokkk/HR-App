import { Calendar, Zap } from 'lucide-react'

interface StatCardProps {
    date: string
    title: string
    value: string
    period?: string
    subtitle?: string
}

export function StatCard({ date, title, value, period = 'AM', subtitle }: StatCardProps) {
    return (
        <div className="relative w-full overflow-hidden rounded-[24px] gradient-primary p-6 text-white shadow-xl">
            {/* Decorative Circles */}
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/10 blur-xl" />

            <div className="relative flex flex-col items-start justify-between gap-6">
                <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
                        <Calendar className="w-4 h-4" />
                        <span className="text-xs font-semibold">{date}</span>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-lime shadow-lg">
                        <Zap className="w-5 h-5 text-text-main" />
                    </div>
                </div>
                <div>
                    <p className="text-sm font-medium text-blue-100">{title}</p>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-5xl font-bold tracking-tight">{value}</h2>
                        <span className="text-lg font-medium text-blue-100">{period}</span>
                    </div>
                    {subtitle && <p className="mt-1 text-sm text-blue-100 opacity-90">{subtitle}</p>}
                </div>
            </div>
        </div>
    )
}
