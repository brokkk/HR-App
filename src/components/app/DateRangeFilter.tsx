'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

interface DateRange {
    startDate: string
    endDate: string
}

interface DateRangeFilterProps {
    value: DateRange | null
    onChange: (range: DateRange | null) => void
    showPresets?: boolean
}

type Preset = 'today' | 'week' | 'month' | '3months' | 'all'

const presetLabels: Record<Preset, string> = {
    today: 'Hari Ini',
    week: 'Minggu Ini',
    month: 'Bulan Ini',
    '3months': '3 Bulan',
    all: 'Semua',
}

function getStartOfWeek(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d
}

// Format date to YYYY-MM-DD in local timezone (avoids UTC conversion issues)
function formatLocalDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getPresetRange(preset: Preset): DateRange | null {
    const now = new Date()
    const today = formatLocalDate(now)

    switch (preset) {
        case 'today':
            return { startDate: today, endDate: today }
        case 'week': {
            const start = getStartOfWeek(now)
            return {
                startDate: formatLocalDate(start),
                endDate: today
            }
        }
        case 'month': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1)
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
            return {
                startDate: formatLocalDate(start),
                endDate: formatLocalDate(end)
            }
        }
        case '3months': {
            const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
            return {
                startDate: formatLocalDate(start),
                endDate: today
            }
        }
        case 'all':
            return null
    }
}

// Parse YYYY-MM-DD as local date (not UTC)
function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day)
}

function getMonthRange(year: number, month: number): DateRange {
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0)
    return {
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end)
    }
}

const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

export function DateRangeFilter({ value, onChange, showPresets = true }: DateRangeFilterProps) {
    const [showDropdown, setShowDropdown] = useState(false)

    // Determine current month from value or today (using local date parsing)
    const currentDate = useMemo(() => {
        if (value?.startDate) {
            return parseLocalDate(value.startDate)
        }
        return new Date()
    }, [value])

    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth()

    const handlePresetSelect = (preset: Preset) => {
        onChange(getPresetRange(preset))
        setShowDropdown(false)
    }

    const handleMonthNav = (delta: number) => {
        // Use Date object to handle year boundaries correctly
        const newDate = new Date(currentYear, currentMonth + delta, 1)
        onChange(getMonthRange(newDate.getFullYear(), newDate.getMonth()))
    }

    const displayLabel = useMemo(() => {
        if (!value) return 'Semua Waktu'
        return `${monthNames[currentMonth]} ${currentYear}`
    }, [value, currentMonth, currentYear])

    return (
        <div className="flex flex-col gap-2">
            {/* Presets + Month Navigator */}
            <div className="flex items-center gap-2">
                {showPresets && (
                    <div className="relative">
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-main 
                                       bg-white border border-border-subtle rounded-lg hover:bg-bg-page"
                        >
                            <Calendar className="w-4 h-4 text-text-sub" />
                            <span>{value ? 'Custom' : 'Semua'}</span>
                        </button>

                        {showDropdown && (
                            <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border-subtle 
                                           rounded-lg shadow-lg py-1 min-w-[140px]">
                                {(Object.keys(presetLabels) as Preset[]).map((preset) => (
                                    <button
                                        key={preset}
                                        onClick={() => handlePresetSelect(preset)}
                                        className="w-full px-4 py-2 text-left text-sm text-text-main 
                                                   hover:bg-bg-page transition-colors"
                                    >
                                        {presetLabels[preset]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Month Navigator */}
                <div className="flex items-center gap-1 flex-1 justify-center">
                    <button
                        onClick={() => handleMonthNav(-1)}
                        className="p-2 rounded-lg hover:bg-bg-page text-text-sub transition-colors"
                        aria-label="Previous month"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <span className="text-sm font-medium text-text-main min-w-[140px] text-center">
                        {displayLabel}
                    </span>

                    <button
                        onClick={() => handleMonthNav(1)}
                        className="p-2 rounded-lg hover:bg-bg-page text-text-sub transition-colors"
                        aria-label="Next month"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Date Range Display */}
            {value && (
                <p className="text-xs text-text-sub text-center">
                    {new Date(value.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    {' - '}
                    {new Date(value.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
            )}
        </div>
    )
}
