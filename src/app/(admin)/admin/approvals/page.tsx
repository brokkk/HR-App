import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { ApprovalsClient } from './ApprovalsClient'
import { Loader2 } from 'lucide-react'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

function LoadingFallback() {
    return (
        <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    )
}

export default async function AdminApprovalsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check if user is admin OR has lead/hr/owner role
    const isAdmin = ADMIN_EMAILS.includes(user.email || '')

    if (!isAdmin) {
        // Check employee role
        const { data: employee } = await supabase
            .from('employees')
            .select('role')
            .eq('id', user.id)
            .single()

        const allowedRoles = ['lead', 'hr', 'owner']
        if (!employee || !allowedRoles.includes(employee.role)) {
            redirect('/home')
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">Approvals</h1>
                <p className="text-text-sub mt-1">Review and approve pending requests</p>
            </div>

            <Suspense fallback={<LoadingFallback />}>
                <ApprovalsClient />
            </Suspense>
        </div>
    )
}
