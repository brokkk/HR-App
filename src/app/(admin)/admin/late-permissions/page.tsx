import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LatePermissionsClient } from './LatePermissionsClient'
import { Loader2 } from 'lucide-react'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export default async function AdminLatePermissionsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check HR/Owner access
    const isAdmin = ADMIN_EMAILS.includes(user.email || '')
    if (!isAdmin) {
        const { data: emp } = await supabase
            .from('employees')
            .select('role')
            .eq('id', user.id)
            .single()

        if (emp?.role !== 'hr' && emp?.role !== 'owner') {
            redirect('/admin')
        }
    }

    return (
        <Suspense fallback={
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        }>
            <LatePermissionsClient />
        </Suspense>
    )
}
