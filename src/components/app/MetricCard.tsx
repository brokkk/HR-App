import { LucideIcon } from 'lucide-react'

interface MetricCardProps {
    title: string
    value: string
    subtitle?: string
    icon: LucideIcon
    iconBgColor?: string
    iconColor?: string
    badge?: {
        text: string
        color: string
    }
}

export function MetricCard({
    title,
    value,
    subtitle,
    icon: Icon,
    iconBgColor = 'bg-blue-50',
    iconColor = 'text-primary',
    badge,
}: MetricCardProps) {
    return (
        <div className="flex flex-col justify-center gap-1 rounded-[24px] border border-border-subtle bg-bg-surface p-5 shadow-soft">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full ${iconBgColor} ${iconColor}`}>
                <Icon className="w-[18px] h-[18px]" />
            </div>
            <p className="text-xs text-text-sub">{title}</p>
            <p className="text-xl font-bold text-text-main">{value}</p>
            {badge && (
                <div className={`mt-1 inline-flex w-fit items-center rounded px-2 py-0.5 text-[10px] font-bold ${badge.color}`}>
                    {badge.text}
                </div>
            )}
            {subtitle && !badge && <p className="mt-1 text-[10px] font-medium text-text-sub">{subtitle}</p>}
        </div>
    )
}
