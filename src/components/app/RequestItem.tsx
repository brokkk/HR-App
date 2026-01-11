import { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface RequestItemProps {
    type: string
    typeIcon: LucideIcon
    iconBgColor?: string
    iconColor?: string
    dateRange: string
    status: 'pending' | 'approved' | 'rejected'
    onClick?: () => void
}

const statusConfig = {
    pending: { variant: 'warning' as const, label: 'Pending' },
    approved: { variant: 'success' as const, label: 'Approved' },
    rejected: { variant: 'danger' as const, label: 'Rejected' },
}

export function RequestItem({
    type,
    typeIcon: TypeIcon,
    iconBgColor = 'bg-purple-50',
    iconColor = 'text-purple-600',
    dateRange,
    status,
    onClick,
}: RequestItemProps) {
    const statusInfo = statusConfig[status]

    return (
        <button
            onClick={onClick}
            className="group flex w-full items-center justify-between rounded-[20px] border border-border-subtle bg-bg-surface p-4 shadow-soft transition hover:shadow-md text-left"
        >
            <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBgColor} ${iconColor}`}>
                    <TypeIcon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-sm font-bold text-text-main">{type}</p>
                    <p className="text-xs text-text-sub">{dateRange}</p>
                </div>
            </div>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </button>
    )
}
