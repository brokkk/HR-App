import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import { Loader2 } from 'lucide-react'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

function LoadingFallback() {
    return (
        <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    )
}

export default async function AdminDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        redirect('/home')
    }

    return (
        <Suspense fallback={<LoadingFallback />}>
            <DashboardClient />
        </Suspense>
    )
}

