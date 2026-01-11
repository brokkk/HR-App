import { Bell } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

interface MobileHeaderProps {
    userName: string
    greeting?: string
    subtitle?: string
    avatar?: string
}

export function MobileHeader({
    userName,
    greeting = 'Good morning',
    subtitle = "Here's your workday summary",
    avatar
}: MobileHeaderProps) {
    return (
        <header className="flex flex-col px-6 pt-10 pb-4">
            <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-text-main text-[28px] font-bold leading-tight tracking-tight">
                        {greeting},<br />{userName}!
                    </h1>
                    <p className="text-text-sub text-sm font-medium tracking-wide">{subtitle}</p>
                </div>
                <div className="flex items-center gap-4">
                    <button className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white border border-border-subtle shadow-sm transition hover:bg-gray-50">
                        <Bell className="w-6 h-6 text-text-sub" />
                        <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                    </button>
                    <Avatar src={avatar} name={userName} size="md" className="border border-border-subtle shadow-sm" />
                </div>
            </div>
        </header>
    )
}
