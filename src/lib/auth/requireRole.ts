import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Role = 'admin' | 'user'

// Get admin emails from environment variable
function getAdminEmails(): string[] {
    const adminEmails = process.env.ADMIN_EMAILS || ''
    return adminEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
}

export async function requireRole(role: Role) {
    const supabase = await createClient()

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        redirect('/login')
    }

    if (role === 'admin') {
        const adminEmails = getAdminEmails()
        const userEmail = user.email?.toLowerCase() || ''

        // If no admin emails configured or user not in list, redirect to home
        if (adminEmails.length === 0 || !adminEmails.includes(userEmail)) {
            redirect('/home')
        }
    }

    return user
}
