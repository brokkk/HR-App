import { ButtonHTMLAttributes, forwardRef } from 'react'
import { LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    icon?: LucideIcon
    iconPosition?: 'left' | 'right'
}

const variantStyles: Record<ButtonVariant, string> = {
    primary: 'bg-primary hover:bg-primary-dark text-white shadow-sm',
    secondary: 'bg-bg-surface border border-border-subtle text-text-main hover:bg-bg-page',
    ghost: 'bg-transparent text-text-sub hover:text-primary hover:bg-bg-page',
    danger: 'bg-danger-bg text-danger-text hover:bg-red-100',
}

const sizeStyles: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm',
    icon: 'p-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', icon: Icon, iconPosition = 'left', children, className = '', ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:pointer-events-none'

        return (
            <button
                ref={ref}
                className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
                {...props}
            >
                {Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
                {children}
                {Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
            </button>
        )
    }
)

Button.displayName = 'Button'
