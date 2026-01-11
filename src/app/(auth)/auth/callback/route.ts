import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') ?? '/home'

    // Determine safe origin
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    let origin = new URL(request.url).origin
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto')

    if (forwardedHost) {
        origin = `${forwardedProto || 'https'}://${forwardedHost}`
    } else if (origin.includes('0.0.0.0')) {
        origin = siteUrl
    }

    const supabase = await createClient()

    // Handle code exchange (OAuth flow)
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Handle token_hash (Magic link flow)
    if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as 'email' | 'magiclink',
        })
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Return to login with error if auth failed
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
