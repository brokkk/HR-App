import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DivisionsClient } from './DivisionsClient'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export default async function AdminDivisionsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        redirect('/home')
    }

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">Divisions</h1>
                <p className="text-text-sub mt-1">Manage company divisions and leads</p>
            </div>

            <DivisionsClient />
        </div>
    )
}

