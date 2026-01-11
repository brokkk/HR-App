import { InputHTMLAttributes, forwardRef } from 'react'
import { LucideIcon } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    icon?: LucideIcon
    label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ icon: Icon, label, className = '', ...props }, ref) => {
        return (
            <div className="space-y-1.5">
                {label && (
                    <label className="text-xs font-medium text-text-main ml-1">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {Icon && (
                        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-sub" />
                    )}
                    <input
                        ref={ref}
                        className={`w-full bg-white border border-border-subtle text-text-main placeholder-text-sub text-sm rounded-full py-2.5 ${Icon ? 'pl-10' : 'pl-4'} pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all ${className}`}
                        {...props}
                    />
                </div>
            </div>
        )
    }
)

Input.displayName = 'Input'

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
    onSearch?: (value: string) => void
}

export function SearchInput({ className = '', ...props }: SearchInputProps) {
    return (
        <div className="relative group">
            <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-sub group-focus-within:text-primary transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
                type="text"
                className={`w-full pl-11 pr-4 py-2.5 rounded-full border border-border-subtle bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-text-sub shadow-sm transition-all ${className}`}
                {...props}
            />
        </div>
    )
}
