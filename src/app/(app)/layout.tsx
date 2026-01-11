import { requireAuth } from '@/lib/auth/requireAuth'
import { MobileNav } from '@/components/layout/MobileNav'

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side auth check - redirects to /login if not authenticated
    await requireAuth()

    return (
        <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-bg-page pb-20">
            {children}
            <MobileNav />
        </div>
    )
}
