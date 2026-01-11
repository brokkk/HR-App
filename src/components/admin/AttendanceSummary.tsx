import { ArrowRight, TrendingUp } from 'lucide-react'

interface AttendanceSummaryProps {
    percentage: number
    change?: number
}

export function AttendanceSummary({ percentage, change = 0 }: AttendanceSummaryProps) {
    return (
        <div className="relative w-full h-64 rounded-3xl overflow-hidden shadow-glow group">
            {/* Background Gradient */}
            <div className="absolute inset-0 gradient-primary" />

            {/* Decorative Patterns */}
            <div className="absolute right-0 bottom-0 opacity-10">
                <svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="300" cy="300" r="150" stroke="white" strokeWidth="40" />
                    <circle cx="300" cy="300" r="250" stroke="white" strokeWidth="20" />
                </svg>
            </div>

            <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-white text-lg font-medium opacity-90">Attendance summary</h2>
                        <div className="flex items-baseline gap-3 mt-1">
                            <span className="text-6xl font-bold text-white tracking-tight">{percentage}%</span>
                            {change !== 0 && (
                                <span className="text-accent-lime font-bold flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg backdrop-blur-sm border border-white/10">
                                    <TrendingUp className="w-4 h-4" />
                                    {change > 0 ? '+' : ''}{change}%
                                </span>
                            )}
                        </div>
                    </div>
                    <button className="bg-accent-lime hover:bg-[#cbf540] text-text-main rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95">
                        <ArrowRight className="w-6 h-6" />
                    </button>
                </div>

                {/* Sparkline */}
                <div className="w-full flex items-end gap-1 h-16 opacity-80">
                    <div className="w-full bg-white/20 rounded-t-sm h-[40%]" />
                    <div className="w-full bg-white/30 rounded-t-sm h-[60%]" />
                    <div className="w-full bg-white/20 rounded-t-sm h-[45%]" />
                    <div className="w-full bg-white/30 rounded-t-sm h-[70%]" />
                    <div className="w-full bg-white/20 rounded-t-sm h-[55%]" />
                    <div className="w-full bg-white/40 rounded-t-sm h-[80%]" />
                    <div className="w-full bg-white/20 rounded-t-sm h-[50%]" />
                    <div className="w-full bg-white/30 rounded-t-sm h-[65%]" />
                    <div className="w-full bg-accent-lime rounded-t-sm h-[93%] shadow-[0_0_15px_rgba(213,248,93,0.5)]" />
                    <div className="w-full bg-white/10 rounded-t-sm h-[30%]" />
                    <div className="w-full bg-white/20 rounded-t-sm h-[40%]" />
                    <div className="w-full bg-white/10 rounded-t-sm h-[20%]" />
                </div>
            </div>
        </div>
    )
}
