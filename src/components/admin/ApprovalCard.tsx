import { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ApprovalCardProps {
    type: string
    typeIcon: LucideIcon
    iconBgColor?: string
    iconColor?: string
    status: string
    description: string
    showActions?: boolean
    onApprove?: () => void
    onReject?: () => void
}

export function ApprovalCard({
    type,
    typeIcon: TypeIcon,
    iconBgColor = 'bg-blue-100',
    iconColor = 'text-primary',
    status,
    description,
    showActions = true,
    onApprove,
    onReject,
}: ApprovalCardProps) {
    return (
        <div className="p-4 rounded-xl border border-border-subtle hover:border-primary/30 bg-bg-page/30 hover:bg-bg-surface hover:shadow-sm transition-all cursor-pointer group">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${iconBgColor} ${iconColor}`}>
                        <TypeIcon className="w-[18px] h-[18px]" />
                    </div>
                    <span className="text-sm font-bold text-text-main">{type}</span>
                </div>
                <span className="text-[10px] text-text-sub font-medium bg-bg-surface px-2 py-0.5 rounded border border-border-subtle">
                    {status}
                </span>
            </div>
            <p className="text-xs text-text-sub mb-3">{description}</p>
            {showActions && (
                <div className="flex gap-2">
                    <Button variant="primary" size="sm" className="flex-1" onClick={onApprove}>
                        Approve
                    </Button>
                    <Button variant="secondary" size="sm" className="flex-1" onClick={onReject}>
                        Reject
                    </Button>
                </div>
            )}
        </div>
    )
}
