import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AuditLogClient } from './AuditLogClient'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export default async function AdminAuditLogPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        redirect('/home')
    }

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">Audit Log</h1>
                <p className="text-text-sub mt-1">Track all important actions in the system</p>
            </div>

            <Suspense fallback={<div className="animate-pulse h-96 bg-bg-page rounded-xl" />}>
                <AuditLogClient />
            </Suspense>
        </div>
    )
}
