interface AvatarProps {
    src?: string | null
    name: string
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

const sizeStyles = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
}

const colorPalette = [
    'bg-blue-100 text-blue-600',
    'bg-purple-100 text-purple-600',
    'bg-green-100 text-green-600',
    'bg-orange-100 text-orange-600',
    'bg-pink-100 text-pink-600',
    'bg-yellow-100 text-yellow-700',
]

function getInitials(name: string): string {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
}

function getColorFromName(name: string): string {
    const index = name.charCodeAt(0) % colorPalette.length
    return colorPalette[index]
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
    const initials = getInitials(name)
    const colorClass = getColorFromName(name)

    if (src) {
        return (
            <img
                src={src}
                alt={name}
                className={`${sizeStyles[size]} rounded-full object-cover border border-border-subtle ${className}`}
            />
        )
    }

    return (
        <div
            className={`${sizeStyles[size]} ${colorClass} rounded-full flex items-center justify-center font-bold ${className}`}
            title={name}
        >
            {initials}
        </div>
    )
}
