'use client'

interface FilterChipsProps {
    options: string[]
    selected: string
    onChange: (value: string) => void
    labels?: Record<string, string>
}

export function FilterChips({ options, selected, onChange, labels }: FilterChipsProps) {
    return (
        <div className="flex items-center gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {options.map((option) => {
                const isActive = option === selected
                const displayLabel = labels?.[option] || option

                return (
                    <button
                        key={option}
                        onClick={() => onChange(option)}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${isActive
                            ? 'bg-text-main text-white shadow-md'
                            : 'border border-border-subtle bg-white text-text-sub'
                            }`}
                    >
                        {displayLabel}
                    </button>
                )
            })}
        </div>
    )
}
