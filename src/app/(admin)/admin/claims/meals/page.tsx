import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { MealClaimsClient } from './MealClaimsClient'
import { Loader2 } from 'lucide-react'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

function LoadingFallback() {
    return (
        <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    )
}

export default async function AdminMealClaimsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        redirect('/home')
    }

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-text-main tracking-tight">Meal Claims</h1>
                <p className="text-text-sub mt-1">Uang makan lembur claims</p>
            </div>

            <Suspense fallback={<LoadingFallback />}>
                <MealClaimsClient />
            </Suspense>
        </div>
    )
}
