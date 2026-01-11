import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Fetch employee profile
    const { data: employee } = await supabase
        .from('employees')
        .select('id, full_name, role, division_id, created_at')
        .eq('id', user.id)
        .single()

    // Fetch division name if assigned
    let division_name: string | null = null
    if (employee?.division_id) {
        const { data: division } = await supabase
            .from('divisions')
            .select('name')
            .eq('id', employee.division_id)
            .single()
        division_name = division?.name || null
    }

    const profile = {
        id: user.id,
        full_name: employee?.full_name || null,
        email: user.email || '',
        role: employee?.role || 'employee',
        division_name,
        created_at: employee?.created_at || user.created_at || new Date().toISOString(),
    }

    return <ProfileClient initialProfile={profile} />
}
