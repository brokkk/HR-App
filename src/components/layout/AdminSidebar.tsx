'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    CheckCircle,
    Upload,
    Users,
    Layers,
    FileText,
    MessageCircle,
    Settings,
    AlertTriangle,
    Shield,
    Wrench,
    UtensilsCrossed,
    FolderKanban,
    Clock,
    type LucideIcon
} from 'lucide-react'

interface NavItem {
    label: string
    href: string
    icon: LucideIcon
    devOnly?: boolean
}

const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Approvals', href: '/admin/approvals', icon: CheckCircle },
    { label: 'Attendance Import', href: '/admin/attendance/import', icon: Upload },
    { label: 'Exceptions', href: '/admin/exceptions', icon: AlertTriangle },
    { label: 'Approval History', href: '/admin/approval-history', icon: Clock },
    { label: 'Meal Claims', href: '/admin/claims/meals', icon: UtensilsCrossed },
    { label: 'Projects', href: '/admin/projects', icon: FolderKanban },
    { label: 'Employees', href: '/admin/employees', icon: Users },
    { label: 'Divisions', href: '/admin/divisions', icon: Layers },
    { label: 'Reports', href: '/admin/reports', icon: FileText },
    { label: 'Audit Log', href: '/admin/audit-log', icon: Shield },
    { label: 'Chat HR', href: '/admin/chat', icon: MessageCircle },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
    { label: 'Dev Tools', href: '/admin/dev-tools', icon: Wrench, devOnly: true },
]

const isDev = process.env.NODE_ENV !== 'production'

export function AdminSidebar() {
    const pathname = usePathname()

    const filteredItems = navItems.filter(item => !item.devOnly || isDev)

    return (
        <aside className="hidden md:flex flex-col w-72 h-[calc(100vh-2rem)] m-4 bg-bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-y-auto shrink-0">
            {/* Logo */}
            <div className="p-6 flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-xl shadow-lg">
                    HR
                </div>
                <h1 className="text-xl font-bold tracking-tight text-text-main">HRFlow</h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-1">
                {filteredItems.map((item) => {
                    const isActive = pathname === item.href ||
                        (item.href !== '/admin' && pathname.startsWith(item.href))
                    const Icon = item.icon

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-full transition-colors group ${isActive
                                ? 'bg-accent-lime shadow-sm'
                                : 'hover:bg-bg-page text-text-sub hover:text-text-main'
                                }`}
                        >
                            <Icon className={`w-6 h-6 ${isActive ? 'text-text-main' : 'group-hover:text-primary'}`} />
                            <span className={`text-sm ${isActive ? 'font-semibold text-text-main' : 'font-medium'}`}>
                                {item.label}
                            </span>
                        </Link>
                    )
                })}
            </nav>

            {/* Support Card */}
            <div className="p-4 mt-auto">
                <div className="rounded-2xl bg-gradient-to-br from-[#101828] to-[#1e293b] p-4 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-2 -mr-2 w-16 h-16 bg-white opacity-5 rounded-full blur-xl" />
                    <p className="text-xs font-medium text-gray-400 mb-1">Support</p>
                    <p className="text-sm font-semibold mb-3">Need help?</p>
                    <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold transition-colors">
                        Contact Admin
                    </button>
                </div>
            </div>
        </aside>
    )
}

