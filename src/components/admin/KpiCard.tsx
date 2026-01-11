import { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface KpiCardProps {
    title: string
    value: string | number
    subtitle?: string
    icon: LucideIcon
    iconBgColor?: string
    iconColor?: string
    badge?: {
        text: string
        variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
    }
}

export function KpiCard({
    title,
    value,
    subtitle,
    icon: Icon,
    iconBgColor = 'bg-blue-50',
    iconColor = 'text-primary',
    badge,
}: KpiCardProps) {
    return (
        <div className="bg-bg-surface p-6 rounded-2xl border border-border-subtle shadow-soft hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-xl ${iconBgColor} ${iconColor}`}>
                    <Icon className="w-6 h-6" />
                </div>
                {badge && <Badge variant={badge.variant}>{badge.text}</Badge>}
            </div>
            <p className="text-text-sub text-sm font-medium">{title}</p>
            <p className="text-3xl font-bold text-text-main mt-1">{value}</p>
            {subtitle && <p className="text-xs text-text-sub mt-2">{subtitle}</p>}
        </div>
    )
}
