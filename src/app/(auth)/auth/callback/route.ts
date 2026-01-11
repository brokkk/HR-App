import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/home'

    // Determine safe origin
    let origin = new URL(request.url).origin
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto')

    if (forwardedHost) {
        origin = `${forwardedProto || 'https'}://${forwardedHost}`
    } else if (origin.includes('0.0.0.0')) {
        origin = 'http://localhost:3000'
    }

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Return to login with error if code exchange failed
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
