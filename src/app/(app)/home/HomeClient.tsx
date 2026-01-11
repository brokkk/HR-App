'use client'

import { useState, useEffect } from 'react'
import { MapPin, Clock, Wallet, Umbrella, Pill, Timer, Inbox, CheckCircle } from 'lucide-react'
import { MobileHeader } from '@/components/layout/MobileHeader'
import { StatCard } from '@/components/app/StatCard'
import { MetricCard } from '@/components/app/MetricCard'
import { RequestItem } from '@/components/app/RequestItem'
import { FilterChips } from '@/components/app/FilterChips'
import { Button } from '@/components/ui/Button'
import { OutsideAttendanceModal, type DailyData } from '@/components/app/OutsideAttendanceModal'
import Link from 'next/link'
import type { AttendanceDaily, MyRequest } from '@/lib/supabase/queries'

/**
 * Get WIB greeting based on current time
 */
function getGreetingWIB(): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        hour: 'numeric',
        hour12: false,
    })
    const hour = parseInt(formatter.format(new Date()), 10)

    if (hour >= 5 && hour < 11) return 'Selamat Pagi'
    if (hour >= 11 && hour < 15) return 'Selamat Siang'
    if (hour >= 15 && hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
}

interface Props {
    userName: string
    userRole: string
    initialAttendance: AttendanceDaily | null
    initialRequests: MyRequest[]
}

const filterOptions = ['All', 'Pending', 'Approved', 'Rejected']

export function HomeClient({ userName, userRole, initialAttendance, initialRequests }: Props) {
    const [filter, setFilter] = useState('All')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [lastSubmit, setLastSubmit] = useState<Date | null>(null)
    const [greeting, setGreeting] = useState(getGreetingWIB())
    const [todayData, setTodayData] = useState<DailyData | null>(
        initialAttendance as DailyData | null
    )

    // Auto-update greeting every 60 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setGreeting(getGreetingWIB())
        }, 60000)
        return () => clearInterval(interval)
    }, [])

    const filteredRequests = filter === 'All'
        ? initialRequests
        : initialRequests.filter((r) => r.status === filter.toLowerCase())

    const handleSuccess = (dailyData: DailyData | null) => {
        setLastSubmit(new Date())
        if (dailyData) {
            setTodayData(dailyData)
        }
    }

    // Format check-in time for display
    const formatCheckIn = () => {
        if (!todayData?.check_in) return { value: '--:--', period: '', subtitle: 'No check-in yet' }
        const date = new Date(todayData.check_in)
        const hours = date.getHours()
        const minutes = date.getMinutes().toString().padStart(2, '0')
        const period = hours >= 12 ? 'PM' : 'AM'
        const displayHours = hours > 12 ? hours - 12 : hours || 12
        return {
            value: `${displayHours.toString().padStart(2, '0')}:${minutes}`,
            period,
            subtitle: 'Check-in Success'
        }
    }

    // Format today's date
    const formatTodayDate = () => {
        const now = new Date()
        return `Today, ${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'short' })}`
    }

    const formatRequestDate = (req: MyRequest) => {
        const start = new Date(req.start_date)
        const startStr = `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}`
        if (req.end_date && req.end_date !== req.start_date) {
            const end = new Date(req.end_date)
            return `${startStr} - ${end.toLocaleDateString('en-US', { month: 'short' })} ${end.getDate()}`
        }
        return startStr
    }

    const getRequestIcon = (type: string) => {
        switch (type) {
            case 'leave':
                return { icon: Umbrella, bgColor: 'bg-purple-50', color: 'text-purple-600', label: 'Leave' }
            case 'overtime':
                return { icon: Timer, bgColor: 'bg-blue-50', color: 'text-primary', label: 'Overtime' }
            default:
                return { icon: Pill, bgColor: 'bg-gray-50', color: 'text-gray-600', label: type }
        }
    }

    const checkInDisplay = formatCheckIn()

    return (
        <>
            <MobileHeader userName={userName} greeting={greeting} />

            {/* Primary Action Buttons */}
            <section className="px-6 py-2 flex flex-col gap-3">
                <Button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full py-4 bg-[#1e293b] hover:bg-[#334155] rounded-full shadow-lg"
                >
                    <MapPin className="w-5 h-5" />
                    <span className="font-bold tracking-wide">+ Absen Luar Kantor</span>
                </Button>
                <Link href="/late-permission/new" className="w-full">
                    <Button
                        variant="secondary"
                        className="w-full py-4 rounded-full"
                    >
                        <Clock className="w-5 h-5" />
                        <span className="font-semibold">Izin Datang Telat</span>
                    </Button>
                </Link>

                {/* Approval button for Lead/HR/Owner */}
                {['lead', 'hr', 'owner'].includes(userRole) && (
                    <Link href="/approvals" className="w-full">
                        <Button
                            variant="secondary"
                            className="w-full py-4 rounded-full border-2 border-primary/20"
                        >
                            <CheckCircle className="w-5 h-5 text-primary" />
                            <span className="font-semibold">Approval Permintaan</span>
                        </Button>
                    </Link>
                )}

                <p className="mt-1 text-center text-xs text-text-sub">
                    {lastSubmit
                        ? `Terakhir absen: ${lastSubmit.toLocaleTimeString('id-ID')}`
                        : 'Izin telat untuk hari ini saja'
                    }
                </p>
            </section>

            {/* Today Overview Section */}
            <section className="flex flex-col gap-4 px-6 py-6">
                <StatCard
                    date={formatTodayDate()}
                    title="Attendance Today"
                    value={checkInDisplay.value}
                    period={checkInDisplay.period}
                    subtitle={checkInDisplay.subtitle}
                />

                <div className="grid grid-cols-2 gap-4">
                    <MetricCard
                        title="Late Status"
                        value={todayData ? `${todayData.late_minutes} min` : '-- min'}
                        icon={Clock}
                        iconBgColor={todayData?.is_penalized ? 'bg-red-50' : 'bg-orange-50'}
                        iconColor={todayData?.is_penalized ? 'text-red-500' : 'text-orange-500'}
                        badge={
                            todayData
                                ? todayData.is_penalized
                                    ? { text: 'Late', color: 'bg-red-50 text-red-700' }
                                    : todayData.is_late
                                        ? { text: 'Grace period', color: 'bg-orange-50 text-orange-700' }
                                        : { text: 'On time', color: 'bg-green-50 text-green-700' }
                                : undefined
                        }
                    />
                    <MetricCard
                        title="Penalty"
                        value={todayData ? `Rp ${(todayData.penalty_amount ?? 0).toLocaleString('id-ID')}` : 'Rp --'}
                        icon={Wallet}
                        iconBgColor={(todayData?.penalty_amount ?? 0) > 0 ? 'bg-red-50' : 'bg-blue-50'}
                        iconColor={(todayData?.penalty_amount ?? 0) > 0 ? 'text-red-500' : 'text-primary'}
                        subtitle={(todayData?.penalty_amount ?? 0) > 0 ? 'Penalized' : 'Safe zone'}
                    />
                </div>
            </section>

            {/* Requests Section */}
            <section className="flex flex-col gap-4 px-6 pb-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-text-main">Requests</h3>
                    <Link href="/requests" className="text-sm font-semibold text-primary hover:text-primary-dark">
                        See all
                    </Link>
                </div>

                <FilterChips options={filterOptions} selected={filter} onChange={setFilter} />

                <div className="flex flex-col gap-3">
                    {filteredRequests.length === 0 ? (
                        <div className="py-8 text-center">
                            <Inbox className="w-10 h-10 text-text-sub mx-auto mb-2" />
                            <p className="text-text-sub text-sm">No requests</p>
                        </div>
                    ) : (
                        filteredRequests.map((request) => {
                            const reqStyle = getRequestIcon(request.type)
                            return (
                                <RequestItem
                                    key={request.id}
                                    type={reqStyle.label}
                                    typeIcon={reqStyle.icon}
                                    iconBgColor={reqStyle.bgColor}
                                    iconColor={reqStyle.color}
                                    dateRange={formatRequestDate(request)}
                                    status={request.status as 'pending' | 'approved' | 'rejected'}
                                />
                            )
                        })
                    )}
                </div>
            </section>

            {/* Outside Attendance Modal */}
            <OutsideAttendanceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={handleSuccess}
            />
        </>
    )
}
