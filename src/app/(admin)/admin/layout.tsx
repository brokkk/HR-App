import { requireRole } from '@/lib/auth/requireRole'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { AdminHeader } from '@/components/layout/AdminHeader'

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side role check - redirects to /home if not admin
    const user = await requireRole('admin')

    return (
        <div className="h-screen flex overflow-hidden bg-bg-page">
            <AdminSidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <AdminHeader user={{ name: user.email || 'Admin', role: 'HR Admin' }} />
                <div className="flex-1 overflow-y-auto p-8 pt-2">
                    <div className="max-w-[1400px] mx-auto">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}
