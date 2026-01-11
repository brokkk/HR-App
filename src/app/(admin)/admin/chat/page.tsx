import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { MessageCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function AdminChatPage() {
    return (
        <div className="flex flex-col gap-8">
            <div>
                <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold text-text-main tracking-tight">Chat HR</h1>
                    <Badge variant="warning">Coming soon</Badge>
                </div>
                <p className="text-text-sub mt-1">Communicate with employees</p>
            </div>

            <Card variant="bordered" className="max-w-lg mx-auto">
                <CardContent className="py-12 text-center">
                    <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                        <MessageCircle className="w-10 h-10 text-primary" />
                    </div>

                    <h3 className="text-xl font-bold text-text-main mb-2">Chat HR</h3>
                    <p className="text-text-sub mb-6">
                        Fitur chat HR akan tersedia setelah semua modul stabil.
                    </p>

                    <div className="flex flex-col gap-3">
                        <Button disabled className="w-full opacity-50 cursor-not-allowed">
                            Mulai Chat
                        </Button>
                        <Link href="/admin">
                            <Button variant="secondary" className="w-full" icon={ArrowLeft}>
                                Kembali
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
