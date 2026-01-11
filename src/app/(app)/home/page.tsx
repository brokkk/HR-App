import { redirect } from 'next/navigation'
import { getMyProfile, getMyTodayAttendance, getMyRecentRequests } from '@/lib/supabase/queries'
import { HomeClient } from './HomeClient'

export default async function HomePage() {
    // Fetch real data
    const [profileResult, attendanceResult, requestsResult] = await Promise.all([
        getMyProfile(),
        getMyTodayAttendance(),
        getMyRecentRequests(5),
    ])

    if (!profileResult.data) {
        redirect('/login')
    }

    const displayName = profileResult.data.full_name || 'Hello'
    const firstName = displayName.split(' ')[0]
    const userRole = profileResult.data.role

    return (
        <HomeClient
            userName={firstName}
            userRole={userRole}
            initialAttendance={attendanceResult.data}
            initialRequests={requestsResult.data}
        />
    )
}
