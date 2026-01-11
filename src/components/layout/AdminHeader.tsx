'use client'

import { Bell, ChevronDown, Sun, Moon } from 'lucide-react'
import { SearchInput } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { useTheme } from '@/components/providers/ThemeProvider'

interface AdminHeaderProps {
    user?: {
        name: string
        role: string
        avatar?: string
    }
}

export function AdminHeader({ user = { name: 'Admin User', role: 'HR Admin' } }: AdminHeaderProps) {
    const { theme, toggleTheme } = useTheme()

    return (
        <header className="h-20 px-8 flex items-center justify-between shrink-0 bg-bg-page">
            {/* Search */}
            <div className="flex-1 max-w-xl">
                <SearchInput placeholder="Search employee, request, date..." />
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-4">
                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-full hover:bg-bg-surface text-text-sub hover:text-text-main transition-all"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? (
                        <Sun className="w-5 h-5" />
                    ) : (
                        <Moon className="w-5 h-5" />
                    )}
                </button>

                {/* Notifications */}
                <button className="relative p-2 rounded-full hover:bg-bg-surface text-text-sub hover:text-text-main transition-all">
                    <Bell className="w-6 h-6" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-bg-page" />
                </button>

                {/* User Profile */}
                <div className="flex items-center gap-3 pl-4 border-l border-border-subtle">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold text-text-main">{user.name}</p>
                        <p className="text-xs text-text-sub">{user.role}</p>
                    </div>
                    <button className="rounded-full p-0.5 border-2 border-bg-surface shadow-sm">
                        <Avatar src={user.avatar} name={user.name} size="md" />
                    </button>
                    <ChevronDown className="w-5 h-5 text-text-sub cursor-pointer" />
                </div>
            </div>
        </header>
    )
}
