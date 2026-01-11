import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { MessageCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ChatPage() {
    return (
        <div className="px-6 py-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-text-main">Chat HR</h1>
                        <Badge variant="warning">Coming soon</Badge>
                    </div>
                    <p className="text-sm text-text-sub">Contact HR team</p>
                </div>
            </div>

            <Card variant="bordered">
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
                        <Link href="/home">
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
