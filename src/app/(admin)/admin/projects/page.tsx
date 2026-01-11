import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectsClient } from './ProjectsClient'
import { Loader2 } from 'lucide-react'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

function LoadingFallback() {
    return (
        <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    )
}

export default async function AdminProjectsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check HR/Owner access
    const isAdmin = ADMIN_EMAILS.includes(user.email || '')
    if (!isAdmin) {
        const { data: employee } = await supabase
            .from('employees')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!employee || !['hr', 'owner'].includes(employee.role)) {
            redirect('/home')
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">Proyek</h1>
                <p className="text-text-sub mt-1">Kelola proyek untuk permintaan lembur</p>
            </div>

            <Suspense fallback={<LoadingFallback />}>
                <ProjectsClient />
            </Suspense>
        </div>
    )
}
