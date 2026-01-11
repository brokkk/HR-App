type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps {
    variant?: BadgeVariant
    children: React.ReactNode
    dot?: boolean
    className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
    success: 'bg-success-bg text-success-text',
    warning: 'bg-warning-bg text-warning-text',
    danger: 'bg-danger-bg text-danger-text',
    info: 'bg-info-bg text-info-text',
    neutral: 'bg-bg-page text-text-sub border border-border-subtle',
}

const dotStyles: Record<BadgeVariant, string> = {
    success: 'bg-success-text',
    warning: 'bg-warning-text',
    danger: 'bg-danger-text',
    info: 'bg-info-text',
    neutral: 'bg-text-sub',
}

export function Badge({ variant = 'neutral', children, dot = false, className = '' }: BadgeProps) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}>
            {dot && <span className={`w-1.5 h-1.5 rounded-full mr-2 ${dotStyles[variant]}`} />}
            {children}
        </span>
    )
}
