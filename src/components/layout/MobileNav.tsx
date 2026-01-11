'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, FileText, MessageCircle, User } from 'lucide-react'

interface NavItem {
    label: string
    href: string
    icon: React.ReactNode
}

const navItems: NavItem[] = [
    { label: 'Home', href: '/home', icon: <Home className="w-6 h-6" /> },
    { label: 'Attendance', href: '/attendance', icon: <Calendar className="w-6 h-6" /> },
    { label: 'Requests', href: '/requests', icon: <FileText className="w-6 h-6" /> },
    { label: 'Chat HR', href: '/chat', icon: <MessageCircle className="w-6 h-6" /> },
    { label: 'Profile', href: '/profile', icon: <User className="w-6 h-6" /> },
]

export function MobileNav() {
    const pathname = usePathname()

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-bg-surface border-t border-border-subtle shadow-lg z-50">
            <div className="max-w-[480px] mx-auto px-4 py-2">
                <div className="flex justify-between items-center">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-colors ${isActive ? 'text-primary' : 'text-text-sub hover:text-text-main'
                                    }`}
                            >
                                {item.icon}
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </Link>
                        )
                    })}
                </div>
            </div>
        </nav>
    )
}
