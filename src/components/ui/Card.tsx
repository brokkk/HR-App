interface CardProps {
    children: React.ReactNode
    className?: string
    variant?: 'surface' | 'bordered'
}

export function Card({ children, className = '', variant = 'surface' }: CardProps) {
    const baseStyles = 'bg-bg-surface rounded-2xl'
    const variantStyles = variant === 'bordered'
        ? 'border border-border-subtle shadow-soft'
        : 'shadow-soft'

    return (
        <div className={`${baseStyles} ${variantStyles} ${className}`}>
            {children}
        </div>
    )
}

interface CardHeaderProps {
    title: string
    subtitle?: string
    action?: React.ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
    return (
        <div className="p-6 border-b border-border-subtle flex justify-between items-center">
            <div>
                <h3 className="font-bold text-text-main text-lg">{title}</h3>
                {subtitle && <p className="text-sm text-text-sub">{subtitle}</p>}
            </div>
            {action}
        </div>
    )
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`p-6 ${className}`}>{children}</div>
}
