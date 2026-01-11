import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DevToolsClient } from './DevToolsClient'
import { Badge } from '@/components/ui/Badge'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export default async function AdminDevToolsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        redirect('/home')
    }

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold text-text-main tracking-tight">Dev Tools</h1>
                        <Badge variant="warning">Development Only</Badge>
                    </div>
                    <p className="text-text-sub mt-1">Generate demo data for testing dashboards and flows</p>
                </div>
            </div>

            <DevToolsClient />
        </div>
    )
}
