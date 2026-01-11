'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Mail, CheckCircle, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react'

type ViewState = 'form' | 'success'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [sentToEmail, setSentToEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [view, setView] = useState<ViewState>('form')

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const supabase = createClient()

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const rawOrigin = typeof window !== 'undefined' ? window.location.origin : siteUrl
        const origin = rawOrigin.includes('0.0.0.0') ? siteUrl : rawOrigin

        const { error: authError } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${origin}/auth/callback`,
            },
        })

        if (authError) {
            setError(authError.message)
        } else {
            setSentToEmail(email)
            setView('success')
        }

        setLoading(false)
    }

    const handleResend = async () => {
        setLoading(true)
        setError(null)

        const supabase = createClient()

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const rawOrigin = typeof window !== 'undefined' ? window.location.origin : siteUrl
        const origin = rawOrigin.includes('0.0.0.0') ? siteUrl : rawOrigin

        const { error: authError } = await supabase.auth.signInWithOtp({
            email: sentToEmail,
            options: {
                emailRedirectTo: `${origin}/auth/callback`,
            },
        })

        if (authError) {
            setError(authError.message)
        }

        setLoading(false)
    }

    const handleChangeEmail = () => {
        setView('form')
        setEmail(sentToEmail)
        setError(null)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg-page px-4">
            <div className="w-full max-w-md">
                {/* Brand */}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-2xl font-bold text-text-main">HR App</span>
                        <Badge variant="neutral">Agency HR</Badge>
                    </div>
                </div>

                {/* Card */}
                <Card variant="bordered" className="rounded-2xl shadow-lg">
                    <CardContent className="p-8">
                        {view === 'form' ? (
                            <>
                                <div className="text-center mb-6">
                                    <h1 className="text-2xl font-bold text-text-main">Masuk</h1>
                                    <p className="text-text-sub mt-2 text-sm">
                                        Masukkan email kantor, kami kirim link untuk masuk.
                                    </p>
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-danger-bg rounded-xl mb-4">
                                        <AlertTriangle className="w-4 h-4 text-danger-text flex-shrink-0" />
                                        <p className="text-sm text-danger-text">{error}</p>
                                    </div>
                                )}

                                <form onSubmit={handleMagicLink} className="space-y-4">
                                    <div>
                                        <label htmlFor="email" className="block text-sm font-medium text-text-sub mb-2">
                                            Email
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-sub" />
                                            <input
                                                id="email"
                                                name="email"
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full pl-11 pr-4 py-3 bg-bg-surface border border-border-subtle rounded-xl text-text-main placeholder:text-text-sub focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                placeholder="nama@perusahaan.com"
                                            />
                                        </div>
                                    </div>

                                    <Button
                                        type="submit"
                                        disabled={loading || !email}
                                        className="w-full py-3"
                                        icon={loading ? Loader2 : undefined}
                                    >
                                        {loading ? 'Mengirim...' : 'Kirim Link Masuk'}
                                    </Button>
                                </form>

                                <p className="text-center text-xs text-text-sub mt-4">
                                    Link berlaku beberapa menit. Cek folder spam jika tidak masuk.
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="text-center">
                                    <div className="flex items-center justify-center w-16 h-16 bg-success-bg rounded-full mx-auto mb-4">
                                        <CheckCircle className="w-8 h-8 text-success-text" />
                                    </div>
                                    <h2 className="text-xl font-bold text-text-main mb-2">Link sudah dikirim!</h2>
                                    <p className="text-text-sub text-sm mb-1">
                                        Cek inbox email Anda:
                                    </p>
                                    <p className="text-text-main font-medium mb-6">
                                        {sentToEmail}
                                    </p>
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-danger-bg rounded-xl mb-4">
                                        <AlertTriangle className="w-4 h-4 text-danger-text flex-shrink-0" />
                                        <p className="text-sm text-danger-text">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <Button
                                        onClick={handleResend}
                                        disabled={loading}
                                        className="w-full"
                                        icon={loading ? Loader2 : Mail}
                                    >
                                        {loading ? 'Mengirim...' : 'Kirim Ulang'}
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        onClick={handleChangeEmail}
                                        className="w-full"
                                        icon={ArrowLeft}
                                    >
                                        Ganti Email
                                    </Button>
                                </div>

                                <p className="text-center text-xs text-text-sub mt-4">
                                    Klik link di email untuk masuk ke aplikasi.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Footer */}
                <p className="text-center text-xs text-text-sub mt-6">
                    © 2026 HR App. All rights reserved.
                </p>
            </div>
        </div>
    )
}
