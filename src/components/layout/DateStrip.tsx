'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface DateStripProps {
    selectedDate: Date
    onDateChange: (date: Date) => void
}

function getDaysAround(date: Date, range: number = 2): Date[] {
    const days: Date[] = []
    for (let i = -range; i <= range; i++) {
        const d = new Date(date)
        d.setDate(d.getDate() + i)
        days.push(d)
    }
    return days
}

function formatDay(date: Date): { day: string; num: string } {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return {
        day: days[date.getDay()],
        num: date.getDate().toString().padStart(2, '0'),
    }
}

function isSameDay(a: Date, b: Date): boolean {
    return a.toDateString() === b.toDateString()
}

function isToday(date: Date): boolean {
    return isSameDay(date, new Date())
}

export function DateStrip({ selectedDate, onDateChange }: DateStripProps) {
    const days = getDaysAround(selectedDate)

    const goToToday = () => onDateChange(new Date())
    const goBack = () => {
        const newDate = new Date(selectedDate)
        newDate.setDate(newDate.getDate() - 1)
        onDateChange(newDate)
    }
    const goForward = () => {
        const newDate = new Date(selectedDate)
        newDate.setDate(newDate.getDate() + 1)
        onDateChange(newDate)
    }

    return (
        <div className="bg-bg-surface rounded-full p-1.5 shadow-sm border border-border-subtle flex items-center gap-1 overflow-x-auto max-w-full">
            <button
                onClick={goBack}
                className="p-2 rounded-full hover:bg-bg-page text-text-sub"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
                {days.map((date) => {
                    const { day, num } = formatDay(date)
                    const isSelected = isSameDay(date, selectedDate)

                    return (
                        <button
                            key={date.toISOString()}
                            onClick={() => onDateChange(date)}
                            className={`flex flex-col items-center justify-center w-10 h-10 rounded-full text-xs font-medium transition-all ${isSelected
                                ? 'bg-primary text-white shadow-md'
                                : 'text-text-sub hover:bg-bg-page'
                                }`}
                        >
                            <span className={`text-[10px] uppercase ${isSelected ? 'opacity-80' : ''}`}>{day}</span>
                            <span className="font-bold text-sm">{num}</span>
                        </button>
                    )
                })}
            </div>

            <button
                onClick={goForward}
                className="p-2 rounded-full hover:bg-bg-page text-text-sub"
            >
                <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-border-subtle mx-2" />

            <button
                onClick={goToToday}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${isToday(selectedDate)
                    ? 'bg-primary text-white'
                    : 'bg-bg-page text-text-main hover:bg-gray-200'
                    }`}
            >
                Today
            </button>
        </div>
    )
}
